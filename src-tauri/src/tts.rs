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

/// Which TTS backend to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TtsBackend {
    System,
    Piper,
    Cloud,
}

impl Default for TtsBackend {
    fn default() -> Self {
        TtsBackend::System
    }
}

/// TTS settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
        }
    }
}

pub struct TtsState {
    pub settings: Mutex<TtsSettings>,
}

impl Default for TtsState {
    fn default() -> Self {
        TtsState {
            settings: Mutex::new(TtsSettings::default()),
        }
    }
}

// --------------------------- Tauri commands ---------------------------

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn get_tts_settings(app: AppHandle) -> Result<TtsSettings, String> {
    let state = app.state::<TtsState>();
    let settings = state.settings.lock().unwrap().clone();
    Ok(settings)
}

#[tauri::command]
pub fn update_tts_settings(
    app: AppHandle,
    settings: TtsSettings,
) -> Result<(), String> {
    let mut s = settings;
    s.rate = s.rate.clamp(0.5, 2.0);
    let state = app.state::<TtsState>();
    *state.settings.lock().unwrap() = s;
    Ok(())
}

/// Master TTS toggle (the single "disable TTS" switch).
#[tauri::command]
pub fn set_tts_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<TtsState>();
    state.settings.lock().unwrap().enabled = enabled;
    Ok(())
}
