//! Sleep is transient. Only the prompt, alarm marker, track and audio route persist.
#[path = "sleep_audio.rs"]
mod audio;
#[path = "sleep_core.rs"]
mod core;
pub use core::SleepSettings;
use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
struct Playback {
    cancel: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
    lease: u64,
}
impl Playback {
    fn stop(&mut self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
impl Drop for Playback {
    fn drop(&mut self) {
        self.stop();
    }
}
#[derive(Default)]
pub struct SleepState {
    sleeping: AtomicBool,
    transitioning: AtomicBool,
    transition: Mutex<()>,
    epoch: AtomicU64,
    shutting_down: AtomicBool,
    playback: Mutex<Playback>,
    settings: Mutex<()>,
}
impl SleepState {
    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        let _transition = self.transition.lock().ok();
        self.sleeping.store(false, Ordering::SeqCst);
        self.transitioning.store(false, Ordering::SeqCst);
        if let Ok(mut playback) = self.playback.lock() {
            playback.stop();
        }
    }
}
pub fn ensure_awake<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<SleepState>();
    if state.shutting_down.load(Ordering::SeqCst)
        || state.sleeping.load(Ordering::SeqCst)
        || state.transitioning.load(Ordering::SeqCst)
    {
        Err("Ordinary actions are unavailable during Sleep mode.".into())
    } else {
        Ok(())
    }
}
pub fn is_sleeping(app: &AppHandle) -> bool {
    app.state::<SleepState>().sleeping.load(Ordering::SeqCst)
}
pub fn audio_epoch(app: &AppHandle) -> u64 {
    app.state::<SleepState>().epoch.load(Ordering::SeqCst)
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::data_dir(app)?.join("sleep_settings.json"))
}
fn load(app: &AppHandle) -> Result<SleepSettings, String> {
    let path = path(app)?;
    let config = match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("Sleep settings: {e}"))?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => SleepSettings::default(),
        Err(e) => return Err(e.to_string()),
    };
    config.validate()?;
    Ok(config)
}
fn track(config: &SleepSettings) -> Result<PathBuf, String> {
    let path = PathBuf::from(&config.track_path);
    if !path.is_absolute() {
        return Err("Choose an absolute local alarm track path".into());
    }
    let metadata = std::fs::metadata(&path).map_err(|_| "Alarm track is missing or unreadable")?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 64 * 1024 * 1024 {
        return Err("Alarm track must be a file between 1 byte and 64 MiB".into());
    }
    if !path
        .extension()
        .and_then(|x| x.to_str())
        .is_some_and(|x| ["wav", "mp3", "ogg", "flac"].contains(&x.to_ascii_lowercase().as_str()))
    {
        return Err("Choose a WAV, MP3, OGG or FLAC alarm track".into());
    }
    Ok(path)
}
#[tauri::command]
pub fn get_sleep_settings(app: AppHandle) -> Result<SleepSettings, String> {
    let state = app.state::<SleepState>();
    let _guard = state
        .settings
        .lock()
        .map_err(|_| "Sleep settings lock unavailable")?;
    load(&app)
}
#[tauri::command]
pub fn save_sleep_settings(app: AppHandle, settings: SleepSettings) -> Result<(), String> {
    settings.validate()?;
    if !settings.track_path.is_empty() {
        track(&settings)?;
    }
    let state = app.state::<SleepState>();
    let _guard = state
        .settings
        .lock()
        .map_err(|_| "Sleep settings lock unavailable")?;
    crate::shell_store::replace_file(
        &path(&app)?,
        &serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    app.emit_to("main", "sleep-settings-changed", settings)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn set_sleep_mode(app: AppHandle, sleeping: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SleepState>();
        let _transition = state
            .transition
            .lock()
            .map_err(|_| "Sleep transition lock unavailable")?;
        if state.shutting_down.load(Ordering::SeqCst) {
            return Err("Application is shutting down".into());
        }
        let prior_epoch = state.epoch.load(Ordering::SeqCst);
        let epoch = prior_epoch
            .checked_add(1)
            .ok_or("Sleep transition counter exhausted")?;
        state.transitioning.store(true, Ordering::SeqCst);
        let previous = state.sleeping.swap(sleeping, Ordering::SeqCst);
        state.epoch.store(epoch, Ordering::SeqCst);
        let result = (|| -> Result<(), String> {
            if sleeping {
                let result = crate::continuous::stop_continuous(app.clone());
                app.state::<crate::microphone::MicrophoneState>().shutdown();
                let _ = crate::capture::close_overlay_window(app.clone());
                result?;
            } else {
                state
                    .playback
                    .lock()
                    .map_err(|_| "Alarm lock unavailable")?
                    .stop();
            }
            let cancelled = crate::continuous::discard_pending_context(&app)?;
            if !cancelled.is_empty() {
                app.emit("sleep-requests-cancelled", cancelled)
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        })();
        if result.is_err() {
            state.sleeping.store(previous, Ordering::SeqCst);
            state.epoch.store(prior_epoch, Ordering::SeqCst);
        }
        state.transitioning.store(false, Ordering::SeqCst);
        result.map(|()| epoch.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Serialize)]
pub struct AlarmOutput {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}
#[tauri::command]
pub fn list_alarm_outputs() -> Result<Vec<AlarmOutput>, String> {
    let host = cpal::default_host();
    let default = host.default_output_device().and_then(|d| d.name().ok());
    host.output_devices()
        .map_err(|e| e.to_string())?
        .enumerate()
        .map(|(i, device)| {
            let name = device.name().map_err(|e| e.to_string())?;
            Ok(AlarmOutput {
                id: format!("{i}:{name}"),
                is_default: default.as_ref() == Some(&name),
                name,
            })
        })
        .collect()
}
#[derive(Serialize)]
pub struct AlarmReceipt {
    pub device_name: String,
    pub playback_id: String,
}
fn play(app: AppHandle, allow_awake: bool) -> Result<AlarmReceipt, String> {
    let state = app.state::<SleepState>();
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "Alarm lock unavailable")?;
    if state.shutting_down.load(Ordering::SeqCst) {
        return Err("Application is shutting down".into());
    }
    if state.transitioning.load(Ordering::SeqCst) {
        return Err("Sleep mode is changing. Try the alarm again.".into());
    }
    if !allow_awake && !state.sleeping.load(Ordering::SeqCst) {
        return Err("Sleep mode is no longer active".into());
    }
    let config = load(&app)?;
    let track = track(&config)?;
    playback.stop();
    playback.lease = playback
        .lease
        .checked_add(1)
        .ok_or("Alarm playback counter exhausted")?;
    let lease = playback.lease.to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let active = cancel.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel(1);
    let events = app.clone();
    let worker = thread::Builder::new()
        .name("fluely-sleep-alarm".into())
        .spawn(move || {
            let result = audio::play_track(
                &track,
                &config.output_device,
                config.volume,
                &active,
                &ready_tx,
            );
            if let Err(error) = result {
                let _ = ready_tx.send(Err(error.clone()));
                let _ = events.emit_to("main", "sleep-alarm-error", error);
            }
        })
        .map_err(|e| e.to_string())?;
    playback.cancel = cancel;
    playback.worker = Some(worker);
    match ready_rx.recv_timeout(Duration::from_secs(8)) {
        Ok(result) => result.map(|device_name| AlarmReceipt {
            device_name,
            playback_id: lease,
        }),
        Err(_) => {
            playback.cancel.store(true, Ordering::SeqCst);
            Err("Alarm output did not initialize within 8 seconds".into())
        }
    }
}
#[tauri::command]
pub async fn play_sleep_alarm(app: AppHandle) -> Result<AlarmReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || play(app, false))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn test_sleep_alarm(app: AppHandle) -> Result<AlarmReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || play(app, true))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn stop_sleep_alarm(app: AppHandle, playback_id: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SleepState>();
        let mut playback = state
            .playback
            .lock()
            .map_err(|_| "Alarm lock unavailable")?;
        if playback_id
            .as_ref()
            .is_none_or(|id| id == &playback.lease.to_string())
        {
            playback.stop();
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn pick_sleep_track(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let owner = app
            .get_webview_window("dashboard")
            .and_then(|w| w.hwnd().ok())
            .map(|w| w.0 as isize)
            .unwrap_or(0);
        tauri::async_runtime::spawn_blocking(move || {
            use windows::{
                core::{PCWSTR, PWSTR},
                Win32::{
                    Foundation::HWND,
                    UI::Controls::Dialogs::{
                        CommDlgExtendedError, GetOpenFileNameW, OFN_DONTADDTORECENT, OFN_EXPLORER,
                        OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST, OPENFILENAMEW,
                    },
                },
            };
            let filter: Vec<u16> = "Audio tracks\0*.wav;*.mp3;*.ogg;*.flac\0\0"
                .encode_utf16()
                .collect();
            let title: Vec<u16> = "Fluely alarm track\0".encode_utf16().collect();
            let mut buffer = vec![0u16; 32768];
            let mut dialog = OPENFILENAMEW {
                lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
                hwndOwner: HWND(owner as _),
                lpstrFile: PWSTR(buffer.as_mut_ptr()),
                nMaxFile: buffer.len() as u32,
                lpstrFilter: PCWSTR(filter.as_ptr()),
                lpstrTitle: PCWSTR(title.as_ptr()),
                Flags: OFN_EXPLORER
                    | OFN_FILEMUSTEXIST
                    | OFN_PATHMUSTEXIST
                    | OFN_NOCHANGEDIR
                    | OFN_DONTADDTORECENT,
                ..Default::default()
            };
            unsafe {
                if GetOpenFileNameW(&mut dialog).as_bool() {
                    Ok(Some(String::from_utf16_lossy(
                        &buffer[..buffer.iter().position(|x| *x == 0).unwrap_or(buffer.len())],
                    )))
                } else {
                    let code = CommDlgExtendedError().0;
                    if code == 0 {
                        Ok(None)
                    } else {
                        Err(format!("Audio file picker failed: {code}"))
                    }
                }
            }
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Native audio file picker is supported on Windows".into())
    }
}
