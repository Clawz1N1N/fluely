//! Validate the catalog reported by Windows, without inventing installed languages.
pub fn parse_catalog(bytes: &[u8]) -> Result<Vec<(String, String)>, String> {
    if bytes.len() > 65536 {
        return Err("Windows speech catalog exceeds 64 KiB".into());
    }
    let entries: Vec<serde_json::Value> = serde_json::from_slice(bytes)
        .map_err(|e| format!("Invalid installed Windows speech catalog: {e}"))?;
    let mut languages = Vec::new();
    for entry in entries {
        let id = entry["id"]
            .as_str()
            .ok_or("Windows recognizer has no culture")?;
        let name = entry["name"]
            .as_str()
            .ok_or("Windows recognizer has no display name")?;
        if id.is_empty() || id.len() > 64 || name.is_empty() || name.len() > 1024 {
            return Err("Invalid installed Windows recognizer metadata".into());
        }
        if !languages.iter().any(|(culture, _)| culture == id) {
            languages.push((id.to_owned(), name.to_owned()));
        }
    }
    let first = languages.first().ok_or(
        "No offline Windows speech recognizer is installed. Install a Windows speech language pack or select local Whisper / GGUF ASR.",
    )?;
    languages.insert(0, ("default".into(), format!("Default ({})", first.1)));
    Ok(languages)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_cultures_keep_real_names_and_allow_default_only_when_available() {
        let catalog =
            parse_catalog(br#"[{"id":"de-DE","name":"Microsoft German Recognizer"}]"#).unwrap();
        assert_eq!(catalog.len(), 2);
        assert_eq!(catalog[0].0, "default");
        assert!(catalog[0].1.contains("Microsoft German Recognizer"));
        assert_eq!(
            catalog[1],
            ("de-DE".into(), "Microsoft German Recognizer".into())
        );
        assert!(!catalog.iter().any(|(id, _)| id == "uk-UA"));
    }
    #[test]
    fn no_installed_recognizers_is_an_actionable_error_instead_of_fake_models() {
        let error = parse_catalog(b"[]").unwrap_err();
        assert!(error.contains("No offline Windows speech recognizer"));
        assert!(parse_catalog(br#"["en-US"]"#).is_err());
        assert!(parse_catalog(br#"[{"id":"","name":"Invalid"}]"#).is_err());
    }
}
