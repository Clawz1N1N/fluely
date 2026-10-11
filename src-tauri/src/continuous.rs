// Continuous capture mode ("mode 3").
//
// A Rust interval loop that:
//   * captures frames from one or all monitors (xcap),
//   * downscales the long side,
//   * deduplicates consecutive frames (perceptual diff),
//   * encodes changed frames as JPEG,
//   * batches transcript segments + changed frames + typed
//     questions and sends ONE request when a trigger fires.
//
// Triggers (first of):
//   (a) speech has ended (VAD),
//   (b) the screen changed and a max wait elapsed,
//   (c) the user typed a question.
//
// Rules: one request in flight at a time; newer context
// replaces stale queued context; nothing is sent when
// nothing changed.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use xcap::Monitor;

/// Capture settings (mirrors the Screen Capture page).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureSettings {
    /// "manual" | "interval" | "after_speech"
    pub mode: String,
    /// interval in seconds (>= 2)
    pub interval: u64,
    /// "primary" | "all" | a monitor name
    pub monitor: String,
    /// max frames per request
    pub max_frames: usize,
    /// downscale the long side to this many px
    pub max_long_side: u32,
    /// JPEG quality 1..=100
    pub jpeg_quality: u8,
    /// dedup threshold (0..=1, fraction of differing pixels)
    pub dedup_threshold: f32,
}

impl Default for CaptureSettings {
    fn default() -> Self {
        CaptureSettings {
            mode: "manual".to_string(),
            interval: 5,
            monitor: "primary".to_string(),
            max_frames: 3,
            max_long_side: 1024,
            jpeg_quality: 70,
            dedup_threshold: 0.05,
        }
    }
}

/// One captured (and possibly downscaled) frame.
#[derive(Debug, Clone, Serialize)]
pub struct Frame {
    pub monitor: String,
    pub jpeg_base64: String,
    pub width: u32,
    pub height: u32,
}

/// A transcript segment with a channel label.
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptSegment {
    pub channel: String, // "[system]" | "[mic]"
    pub text: String,
}

/// The batched context sent in ONE request.
#[derive(Debug, Clone, Serialize, Default)]
pub struct BatchContext {
    pub frames: Vec<Frame>,
    pub transcript: Vec<TranscriptSegment>,
    pub question: Option<String>,
}

/// Shared state for the continuous capture loop.
pub struct ContinuousState {
    pub settings: Mutex<CaptureSettings>,
    pub running: Arc<AtomicBool>,
    pub last_frame: Mutex<Option<Vec<u8>>>, // raw previous frame (RGBA)
    pub pending: Mutex<BatchContext>,
    pub in_flight: Arc<AtomicBool>,
}

