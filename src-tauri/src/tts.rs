// Text-to-speech manager.
//
// Backends:
//   * system voices (Web Speech API) - frontend
//   * local engine (Piper sidecar)     - optional
//   * cloud (OpenAI-compatible speech) - provider template
//
// This module holds the shared TTS state and the
// keybind actions (toggle/stop/pause/seek). The
// actual audio playback for "system voices" uses
// the browser SpeechSynthesis API (see
// src/hooks/useTts.ts); this Rust side tracks
// settings and the "disabled" master switch.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

/// Which TTS backend to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TtsBackend {
    #[default]
    System,
    Piper,
    Cloud,
}

/// TTS settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TtsSettings {
    pub backend: TtsBackend,
    /// master switch: when false, TTS never speaks
    pub enabled: bool,
    /// voice identifier (system voice name)
    pub voice: String,
    /// language (BCP-47), default "uk"
    pub language: String,
    /// speech rate 0.5..=2.0
    pub rate: f32,
    /// speak while streaming (per sentence) or
    /// only when <speak> is complete
    pub stream: bool,
    pub piper_executable: String,
}

impl Default for TtsSettings {
    fn default() -> Self {
        TtsSettings {
            backend: TtsBackend::System,
            enabled: true,
            voice: String::new(),
            language: "uk".to_string(),
            rate: 1.0,
            stream: true,
            piper_executable: "piper".into(),
        }
    }
}

pub struct TtsState {
    pub settings: Mutex<TtsSettings>,
    loaded: AtomicBool,
}

impl Default for TtsState {
    fn default() -> Self {
        TtsState {
            settings: Mutex::new(TtsSettings::default()),
            loaded: AtomicBool::new(false),
        }
    }
}

// --------------------------- Tauri commands ---------------------------

use tauri::{AppHandle, Emitter, Manager};

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    crate::app_paths::data_dir(app).map(|path| path.join("tts_settings.json"))
}

fn normalize(mut settings: TtsSettings) -> Result<TtsSettings, String> {
    if !settings.rate.is_finite() { return Err("Speech rate must be finite".into()); }
    settings.rate = settings.rate.clamp(0.5, 2.0);
    if settings.language.trim().is_empty() { settings.language = "uk".into(); }
    Ok(settings)
}

fn save(app: &AppHandle, settings: &TtsSettings) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    crate::shell_store::replace_file(&settings_path(app)?, &bytes).map_err(|error| format!("Save TTS settings: {error}"))
}

#[tauri::command]
pub fn get_tts_settings(app: AppHandle) -> Result<TtsSettings, String> {
    let state = app.state::<TtsState>();
    let mut settings = state.settings.lock().map_err(|_| "TTS state lock unavailable")?;
    if !state.loaded.load(Ordering::SeqCst) {
        match std::fs::read(settings_path(&app)?) {
            Ok(bytes) => *settings = normalize(serde_json::from_slice(&bytes).map_err(|error| format!("Load TTS settings: {error}"))?)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Err(error) => return Err(format!("Read TTS settings: {error}")),
        }
        state.loaded.store(true, Ordering::SeqCst);
    }
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_tts_settings(
    app: AppHandle,
    settings: TtsSettings,
) -> Result<(), String> {
    let s = normalize(settings)?;
    let state = app.state::<TtsState>();
    let mut current = state.settings.lock().map_err(|_| "TTS state lock unavailable")?;
    save(&app, &s)?;
    *current = s.clone();
    state.loaded.store(true, Ordering::SeqCst);
    drop(current);
    app.emit_to("main", "tts-settings-changed", &s).map_err(|error| error.to_string())?;
    Ok(())
}

/// Master TTS toggle (the single "disable TTS" switch).
#[tauri::command]
pub fn set_tts_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = get_tts_settings(app.clone())?;
    settings.enabled = enabled;
    update_tts_settings(app, settings)
}

/// Piper remains optional: the user chooses an installed executable and .onnx voice.
/// No model/executable downloads or shell expansion happen here.
#[tauri::command]
pub async fn synthesize_piper(app: AppHandle, text: String) -> Result<String, String> {
    let settings = get_tts_settings(app.clone())?;
    if settings.voice.trim().is_empty() { return Err("Piper: select a local .onnx voice model in TTS settings".into()); }
    if text.chars().count() > 20000 { return Err("Piper sentence exceeds 20000 characters".into()); }
    let cache = crate::app_paths::cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::{io::Write, process::{Command, Stdio}, time::{Instant, Duration}};
        use base64::Engine;
        std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let path = cache.join(format!("piper-{}-{nonce}.wav", std::process::id()));
        struct OutputFile(std::path::PathBuf);
        impl Drop for OutputFile { fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); } }
        let _output = OutputFile(path.clone());
        let mut command = Command::new(&settings.piper_executable);
        command.arg("--model").arg(&settings.voice).arg("--output_file").arg(&path)
            .arg("--length_scale").arg((1.0 / settings.rate).to_string())
            .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let mut child = command.spawn().map_err(|_| "Piper executable is unavailable. Install Piper locally or choose system/cloud TTS.".to_string())?;
        let input = child.stdin.take().ok_or("Piper stdin unavailable")?.write_all(format!("{text}\n").as_bytes());
        if input.is_err() { let _ = child.kill(); let _ = child.wait(); return Err("Piper input failed".into()); }
        let deadline = Instant::now() + Duration::from_secs(45);
        loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                if !status.success() { return Err(format!("Piper failed ({status}); verify the executable and voice model")); }
                break;
            }
            if Instant::now() >= deadline { let _ = child.kill(); let _ = child.wait(); return Err("Piper timed out after 45 seconds".into()); }
            std::thread::sleep(Duration::from_millis(50));
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("Read Piper audio: {e}"))?;
        if bytes.len() > 16 * 1024 * 1024 { return Err("Piper audio exceeds 16 MiB".into()); }
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn speech_settings_reject_nan_and_preserve_independent_backend() {
        let settings = TtsSettings {rate:f32::NAN,..Default::default()};
        assert!(normalize(settings).is_err());
        let settings = normalize(TtsSettings { backend: TtsBackend::Cloud, rate: 9.0, ..TtsSettings::default() }).unwrap();
        assert_eq!(settings.rate, 2.0);
        assert_eq!(settings.backend, TtsBackend::Cloud);
        let restored: TtsSettings = serde_json::from_slice(&serde_json::to_vec(&settings).unwrap()).unwrap();
        assert_eq!(restored.backend, TtsBackend::Cloud);
    }
}
