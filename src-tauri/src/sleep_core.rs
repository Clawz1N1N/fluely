use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct SleepSettings {
    pub prompt: String,
    pub alarm_code: String,
    pub track_path: String,
    pub output_device: String,
    pub volume: f32,
}
impl Default for SleepSettings {
    fn default() -> Self {
        Self{prompt:"Monitor system audio. When urgent help is needed, include the alarm code in your response.".into(),alarm_code:"<+!SOS!+>".into(),track_path:String::new(),output_device:String::new(),volume:0.7}
    }
}
impl SleepSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.prompt.len() > 16384 || self.prompt.contains('\0') {
            return Err("Sleep prompt exceeds 16384 bytes or contains a null character".into());
        }
        if self.alarm_code.trim().is_empty()
            || self.alarm_code.len() > 128
            || self.alarm_code.chars().any(char::is_control)
        {
            return Err("Alarm code must contain 1–128 bytes without control characters".into());
        }
        if !self.volume.is_finite() || !(0.0..=1.0).contains(&self.volume) {
            return Err("Alarm volume must be between 0 and 1".into());
        }
        if self.track_path.len() > 32768
            || self.track_path.contains('\0')
            || self.output_device.len() > 4096
            || self.output_device.contains('\0')
        {
            return Err("Invalid alarm track or output device".into());
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_roundtrip_and_old_partial_config() {
        let config = SleepSettings::default();
        assert!(config.validate().is_ok());
        assert_eq!(
            serde_json::from_str::<SleepSettings>(&serde_json::to_string(&config).unwrap())
                .unwrap(),
            config
        );
        assert_eq!(serde_json::from_str::<SleepSettings>("{}").unwrap(), config);
    }
    #[test]
    fn rejects_empty_marker_controls_nonfinite_and_oversized_prompt() {
        let mut c = SleepSettings::default();
        c.alarm_code.clear();
        assert!(c.validate().is_err());
        c = SleepSettings::default();
        c.alarm_code = "a\nb".into();
        assert!(c.validate().is_err());
        c = SleepSettings::default();
        c.volume = f32::NAN;
        assert!(c.validate().is_err());
        c = SleepSettings::default();
        c.prompt = "Ж".repeat(8193);
        assert!(c.validate().is_err());
    }
    #[test]
    fn accepts_unicode_and_spaces_without_modifying_the_code() {
        let c = SleepSettings {
            prompt: "Якщо потрібна допомога".into(),
            alarm_code: "< ТРИВОГА >".into(),
            ..Default::default()
        };
        assert!(c.validate().is_ok());
        assert_eq!(c.alarm_code, "< ТРИВОГА >");
    }
}
