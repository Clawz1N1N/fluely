// Structured output protocol parser.
//
// The model is instructed (via the system prompt) to wrap
// its output in:
//   <main>…</main>   primary answer
//   <side>…</side>   secondary analysis
//   <speak>…</speak> a detailed plain-language explanation
//
// The parser is tolerant:
//   * tags split across chunks are reassembled,
//   * missing/unclosed tags are handled,
//   * untagged text goes to MAIN,
//   * only exact tag names are special (so LaTeX with
//     `<` or `|x|` is safe).

use serde::Serialize;

/// Parsed structured output.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct StructuredOutput {
    pub main: String,
    pub side: String,
    pub speak: String,
}

/// The three special tags.
const TAGS: [&str; 3] = ["main", "side", "speak"];

/// Parse a complete (buffered) model output.
pub fn parse(text: &str) -> StructuredOutput {
    let mut out = StructuredOutput::default();
    // Accumulate untagged text into MAIN.
    let mut untagged = String::new();

    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            // Try to match an opening tag.
            if let Some((tag, close_idx)) = match_open_tag(text, i) {
                // Find the matching closing tag.
                let close_marker = format!("</{}>", tag);
                if let Some(end) = text[close_idx..].find(&close_marker) {
                    let content = &text[close_idx..close_idx + end];
                    assign(&mut out, &tag, content);
                    i = close_idx + end + close_marker.len();
                    continue;
                } else {
                    // Unclosed tag: take the rest as content.
                    let content = &text[close_idx..];
                    assign(&mut out, &tag, content);
                    break;
                }
            }
        }
        // Not a special opening tag: accumulate.
        untagged.push(bytes[i] as char);
        i += 1;
    }

    // Untagged text goes to MAIN.
    if !untagged.trim().is_empty() {
        if out.main.trim().is_empty() {
            out.main = untagged.trim().to_string();
        } else {
            out.main = format!("{}\n{}", out.main.trim(), untagged.trim());
        }
    }
    out
}

/// Assign a tag's content to the right field.
fn assign(out: &mut StructuredOutput, tag: &str, content: &str) {
    match tag {
        "main" => out.main = content.trim().to_string(),
        "side" => out.side = content.trim().to_string(),
        "speak" => out.speak = content.trim().to_string(),
        _ => {}
    }
}

/// If the byte at `i` is the start of one of the special
/// opening tags, return (tag, index just past the tag).
fn match_open_tag(text: &str, i: usize) -> Option<(&'static str, usize)> {
    let rest = &text[i..];
    for tag in TAGS {
        let open = format!("<{}>", tag);
        if rest.starts_with(&open) {
            // Make sure it is not a longer tag like
            // "<mainx>" (exact-name rule).
            return Some((tag_static(tag), i + open.len()));
        }
    }
    None
}

fn tag_static(tag: &str) -> &'static str {
    match tag {
        "main" => "main",
        "side" => "side",
        "speak" => "speak",
        _ => "",
    }
}

/// A streaming parser: feed chunks; yields the fields
/// that have been fully closed so far.
pub struct StreamingParser {
    buffer: String,
    /// Fields already emitted (complete).
    done: [bool; 3],
}

impl StreamingParser {
    pub fn new() -> Self {
        StreamingParser {
            buffer: String::new(),
            done: [false, false, false],
        }
    }

    /// Feed a chunk. Returns the current best-known
    /// Feed a chunk. Returns the current best-known
    /// structured output.
    ///
    /// MAIN is shown as soon as any text is present
    /// (tagged or not) so streaming answers appear
    /// immediately. SIDE and SPEAK are only shown
    /// once their closing tag has arrived, so a
    /// half-received tag does not flash.
    pub fn feed(&mut self, chunk: &str) -> StructuredOutput {
        self.buffer.push_str(chunk);
        let parsed = parse(&self.buffer);
        let mut out = parsed.clone();
        for (idx, tag) in TAGS.iter().enumerate() {
            let close = format!("</{}>", tag);
            if self.buffer.contains(&close) {
                self.done[idx] = true;
            }
        }
        // Keep SIDE / SPEAK empty until their tag closed.
        if !self.done[1] {
            out.side = String::new();
        }
        if !self.done[2] {
            out.speak = String::new();
        }
        out
    }
}

impl Default for StreamingParser {
    fn default() -> Self {
        Self::new()
    }
}

// --------------------------- unit tests ---------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_all_three_tags() {
        let text = "<main>Answer</main><side>Analysis</side><speak>Explain</speak>";
        let out = parse(text);
        assert_eq!(out.main, "Answer");
        assert_eq!(out.side, "Analysis");
        assert_eq!(out.speak, "Explain");
    }

    #[test]
    fn parse_untagged_goes_to_main() {
        let out = parse("Just a plain answer");
        assert_eq!(out.main, "Just a plain answer");
        assert!(out.side.is_empty());
    }

    #[test]
    fn parse_missing_side() {
        let out = parse("<main>A</main><speak>S</speak>");
        assert_eq!(out.main, "A");
        assert!(out.side.is_empty());
        assert_eq!(out.speak, "S");
    }

    #[test]
    fn parse_unclosed_tag_takes_rest() {
        let out = parse("<main>Unclosed content");
        assert_eq!(out.main, "Unclosed content");
    }

    #[test]
    fn parse_latex_angle_brackets_untouched() {
        // LaTeX with < and |x| is not a special tag.
        let out = parse("<main>Use $x < y$ and $|x|$</main>");
        assert_eq!(out.main, "Use $x < y$ and $|x|$");
    }

    #[test]
    fn parse_tag_split_across_chunks_streaming() {
        let mut p = StreamingParser::new();
        // Feed "<ma" then "in>Hi</ma" then "in>".
        let a = p.feed("<ma");
        assert!(a.main.is_empty(), "not closed yet");
        let b = p.feed("in>Hi</ma");
        assert!(b.main.is_empty(), "closing tag incomplete");
        let c = p.feed("in>");
        assert_eq!(c.main, "Hi");
    }

    #[test]
    fn parse_partial_main_visible_after_close() {
        let mut p = StreamingParser::new();
        let out = p.feed("<main>Partial");
        // Not closed -> empty in streaming view.
        assert!(out.main.is_empty());
        let out = p.feed("</main>");
        assert_eq!(out.main, "Partial");
    }

    #[test]
    fn parse_exact_tag_names_only() {
        // "<mainx>" is NOT the <main> tag.
        let out = parse("<mainx>not a tag</mainx>");
        // No exact <main> -> all untagged -> main.
        assert!(out.main.contains("not a tag"));
    }
}

// --------------------------- Tauri command ---------------------------

use tauri::AppHandle;

/// Parse a structured model output. Used by the
/// frontend to split MAIN / SIDE / SPEAK.
#[tauri::command]
pub fn parse_structured(text: String) -> Result<StructuredOutput, String> {
    Ok(parse(&text))
}
