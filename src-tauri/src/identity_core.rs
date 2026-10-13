//! Dependency-free validation and VERSIONINFO transformation for our own alias.
pub fn validate_alias(value: &str) -> Result<(), String> {
    validate_startup_name(value)?;
    let lower = value.to_lowercase();
    if !lower.ends_with(".exe") || value.len() <= 4 {
        return Err("Use a filename ending in .exe".into());
    }
    let stem = lower.split('.').next().unwrap_or("");
    if matches!(stem, "con" | "prn" | "aux" | "nul" | "clock$")
        || (stem.chars().count() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && matches!(stem.chars().nth(3), Some('1'..='9' | '¹' | '²' | '³')))
    {
        return Err("Windows device names cannot be used".into());
    }
    if matches!(
        stem,
        "svchost"
            | "lsass"
            | "csrss"
            | "winlogon"
            | "services"
            | "smss"
            | "wininit"
            | "msmpeng"
            | "securityhealthservice"
            | "explorer"
    ) {
        return Err("Choose your own application name, not a Windows system component".into());
    }
    Ok(())
}
pub fn validate_startup_name(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.trim() != value
        || value.encode_utf16().count() > 128
        || value.ends_with('.')
        || value
            .chars()
            .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
    {
        return Err("Use 1–128 characters without paths, control characters, or Windows filename punctuation".into());
    }
    if matches!(
        value.to_lowercase().as_str(),
        "windows defender" | "microsoft defender" | "windows security"
    ) {
        return Err("Choose your own application name".into());
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq)]
pub struct VersionNode {
    pub key: String,
    pub text: bool,
    pub value: Vec<u8>,
    pub children: Vec<VersionNode>,
}
impl VersionNode {
    pub fn string(key: &str, value: &str) -> Self {
        Self {
            key: key.into(),
            text: true,
            value: value
                .encode_utf16()
                .chain(Some(0))
                .flat_map(u16::to_le_bytes)
                .collect(),
            children: vec![],
        }
    }
    pub fn block(key: &str, children: Vec<Self>) -> Self {
        Self {
            key: key.into(),
            text: true,
            value: vec![],
            children,
        }
    }
    #[allow(dead_code)] // Shared by unit tests and native VERSIONINFO inspection.
    pub fn string_value(&self) -> Option<String> {
        if !self.text || !self.value.len().is_multiple_of(2) {
            return None;
        }
        let words: Vec<_> = self
            .value
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .take_while(|w| *w != 0)
            .collect();
        String::from_utf16(&words).ok()
    }
}
fn align(value: usize) -> usize {
    (value + 3) & !3
}
pub fn parse_version(bytes: &[u8]) -> Result<VersionNode, String> {
    fn read(
        bytes: &[u8],
        start: usize,
        bound: usize,
        depth: usize,
    ) -> Result<(VersionNode, usize), String> {
        if depth > 16 || start + 6 > bound {
            return Err("Invalid VERSIONINFO header".into());
        }
        let word = |offset| u16::from_le_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        let length = word(start);
        let end = start
            .checked_add(length)
            .ok_or("Invalid VERSIONINFO size")?;
        if length < 6 || end > bound {
            return Err("Invalid VERSIONINFO size".into());
        }
        let value_length = word(start + 2);
        let text = word(start + 4) == 1;
        let mut cursor = start + 6;
        let mut key = vec![];
        loop {
            if cursor + 2 > end {
                return Err("Unterminated VERSIONINFO key".into());
            }
            let value = word(cursor) as u16;
            cursor += 2;
            if value == 0 {
                break;
            }
            key.push(value);
        }
        let key = String::from_utf16(&key).map_err(|_| "Invalid VERSIONINFO Unicode")?;
        cursor = align(cursor);
        let count = if text {
            value_length.checked_mul(2).ok_or("Invalid text length")?
        } else {
            value_length
        };
        if cursor + count > end {
            return Err("Invalid VERSIONINFO value length".into());
        }
        let value = bytes[cursor..cursor + count].to_vec();
        cursor = align(cursor + count);
        let mut children = vec![];
        while cursor + 6 <= end {
            let (child, next) = read(bytes, cursor, end, depth + 1)?;
            children.push(child);
            cursor = align(next);
        }
        Ok((
            VersionNode {
                key,
                text,
                value,
                children,
            },
            end,
        ))
    }
    read(bytes, 0, bytes.len(), 0).map(|result| result.0)
}
pub fn serialize_version(node: &VersionNode) -> Result<Vec<u8>, String> {
    let mut bytes = vec![0; 6];
    bytes.extend(
        node.key
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes),
    );
    bytes.resize(align(bytes.len()), 0);
    if node.text && !node.value.len().is_multiple_of(2) {
        return Err("Invalid VERSIONINFO text".into());
    }
    bytes.extend(&node.value);
    bytes.resize(align(bytes.len()), 0);
    for child in &node.children {
        bytes.extend(serialize_version(child)?);
        bytes.resize(align(bytes.len()), 0);
    }
    let length =
        u16::try_from(bytes.len()).map_err(|_| "VERSIONINFO resource exceeds 65535 bytes")?;
    let count = u16::try_from(if node.text {
        node.value.len() / 2
    } else {
        node.value.len()
    })
    .map_err(|_| "VERSIONINFO value too large")?;
    bytes[0..2].copy_from_slice(&length.to_le_bytes());
    bytes[2..4].copy_from_slice(&count.to_le_bytes());
    bytes[4..6].copy_from_slice(&(node.text as u16).to_le_bytes());
    Ok(bytes)
}
pub fn rename_version(node: &mut VersionNode, alias: &str) {
    if node.key == "StringFileInfo" {
        for table in &mut node.children {
            for key in [
                "FileDescription",
                "ProductName",
                "InternalName",
                "OriginalFilename",
            ] {
                if let Some(item) = table.children.iter_mut().find(|item| item.key == key) {
                    *item = VersionNode::string(key, alias);
                } else {
                    table.children.push(VersionNode::string(key, alias));
                }
            }
        }
    } else {
        for child in &mut node.children {
            rename_version(child, alias);
        }
    }
}
pub fn default_version(alias: &str) -> VersionNode {
    let fixed = [
        0xfeef04bdu32,
        0x00010000,
        0x00000002,
        0,
        0x00000002,
        0,
        0x3f,
        0,
        0x00040004,
        1,
        0,
        0,
        0,
    ]
    .into_iter()
    .flat_map(u32::to_le_bytes)
    .collect();
    VersionNode {
        key: "VS_VERSION_INFO".into(),
        text: false,
        value: fixed,
        children: vec![
            VersionNode::block(
                "StringFileInfo",
                vec![VersionNode::block(
                    "040904b0",
                    vec![
                        VersionNode::string("FileDescription", alias),
                        VersionNode::string("ProductName", alias),
                        VersionNode::string("OriginalFilename", alias),
                        VersionNode::string("FileVersion", "0.2.0.0"),
                        VersionNode::string("ProductVersion", "0.2.0.0"),
                        VersionNode::string(
                            "LegalCopyright",
                            "Fluely contributors; upstream Pluely by Srikanth Nani. GPL-3.0",
                        ),
                    ],
                )],
            ),
            VersionNode::block(
                "VarFileInfo",
                vec![VersionNode {
                    key: "Translation".into(),
                    text: false,
                    value: vec![9, 4, 176, 4],
                    children: vec![],
                }],
            ),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_own_names_including_unicode_and_spaces() {
        for name in ["my program.exe", "Fluely.exe", "Мій помічник.exe"] {
            assert!(validate_alias(name).is_ok(), "{name}");
        }
        assert!(validate_startup_name("Мій помічник").is_ok());
    }
    #[test]
    fn rejects_paths_devices_streams_and_ambiguous_windows_names() {
        for name in [
            "",
            "../app.exe",
            "a\\app.exe",
            "C:app.exe",
            "app.exe:stream",
            "app",
            " app.exe",
            "app.exe ",
            "CON.exe",
            "com1.exe",
            "LPT9.exe",
            "AUX.extra.exe",
            "COM¹.exe",
            "LPT².exe",
            "LPT³.exe",
            "nul.exe",
            "a?b.exe",
            "a\0.exe",
            ".exe",
            "svchost.exe",
            "lsass.exe",
        ] {
            assert!(validate_alias(name).is_err(), "{name}");
        }
    }
    #[test]
    fn startup_names_cannot_be_registry_paths_or_unbounded_strings() {
        for name in ["", " a", "a\\b", "a/b", "a\0b", "Windows Defender"] {
            assert!(validate_startup_name(name).is_err());
        }
        assert!(validate_startup_name(&"x".repeat(129)).is_err());
    }
    #[test]
    fn version_resource_roundtrip_keeps_fixed_info_translation_and_copyright() {
        let original = VersionNode {
            key: "VS_VERSION_INFO".into(),
            text: false,
            value: vec![0x42; 52],
            children: vec![
                VersionNode::block(
                    "StringFileInfo",
                    vec![VersionNode::block(
                        "040904b0",
                        vec![
                            VersionNode::string("FileDescription", "Fluely"),
                            VersionNode::string("LegalCopyright", "GPL contributors ©"),
                            VersionNode::string("ProductName", "Fluely"),
                        ],
                    )],
                ),
                VersionNode {
                    key: "VarFileInfo".into(),
                    text: false,
                    value: vec![],
                    children: vec![VersionNode {
                        key: "Translation".into(),
                        text: false,
                        value: vec![9, 4, 176, 4],
                        children: vec![],
                    }],
                },
            ],
        };
        let encoded = serialize_version(&original).unwrap();
        assert!(encoded.len() > 100);
        let mut decoded = parse_version(&encoded).unwrap();
        assert_eq!(decoded, original);
        rename_version(&mut decoded, "Мій помічник.exe");
        let roundtrip = parse_version(&serialize_version(&decoded).unwrap()).unwrap();
        assert_eq!(roundtrip.value, original.value);
        let table = &roundtrip.children[0].children[0];
        assert_eq!(
            table
                .children
                .iter()
                .find(|n| n.key == "LegalCopyright")
                .unwrap()
                .string_value()
                .as_deref(),
            Some("GPL contributors ©")
        );
        assert_eq!(
            table
                .children
                .iter()
                .find(|n| n.key == "FileDescription")
                .unwrap()
                .string_value()
                .as_deref(),
            Some("Мій помічник.exe")
        );
        assert_eq!(roundtrip.children[1], original.children[1]);
    }
    #[test]
    fn malformed_resource_cannot_read_beyond_declared_lengths() {
        assert!(parse_version(&[0; 5]).is_err());
        assert!(parse_version(&[255, 255, 0, 0, 0, 0]).is_err());
    }
}
