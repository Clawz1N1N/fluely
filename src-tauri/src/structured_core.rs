// Dependency-free structured-output parser shared by IPC and native unit tests.
// Only exact protocol tags are special; Unicode and ordinary angle brackets
// are preserved. MAIN streams immediately; SIDE/SPEAK publish on close or EOF.

#[derive(Debug, Clone, Default, PartialEq)]
pub struct StructuredOutput {
    pub main: String,
    pub side: String,
    pub speak: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
enum Section {
    #[default]
    Main,
    Side,
    Speak,
}

const MARKERS: [(&str, Section, bool); 6] = [
    ("<main>", Section::Main, true),
    ("<side>", Section::Side, true),
    ("<speak>", Section::Speak, true),
    ("</main>", Section::Main, false),
    ("</side>", Section::Side, false),
    ("</speak>", Section::Speak, false),
];

#[derive(Default)]
pub struct StreamingParser {
    pending: String,
    output: StructuredOutput,
    section: Section,
    side_ready: usize,
    speak_ready: usize,
}

impl StreamingParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, chunk: &str) -> StructuredOutput {
        self.pending.push_str(chunk);
        self.consume(false);
        self.snapshot()
    }

    /// Complete the stream, preserving unfinished tag prefixes as literal text
    /// and publishing unclosed sections rather than silently dropping content.
    pub fn finish(&mut self) -> StructuredOutput {
        self.consume(true);
        self.side_ready = self.output.side.len();
        self.speak_ready = self.output.speak.len();
        self.snapshot()
    }

    fn consume(&mut self, final_chunk: bool) {
        let mut offset = 0;
        while offset < self.pending.len() {
            let rest = &self.pending[offset..];
            if rest.starts_with('<') {
                if let Some(&(marker, section, opening)) = MARKERS
                    .iter()
                    .find(|(marker, _, _)| rest.starts_with(marker))
                {
                    if opening {
                        self.section = section;
                    } else if self.section == section {
                        match section {
                            Section::Side => self.side_ready = self.output.side.len(),
                            Section::Speak => self.speak_ready = self.output.speak.len(),
                            Section::Main => {}
                        }
                        self.section = Section::Main;
                    } else {
                        self.append(marker);
                    }
                    offset += marker.len();
                    continue;
                }
                if !final_chunk
                    && MARKERS
                        .iter()
                        .any(|(marker, _, _)| marker.starts_with(rest))
                {
                    break;
                }
            }
            let ch = rest.chars().next().expect("nonempty UTF-8 remainder");
            let len = ch.len_utf8();
            // Keep byte offsets on UTF-8 boundaries; never cast bytes to chars.
            let mut encoded = [0; 4];
            self.append(ch.encode_utf8(&mut encoded));
            offset += len;
        }
        self.pending.drain(..offset);
    }

    fn append(&mut self, text: &str) {
        match self.section {
            Section::Main => self.output.main.push_str(text),
            Section::Side => self.output.side.push_str(text),
            Section::Speak => self.output.speak.push_str(text),
        }
    }

    fn snapshot(&self) -> StructuredOutput {
        StructuredOutput {
            main: self.output.main.trim().to_string(),
            side: self.output.side[..self.side_ready].trim().to_string(),
            speak: self.output.speak[..self.speak_ready].trim().to_string(),
        }
    }
}

pub fn parse(text: &str) -> StructuredOutput {
    let mut parser = StreamingParser::new();
    parser.feed(text);
    parser.finish()
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
        assert_eq!(b.main, "Hi", "MAIN streams before its closing tag");
        let c = p.feed("in>");
        assert_eq!(c.main, "Hi");
    }

    #[test]
    fn parse_partial_main_visible_before_close() {
        let mut p = StreamingParser::new();
        let out = p.feed("<main>Partial");
        assert_eq!(out.main, "Partial");
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

    #[test]
    fn preserves_untagged_unicode() {
        assert_eq!(parse("Відповідь: Київ 😀").main, "Відповідь: Київ 😀");
    }

    #[test]
    fn preserves_section_order_and_repeated_tags() {
        let out = parse("Before <main>first</main> between <main>second</main> after");
        assert_eq!(out.main, "Before first between second after");
        assert_eq!(parse("<side>one</side><side>two</side>").side, "onetwo");
    }

    #[test]
    fn stream_does_not_leak_split_tag_prefixes() {
        let mut parser = StreamingParser::new();
        assert_eq!(parser.feed("Answer<si").main, "Answer");
        let out = parser.feed("de>analysis</side>");
        assert_eq!(out.main, "Answer");
        assert_eq!(out.side, "analysis");
    }

    #[test]
    fn streaming_matches_literal_output_at_every_character_split() {
        let text = "Перед<main>Київ</main><side>аналіз</side><speak>Пояснення 😀</speak>після";
        for split in text
            .char_indices()
            .map(|(index, _)| index)
            .chain([text.len()])
        {
            let mut parser = StreamingParser::new();
            parser.feed(&text[..split]);
            let out = parser.feed(&text[split..]);
            assert_eq!(out.main, "ПередКиївпісля", "split {split}");
            assert_eq!(out.side, "аналіз", "split {split}");
            assert_eq!(out.speak, "Пояснення 😀", "split {split}");
        }
    }

    #[test]
    fn finish_publishes_unclosed_sections_and_literal_prefixes() {
        let mut parser = StreamingParser::new();
        assert_eq!(parser.feed("<side>Незавершено<spe").side, "");
        assert_eq!(parser.finish().side, "Незавершено<spe");
        assert_eq!(parse("<speak>Пояснення").speak, "Пояснення");
    }

    #[test]
    fn closed_secondary_section_does_not_publish_later_unclosed_content() {
        let mut parser = StreamingParser::new();
        assert_eq!(parser.feed("<side>first</side><side>second").side, "first");
        assert_eq!(parser.finish().side, "firstsecond");
    }
}
