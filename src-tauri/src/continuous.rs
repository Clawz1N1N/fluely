//! Continuous capture queues context and emits one acknowledged batch to main.
use base64::Engine;
use image::{GenericImageView, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use xcap::Monitor;

#[path = "continuous_batch.rs"]
mod batch_core;
use batch_core::{capture_due, BatchQueue, RawFrame, RunGeneration};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CaptureSettings {
    pub mode: String,
    pub interval: u64,
    /// "primary", "all", or xcap's numeric monitor ID.
    pub monitor: String,
    pub max_frames: usize,
    pub max_long_side: u32,
    pub jpeg_quality: u8,
    pub dedup_threshold: f32,
    pub max_wait_secs: u64,
    pub microphone: bool,
    pub system_audio: bool,
}

impl Default for CaptureSettings {
    fn default() -> Self {
        Self {
            mode: "manual".into(),
            interval: 5,
            monitor: "primary".into(),
            max_frames: 3,
            max_long_side: 1024,
            jpeg_quality: 70,
            dedup_threshold: 0.05,
            max_wait_secs: 15,
            microphone: true,
            system_audio: true,
        }
    }
}

impl CaptureSettings {
    fn normalized(mut self) -> Result<Self, String> {
        if !matches!(self.mode.as_str(), "manual" | "interval" | "after_speech") {
            return Err(format!("Unknown capture mode: {}", self.mode));
        }
        if !self.dedup_threshold.is_finite() {
            return Err("Dedup threshold must be finite".into());
        }
        self.interval = self.interval.clamp(2, 3600);
        self.max_wait_secs = self.max_wait_secs.clamp(2, 3600);
        self.max_long_side = self.max_long_side.clamp(256, 4096);
        self.jpeg_quality = self.jpeg_quality.clamp(1, 100);
        self.dedup_threshold = self.dedup_threshold.clamp(0.0, 1.0);
        self.max_frames = self.max_frames.clamp(1, 10);
        Ok(self)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Frame {
    pub monitor: String,
    pub jpeg_base64: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptSegment {
    pub channel: String,
    pub text: String,
}

#[derive(Serialize)]
struct BatchContext<'a> {
    request_id: u64,
    frames: &'a [Frame],
    transcript: &'a [TranscriptSegment],
    questions: &'a [String],
    client_ids: &'a [String],
    // Compatibility for consumers migrating from the single-question payload.
    question: Option<String>,
}

pub struct ContinuousState {
    pub settings: Mutex<CaptureSettings>,
    loaded: AtomicBool,
    run: RunGeneration,
    lifecycle: Mutex<()>,
    capture: Mutex<()>,
    previous: Mutex<HashMap<u32, RawFrame>>,
    pending: Mutex<BatchQueue<Frame, TranscriptSegment>>,
}

impl Default for ContinuousState {
    fn default() -> Self {
        Self {
            settings: Mutex::new(CaptureSettings::default()),
            loaded: AtomicBool::new(false),
            run: RunGeneration::default(),
            lifecycle: Mutex::new(()),
            capture: Mutex::new(()),
            previous: Mutex::new(HashMap::new()),
            pending: Mutex::new(BatchQueue::default()),
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "Continuous capture state lock was poisoned".into())
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    crate::app_paths::data_dir(app)
        .map(|path| path.join("capture_settings.json"))
        .map_err(|error| format!("Capture settings directory: {error}"))
}

#[tauri::command]
pub fn get_capture_settings(app: AppHandle) -> Result<CaptureSettings, String> {
    let state = app.state::<ContinuousState>();
    let mut settings = lock(&state.settings)?;
    if !state.loaded.load(Ordering::SeqCst) {
        match std::fs::read(settings_path(&app)?) {
            Ok(bytes) => {
                *settings = serde_json::from_slice::<CaptureSettings>(&bytes)
                    .map_err(|error| format!("Load capture settings: {error}"))?
                    .normalized()?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Read capture settings: {error}")),
        }
        state.loaded.store(true, Ordering::SeqCst);
    }
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_capture_settings(app: AppHandle, settings: CaptureSettings) -> Result<(), String> {
    let settings = settings.normalized()?;
    let state = app.state::<ContinuousState>();
    let mut current = lock(&state.settings)?;
    let bytes = serde_json::to_vec_pretty(&settings)
        .map_err(|error| format!("Serialize capture settings: {error}"))?;
    crate::shell_store::replace_file(&settings_path(&app)?, &bytes)
        .map_err(|error| format!("Save capture settings: {error}"))?;
    *current = settings;
    state.loaded.store(true, Ordering::SeqCst);
    Ok(())
}

fn downscale(img: &image::DynamicImage, limit: u32) -> image::DynamicImage {
    let (width, height) = img.dimensions();
    let long = width.max(height);
    if long <= limit {
        return img.clone();
    }
    let scale = limit as f32 / long as f32;
    img.resize(
        (width as f32 * scale).max(1.0) as u32,
        (height as f32 * scale).max(1.0) as u32,
        image::imageops::FilterType::Lanczos3,
    )
}

fn encode_jpeg(img: &image::RgbaImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let mut bytes = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, quality)
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ColorType::Rgb8.into(),
        )
        .map_err(|error| format!("JPEG encode failed: {error}"))?;
    Ok(bytes)
}

fn select_monitors(setting: &str) -> Result<Vec<Monitor>, String> {
    let all = Monitor::all().map_err(|error| format!("Enumerate monitors: {error}"))?;
    if all.is_empty() {
        return Err("No monitors available".into());
    }
    if setting == "all" {
        return Ok(all);
    }
    let numeric_id = setting
        .strip_prefix("monitor:")
        .unwrap_or(setting)
        .parse::<u32>()
        .ok();
    let selected = all
        .into_iter()
        .find(|monitor| {
            if setting == "primary" {
                monitor.is_primary()
            } else if let Some(id) = numeric_id {
                monitor.id() == id
            } else {
                monitor.name() == setting
            }
        })
        .ok_or_else(|| format!("Selected monitor is unavailable: {setting}"))?;
    Ok(vec![selected])
}

fn generation_is_active(state: &ContinuousState, token: u64) -> bool {
    state.run.is_active(token)
}

fn capture_frames(app: &AppHandle, force: bool, token: Option<u64>) -> Result<(), String> {
    let settings = get_capture_settings(app.clone())?;
    let state = app.state::<ContinuousState>();
    let _capture = lock(&state.capture)?;
    if token.is_some_and(|token| !generation_is_active(&state, token)) {
        return Ok(());
    }
    let monitors = select_monitors(&settings.monitor)?;
    let mut changed = Vec::new();
    let mut new_previous = Vec::new();
    let mut previous = lock(&state.previous)?;
    // Remove disconnected monitors so the cache is bounded by attached displays.
    previous.retain(|id, _| monitors.iter().any(|monitor| monitor.id() == *id));
    for monitor in monitors {
        let image = monitor
            .capture_image()
            .map_err(|error| format!("Capture monitor {}: {error}", monitor.id()))?;
        let rgba = downscale(
            &image::DynamicImage::ImageRgba8(image),
            settings.max_long_side,
        )
        .to_rgba8();
        let raw = RawFrame {
            width: rgba.width(),
            height: rgba.height(),
            rgba: rgba.as_raw().clone(),
        };
        let differs = previous.get(&monitor.id()).is_none_or(|last| {
            let diff = last.difference(&raw);
            diff > 0.0 && diff >= settings.dedup_threshold
        });
        if force || differs {
            let jpeg = encode_jpeg(&rgba, settings.jpeg_quality)?;
            changed.push(Frame {
                monitor: monitor.id().to_string(),
                jpeg_base64: base64::engine::general_purpose::STANDARD.encode(jpeg),
                width: rgba.width(),
                height: rgba.height(),
            });
            new_previous.push((monitor.id(), raw));
        }
    }
    let _lifecycle = lock(&state.lifecycle)?;
    if token.is_some_and(|token| !generation_is_active(&state, token)) {
        return Ok(());
    }
    previous.extend(new_previous);
    lock(&state.pending)?.frames(changed, settings.max_frames, Instant::now());
    Ok(())
}

#[tauri::command]
pub fn continuous_add_question(app: AppHandle, question: String, client_id:Option<String>, images:Option<Vec<String>>) -> Result<(), String> {
    if client_id.as_ref().is_some_and(|id|id.len()>128) {return Err("Client ID is too long".into());}
    let settings=get_capture_settings(app.clone())?;
    let mut frames=Vec::new();
    if let Some(images)=images {
        for encoded in images.into_iter().take(settings.max_frames) {
            if encoded.len()>24*1024*1024 {return Err("Attached image exceeds 24 MiB".into());}
            let raw=base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|"Invalid image encoding")?;
            let image=image::load_from_memory(&raw).map_err(|_|"Invalid attached image")?;
            let image=downscale(&image,settings.max_long_side).to_rgba8();
            frames.push(Frame{monitor:"attachment".into(),width:image.width(),height:image.height(),
                jpeg_base64:base64::engine::general_purpose::STANDARD.encode(encode_jpeg(&image,settings.jpeg_quality)?)});
        }
    }
    let state = app.state::<ContinuousState>();
    {
        let mut pending=lock(&state.pending)?;
        pending.question(question,Instant::now())?;
        if let Some(id)=client_id {pending.client(id);}
        pending.frames(frames,settings.max_frames,Instant::now());
    }
    try_send_batch(&app)
}

#[tauri::command]
pub fn continuous_add_transcript(
    app: AppHandle,
    channel: String,
    text: String,
) -> Result<(), String> {
    if !matches!(channel.as_str(), "[mic]" | "[system]" | "mic" | "system") {
        return Err(format!("Unknown transcript channel: {channel}"));
    }
    if text.trim().is_empty() {
        return Ok(());
    }
    if text.len() > 32_768 {
        return Err("Transcript segment exceeds 32768 bytes".into());
    }
    let state = app.state::<ContinuousState>();
    lock(&state.pending)?.transcript(TranscriptSegment { channel, text }, Instant::now());
    Ok(())
}

/// Counted STT barrier: each started transcription pairs true with one false.
/// Releasing the barrier queues only; callers explicitly flush after ingestion.
#[tauri::command]
pub fn continuous_set_audio_pending(app: AppHandle, pending: bool) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    let result = lock(&state.pending)?.audio(pending);
    result
}

#[tauri::command]
pub fn capture_now(app: AppHandle) -> Result<(), String> {
    capture_frames(&app, true, None)?;
    try_send_batch(&app)
}

#[tauri::command]
pub fn flush_continuous(app: AppHandle) -> Result<(), String> {
    try_send_batch(&app)
}

fn report_loop_error(app: &AppHandle, error: &str) {
    eprintln!("Continuous capture: {error}");
    if let Err(emit_error) = app.emit_to("main", "continuous-error", error) {
        eprintln!("Report continuous capture error: {emit_error}");
    }
}

#[tauri::command]
pub fn start_continuous(app: AppHandle) -> Result<(), String> {
    get_capture_settings(app.clone())?;
    let state = app.state::<ContinuousState>();
    let _lifecycle = lock(&state.lifecycle)?;
    let Some(token) = state.run.start() else {
        return Ok(());
    };
    let app2 = app.clone();
    if let Err(error) = std::thread::Builder::new()
        .name("continuous-capture".into())
        .spawn(move || {
            let mut last_capture = Instant::now();
            loop {
                std::thread::sleep(Duration::from_millis(200));
                let state = app2.state::<ContinuousState>();
                if !generation_is_active(&state, token) {
                    break;
                }
                let result = (|| -> Result<(), String> {
                    let settings = get_capture_settings(app2.clone())?;
                    if capture_due(&settings.mode, last_capture.elapsed(), settings.interval) {
                        last_capture = Instant::now();
                        capture_frames(&app2, false, Some(token))?;
                        if settings.mode == "interval" {
                            let _lifecycle = lock(&state.lifecycle)?;
                            if generation_is_active(&state, token) {
                                try_send_batch(&app2)?;
                            }
                        }
                    }
                    let max_wait_elapsed = {
                        let pending = lock(&state.pending)?;
                        pending.max_wait_elapsed(
                            Instant::now(),
                            Duration::from_secs(settings.max_wait_secs),
                        )
                    };
                    if settings.mode == "after_speech" && max_wait_elapsed {
                        let _lifecycle = lock(&state.lifecycle)?;
                        if generation_is_active(&state, token) {
                            try_send_batch(&app2)?;
                        }
                    }
                    Ok(())
                })();
                if let Err(error) = result {
                    report_loop_error(&app2, &error);
                }
            }
        })
    {
        state.run.stop();
        return Err(format!("Start capture thread: {error}"));
    }
    Ok(())
}

#[tauri::command]
pub fn stop_continuous(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    let _lifecycle = lock(&state.lifecycle)?;
    state.run.stop();
    Ok(())
}

pub fn try_send_batch(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    let mut queue = lock(&state.pending)?;
    let Some(batch) = queue.dispatch() else {
        return Ok(());
    };
    let payload = BatchContext {
        request_id: batch.request_id,
        frames: &batch.frames,
        transcript: &batch.transcript,
        questions: &batch.questions,
        client_ids: &batch.client_ids,
        question: if batch.questions.is_empty() {
            None
        } else {
            Some(batch.questions.join("\n\n"))
        },
    };
    if let Err(error) = app.emit_to("main", "continuous-batch", &payload) {
        queue.restore(batch, Instant::now());
        return Err(format!("Deliver continuous batch to main: {error}"));
    }
    Ok(())
}

#[tauri::command]
pub fn continuous_request_done(app: AppHandle, request_id: u64) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    lock(&state.pending)?.acknowledge(request_id)?;
    try_send_batch(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_capture_settings_restore_with_new_defaults() {
        let settings: CaptureSettings =
            serde_json::from_str(r#"{"mode":"interval","interval":5}"#).unwrap();
        assert_eq!(settings.max_wait_secs, 15);
        assert!(settings.microphone && settings.system_audio);
        assert_eq!(settings.normalized().unwrap().mode, "interval");
    }

    #[test]
    fn invalid_settings_do_not_enter_loop() {
        let mut settings = CaptureSettings::default();
        settings.mode = "unknown".into();
        assert!(settings.normalized().is_err());
    }

    #[test]
    fn downscale_preserves_aspect_ratio() {
        let scaled = downscale(&image::DynamicImage::new_rgba8(2000, 1000), 1024);
        assert_eq!(scaled.dimensions(), (1024, 512));
    }
}
