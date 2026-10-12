//! Serializable provider metadata. Credential values belong in the keychain.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RequestLimits {
    #[serde(default)]
    pub per_second: u32,
    #[serde(default)]
    pub per_minute: u32,
    #[serde(default)]
    pub per_hour: u32,
    #[serde(default)]
    pub per_day: u32,
}

impl RequestLimits {
    pub fn array(&self) -> [u32; 4] {
        [
            self.per_second,
            self.per_minute,
            self.per_hour,
            self.per_day,
        ]
    }
    pub fn from_array(values: [u32; 4]) -> Self {
        Self {
            per_second: values[0],
            per_minute: values[1],
            per_hour: values[2],
            per_day: values[3],
        }
    }
}

fn enabled() -> bool {
    true
}
fn response_path() -> String {
    "choices.0.message.content".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderEntry {
    pub id: String,
    pub kind: String,
    pub preset: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub supports_images: bool,
    #[serde(default)]
    pub rank: i32,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub limit_per_second: u32,
    #[serde(default)]
    pub limit_per_minute: u32,
    #[serde(default)]
    pub limit_per_hour: u32,
    #[serde(default)]
    pub limit_per_day: u32,
    #[serde(default)]
    pub curl: Option<String>,
    #[serde(default = "enabled")]
    pub streaming: bool,
    #[serde(default = "response_path")]
    pub response_content_path: String,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub secret_keys: Vec<String>,
}

impl ProviderEntry {
    pub fn limits(&self) -> [u32; 4] {
        [
            self.limit_per_second,
            self.limit_per_minute,
            self.limit_per_hour,
            self.limit_per_day,
        ]
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() || self.id.len() > 256 {
            return Err("Provider ID must contain 1-256 characters".into());
        }
        if !["brain", "stt", "tts", "vision"].contains(&self.kind.as_str()) {
            return Err("Unsupported provider kind".into());
        }
        if self.model.trim().is_empty() {
            return Err("Provider model is required".into());
        }
        let authority = self
            .base_url
            .split("://")
            .nth(1)
            .unwrap_or("")
            .split('/')
            .next()
            .unwrap_or("");
        if !(self.base_url.starts_with("https://") || self.base_url.starts_with("http://"))
            || authority.is_empty()
            || authority.contains('@')
        {
            return Err("Provider URL must be HTTP(S) without embedded credentials".into());
        }
        for key in self.variables.keys() {
            if sensitive_name(key)
                || self
                    .secret_keys
                    .iter()
                    .any(|secret| secret.eq_ignore_ascii_case(key))
            {
                return Err(
                    "Credential variables must be stored separately in the keychain".into(),
                );
            }
        }
        if self.secret_keys.iter().any(|key| key.trim().is_empty()) {
            return Err("Secret key names must not be empty".into());
        }
        if self.curl.as_deref().is_some_and(inline_credentials) {
            return Err(
                "cURL credentials must use placeholders referencing keychain secrets".into(),
            );
        }
        Ok(())
    }
}

fn sensitive_name(name: &str) -> bool {
    let normalized: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    normalized.ends_with("token")
        || [
            "apikey",
            "password",
            "secret",
            "authorization",
            "credential",
            "privatekey",
        ]
        .iter()
        .any(|part| normalized.contains(part))
}

fn inline_credentials(curl: &str) -> bool {
    let lower = curl.to_ascii_lowercase();
    if lower.contains("--user ") || lower.contains(" -u ") {
        return true;
    }
    for marker in [
        "authorization:",
        "proxy-authorization:",
        "x-api-key:",
        "x-goog-api-key:",
        "api-key:",
        "api_key=",
        "apikey=",
        "access_token=",
        "?key=",
        "&key=",
    ] {
        let mut rest = lower.as_str();
        while let Some(pos) = rest.find(marker) {
            let after = rest[pos + marker.len()..].trim_start();
            let value = after
                .strip_prefix("bearer ")
                .or_else(|| after.strip_prefix("basic "))
                .unwrap_or(after)
                .trim_start();
            // Templates survive on disk; expanded credentials never do.
            if !value.starts_with("{{") {
                return true;
            }
            rest = after;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry() -> ProviderEntry {
        serde_json::from_str(r#"{"id":"p","kind":"brain","preset":"custom","base_url":"https://example.invalid/v1","model":"test"}"#).unwrap()
    }

    #[test]
    fn old_metadata_gets_all_frontend_defaults() {
        let p = entry();
        p.validate().unwrap();
        let json = serde_json::to_value(&p).unwrap();
        assert_eq!(json["enabled"], true);
        assert_eq!(json["limit_per_second"], 0);
        assert_eq!(json["curl"], serde_json::Value::Null);
        assert_eq!(json["variables"], serde_json::json!({}));
        assert_eq!(json["secret_keys"], serde_json::json!([]));
    }
    #[test]
    fn metadata_round_trip_preserves_templates_without_credentials() {
        let mut p = entry();
        p.kind = "vision".into();
        p.secret_keys.push("API_KEY".into());
        p.curl = Some("curl https://example.invalid -H 'Authorization: Bearer {{API_KEY}}'".into());
        p.variables.insert("LANGUAGE".into(), "uk".into());
        p.validate().unwrap();
        let restored: ProviderEntry =
            serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        assert_eq!(restored.secret_keys, ["API_KEY"]);
        assert_eq!(restored.variables["LANGUAGE"], "uk");
    }
    #[test]
    fn raw_secret_variables_are_rejected() {
        for name in [
            "API_KEY",
            "authToken",
            "password",
            "credential",
            "custom_key",
        ] {
            let mut p = entry();
            p.secret_keys.push("custom_key".into());
            p.variables.insert(name.into(), "private-value".into());
            assert!(p.validate().is_err());
        }
    }
    #[test]
    fn raw_authorization_and_embedded_url_credentials_are_rejected() {
        for curl in [
            "curl -H 'Authorization: Bearer private-value'",
            "curl -H 'x-api-key: private-value'",
            "curl --user user:password",
        ] {
            let mut p = entry();
            p.curl = Some(curl.into());
            assert!(p.validate().is_err());
        }
        let mut p = entry();
        p.base_url = "https://user:private-value@example.invalid".into();
        assert!(p.validate().is_err());
    }
    #[test]
    fn unexpected_credential_field_cannot_deserialize() {
        let mut value = serde_json::to_value(entry()).unwrap();
        value["api_key"] = "private-value".into();
        assert!(serde_json::from_value::<ProviderEntry>(value).is_err());
    }

    #[test]
    fn nonsecret_token_configuration_remains_valid_metadata() {
        let mut p = entry();
        p.variables.insert("MAX_TOKENS".into(), "1000".into());
        p.variables.insert("TOKEN_COUNT".into(), "25".into());
        p.validate().unwrap();
    }

    #[test]
    fn inline_google_credentials_are_rejected_but_templates_are_valid() {
        for curl in [
            "curl -H 'x-goog-api-key: private-value'",
            "curl 'https://example.invalid?key=private-value'",
        ] {
            let mut p = entry();
            p.curl = Some(curl.into());
            assert!(p.validate().is_err());
        }
        let mut p = entry();
        p.curl = Some("curl 'https://example.invalid?key={{API_KEY}}'".into());
        p.validate().unwrap();
    }
}