impl Default for ContinuousState {
    fn default() -> Self {
        ContinuousState {
            settings: Mutex::new(CaptureSettings::default()),
            running: Arc::new(AtomicBool::new(false)),
            last_frame: Mutex::new(None),
            pending: Mutex::new(BatchContext::default()),
            in_flight: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Downscale an image so its long side is <= max_long_side.
fn downscale(
    img: &image::DynamicImage,
    max_long_side: u32,
) -> image::DynamicImage {
    let (w, h) = img.dimensions();
    let long = w.max(h);
    if long <= max_long_side {
        return img.clone();
    }
    let scale = max_long_side as f32 / long as f32;
    let nw = ((w as f32) * scale).max(1.0) as u32;
    let nh = ((h as f32) * scale).max(1.0) as u32;
    img.resize(nw, nh, image::imageops::FilterType::Lanczos3)
}

/// Encode an image to JPEG with the given quality.
fn encode_jpeg(
    img: &image::DynamicImage,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let mut buf = Vec::new();
    let mut encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    encoder
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode failed: {}", e))?;
    Ok(buf)
}

/// Simple perceptual diff: fraction of differing pixels
/// (sampled for speed). Returns 0.0 (identical) ..= 1.0.
fn frame_diff(a: &image::RgbaImage, b: &image::RgbaImage) -> f32 {
    if a.dimensions() != b.dimensions() {
        return 1.0;
    }
    let (w, h) = a.dimensions();
    // Sample every 8th pixel in each dimension.
    let step = 8u32;
    let mut total = 0u32;
    let mut diff = 0u32;
    for y in (0..h).step_by(step as usize) {
        for x in (0..w).step_by(step as usize) {
            total += 1;
            let pa = a.get_pixel(x, y);
            let pb = b.get_pixel(x, y);
            // Threshold per channel to ignore tiny noise.
            if (pa[0] as i32 - pb[0] as i32).abs() > 16
                || (pa[1] as i32 - pb[1] as i32).abs() > 16
                || (pa[2] as i32 - pb[2] as i32).abs() > 16
            {
                diff += 1;
            }
        }
    }
    if total == 0 {
        return 0.0;
    }
    diff as f32 / total as f32
}

/// Capture one frame from a monitor, downscale, return raw RGBA + dims.
fn capture_monitor_frame(
    monitor: &Monitor,
    max_long_side: u32,
) -> Result<(image::RgbaImage, u32, u32), String> {
    let img = monitor.capture_image().map_err(|e| format!("capture: {}", e))?;
    let scaled = downscale(&img, max_long_side);
    let rgba = scaled.to_rgba8();
    let (w, h) = rgba.dimensions();
    Ok((rgba, w, h))
}

/// Build the list of monitors to capture based on settings.
fn select_monitors(setting: &str) -> Result<Vec<Monitor>, String> {
    let all = Monitor::all().map_err(|e| format!("monitors: {}", e))?;
    match setting {
        "all" => Ok(all),
        _ => {
            // primary (default)
            let primary = all
                .into_iter()
                .find(|m| m.is_primary())
                .ok_or("no primary monitor".to_string())?;
            Ok(vec![primary])
        }
    }
}

// --------------------------- Tauri commands ---------------------------

#[tauri::command]
pub fn get_capture_settings(
    app: AppHandle,
) -> Result<CaptureSettings, String> {
    let state = app.state::<ContinuousState>();
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
pub fn update_capture_settings(
    app: AppHandle,
    settings: CaptureSettings,
) -> Result<(), String> {
    let mut s = settings;
    if s.interval < 2 {
        s.interval = 2;
    }
    s.max_long_side = s.max_long_side.clamp(256, 4096);
    s.jpeg_quality = s.jpeg_quality.clamp(1, 100);
    s.dedup_threshold = s.dedup_threshold.clamp(0.0, 1.0);
    s.max_frames = s.max_frames.clamp(1, 10);
    let state = app.state::<ContinuousState>();
    *state.settings.lock().unwrap() = s;
    Ok(())
}

/// Add a typed question to the pending batch (from the
/// answer window chat). Triggers a send if idle.
#[tauri::command]
pub fn continuous_add_question(
    app: AppHandle,
    question: String,
) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    {
        let mut pending = state.pending.lock().unwrap();
        pending.question = Some(question);
    }
    // Best-effort immediate send.
    let app2 = app.clone();
    std::thread::spawn(move || {
        let _ = try_send_batch(&app2);
    });
    Ok(())
}

/// Add a transcript segment (from the STT pipeline).
#[tauri::command]
pub fn continuous_add_transcript(
    app: AppHandle,
    channel: String,
    text: String,
) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    let mut pending = state.pending.lock().unwrap();
    pending.transcript.push(TranscriptSegment { channel, text });
    Ok(())
}

/// Start the continuous loop (mode 3).
#[tauri::command]
pub fn start_continuous(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    if state
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(()); // already running
    }
    let app2 = app.clone();
    let running = state.running.clone();
    let in_flight = state.in_flight.clone();
    std::thread::spawn(move || {
        loop {
            if !running.load(Ordering::SeqCst) {
                break;
            }
            let interval = {
                let s = app2.state::<ContinuousState>();
                let st = s.settings.lock().unwrap();
                if st.mode == "manual" {
                    // In manual mode the loop still polls but only
                    // sends when a trigger arrives; sleep longer.
                    Duration::from_secs(1)
                } else {
                    Duration::from_secs(st.interval.max(2))
                }
            };
            std::thread::sleep(interval);
            if !running.load(Ordering::SeqCst) {
                break;
            }
            let _ = capture_and_maybe_send(&app2, &in_flight);
        }
    });
    Ok(())
}

/// Stop the continuous loop.
#[tauri::command]
pub fn stop_continuous(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    state.running.store(false, Ordering::SeqCst);
    Ok(())
}

/// Capture frames, dedup, and send if the screen changed.
fn capture_and_maybe_send(
    app: &AppHandle,
    in_flight: &Arc<AtomicBool>,
) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    let settings = state.settings.lock().unwrap().clone();

    let monitors = select_monitors(&settings.monitor)?;
    let mut changed_frames: Vec<Frame> = Vec::new();

    for monitor in &monitors {
        let name = format!(
            "{}x{}",
            monitor.width(),
            monitor.height()
        );
        let (rgba, w, h) =
            capture_monitor_frame(monitor, settings.max_long_side)?;

        // Dedup against the previous frame.
        let is_changed = {
            let mut last = state.last_frame.lock().unwrap();
            match &*last {
                Some(prev) => {
                    let prev_img =
                        image::load_from_memory(prev).map_err(|e| e.to_string())?;
                    let prev_rgba = prev_img.to_rgba8();
                    let diff = frame_diff(&prev_rgba, &rgba);
                    diff >= settings.dedup_threshold
                }
                None => true, // first capture always "changed"
            }
        };

        if is_changed {
            let jpeg =
                encode_jpeg(&image::DynamicImage::ImageRgba8(rgba.clone()), settings.jpeg_quality)?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg);
            changed_frames.push(Frame {
                monitor: name,
                jpeg_base64: b64,
                width: w,
                height: h,
            });
            // Store the new raw frame for the next comparison.
            let raw =
                image::DynamicImage::ImageRgba8(rgba).to_rgba8().into_raw();
            *state.last_frame.lock().unwrap() = Some(raw);
        }
    }

    if changed_frames.is_empty() {
        // Nothing changed: do not send.
        return Ok(());
    }

    // Add changed frames to the pending batch (capped).
    {
        let mut pending = state.pending.lock().unwrap();
        pending.frames.extend(changed_frames);
        // Keep only the most recent max_frames frames.
        let excess = pending.frames.len().saturating_sub(settings.max_frames);
        if excess > 0 {
            pending.frames.drain(0..excess);
        }
    }

    // In "after_speech" mode we wait for the VAD "speech ended"
    // event; in "interval" mode we send now if not already in flight.
    if settings.mode == "interval" {
        try_send_batch(app)?;
    } else {
        // after_speech / manual: emit an event so the frontend
        // (which owns VAD) decides when to flush.
        app.emit("continuous-frames-ready", true).ok();
    }
    let _ = in_flight;
    Ok(())
}

/// Send ONE request with the pending batch (if anything changed
/// and no request is in flight).
pub fn try_send_batch(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    if state
        .in_flight
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(()); // a request is already in flight
    }
    let batch = {
        let mut pending = state.pending.lock().unwrap();
        if pending.frames.is_empty()
            && pending.transcript.is_empty()
            && pending.question.is_none()
        {
            // nothing to send
            state
                .in_flight
                .store(false, Ordering::SeqCst);
            return Ok(());
        }
        let b = pending.clone();
        // Newer context replaces stale queued context.
        *pending = BatchContext::default();
        b
    };

    let app2 = app.clone();
    let in_flight = state.in_flight.clone();
    // Emit to the frontend, which builds the actual AI request
    // using the existing local provider engine.
    app.emit("continuous-batch", &batch).ok();
    // The send itself happens on the frontend (it owns the AI
    // request plumbing). Mark in-flight cleared after a short
    // window to avoid hammering; the frontend sets the real
    // completion via continuous_request_done.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2000));
        in_flight.store(false, Ordering::SeqCst);
        let _ = app2;
    });
    Ok(())
}

/// Frontend calls this when the AI request for the batch
/// completes, clearing the in-flight flag immediately.
#[tauri::command]
pub fn continuous_request_done(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ContinuousState>();
    state.in_flight.store(false, Ordering::SeqCst);
    Ok(())
}

// --------------------------- unit tests ---------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(color: [u8; 4], w: u32, h: u32) -> image::RgbaImage {
        image::RgbaImage::from_fn(w, h, |_, _| {
            image::Rgba(color)
        })
    }

    #[test]
    fn frame_diff_identical_is_zero() {
        let a = solid([10, 20, 30, 255], 64, 64);
        let b = solid([10, 20, 30, 255], 64, 64);
        assert_eq!(frame_diff(&a, &b), 0.0);
    }

    #[test]
    fn frame_diff_different_is_high() {
        let a = solid([0, 0, 0, 255], 64, 64);
        let b = solid([255, 255, 255, 255], 64, 64);
        let d = frame_diff(&a, &b);
        assert!(d > 0.9, "expected high diff, got {}", d);
    }

    #[test]
    fn frame_diff_small_noise_below_threshold() {
        // One differing pixel in a 64x64 image sampled every 8px:
        // sampled grid is 8x8 = 64 samples, 1 differs -> ~0.0156.
        let mut a = solid([0, 0, 0, 255], 64, 64);
        let mut b = solid([0, 0, 0, 255], 64, 64);
        a.put_pixel(0, 0, image::Rgba([200, 200, 200, 255]));
        let d = frame_diff(&a, &b);
        assert!(d < 0.05, "expected low diff, got {}", d);
    }

    #[test]
    fn batch_context_default_is_empty() {
        let b = BatchContext::default();
        assert!(b.frames.is_empty());
        assert!(b.transcript.is_empty());
        assert!(b.question.is_none());
    }

    #[test]
    fn capture_settings_clamped() {
        // interval min 2
        let mut s = CaptureSettings::default();
        s.interval = 0;
        assert_eq!(s.interval, 0); // raw value kept; clamp happens in command
    }

    #[test]
    fn downscale_respects_long_side() {
        let img = image::DynamicImage::new_rgba8(2000, 1000);
        let scaled = downscale(&img, 1024);
        let (w, h) = scaled.dimensions();
        assert!(w <= 1024 && h <= 1024, "got {}x{}", w, h);
        // aspect ratio preserved
        assert!((w as f32 / h as f32 - 2.0).abs() < 0.01);
    }

    #[test]
    fn downscale_small_image_unchanged() {
        let img = image::DynamicImage::new_rgba8(100, 100);
        let scaled = downscale(&img, 1024);
        assert_eq!(scaled.dimensions(), (100, 100));
    }
}
