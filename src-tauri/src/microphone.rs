//! CPAL capture owns the native microphone only while explicitly started.
//! `microphone-input` payload: base64 String of mono 16 kHz PCM16 RIFF/WAV.
#[path = "microphone_core.rs"]
mod core;
use base64::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[derive(Default)]
pub struct MicrophoneState {
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    active: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    owner: Mutex<Option<String>>,
}
impl MicrophoneState {
    pub fn shutdown(&self) {
        if let Ok(mut worker) = self.worker.lock() {
            self.stop_worker(&mut worker);
        }
    }
    fn stop_worker(&self, worker: &mut Option<thread::JoinHandle<()>>) {
        self.active.store(false, Ordering::SeqCst);
        if let Some(worker) = worker.take() {
            let _ = worker.join();
        }
        if let Ok(mut owner) = self.owner.lock() {
            *owner = None;
        }
    }
}
impl Drop for MicrophoneState {
    fn drop(&mut self) {
        self.shutdown();
    }
}
#[derive(Serialize)]
pub struct MicrophoneStatus {
    pub active: bool,
    pub error: Option<String>,
    pub owner: Option<String>,
}
#[derive(Serialize)]
pub struct MicrophoneDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn list_microphone_devices() -> Result<Vec<MicrophoneDevice>, String> {
    let host = cpal::default_host();
    let default = host.default_input_device().and_then(|d| d.name().ok());
    host.input_devices()
        .map_err(|e| e.to_string())?
        .enumerate()
        .map(|(index, device)| {
            let name = device.name().map_err(|e| e.to_string())?;
            Ok(MicrophoneDevice {
                id: index.to_string(),
                is_default: default.as_ref() == Some(&name),
                name,
            })
        })
        .collect()
}
#[tauri::command]
pub fn get_microphone_status(state: State<'_, MicrophoneState>) -> MicrophoneStatus {
    MicrophoneStatus {
        active: state.active.load(Ordering::SeqCst),
        error: state.error.lock().ok().and_then(|e| e.clone()),
        owner: state.owner.lock().ok().and_then(|owner| owner.clone()),
    }
}
#[tauri::command]
pub fn stop_microphone(
    window: WebviewWindow,
    state: State<'_, MicrophoneState>,
) -> Result<(), String> {
    let mut worker = state
        .worker
        .lock()
        .map_err(|_| "Microphone lock unavailable")?;
    if state
        .owner
        .lock()
        .map_err(|_| "Microphone ownership unavailable")?
        .as_ref()
        .is_some_and(|owner| owner != window.label())
    {
        return Err("Microphone is already in use by another Fluely window".into());
    }
    state.stop_worker(&mut worker);
    Ok(())
}

fn emit_audio(app: &AppHandle, owner: &str, samples: Vec<f32>) {
    let _ = app.emit_to(
        owner,
        "microphone-input",
        base64::engine::general_purpose::STANDARD.encode(core::wav(&samples)),
    );
}
fn capture(
    app: AppHandle,
    owner: String,
    device_id: Option<String>,
    active: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    ready: mpsc::SyncSender<Result<(), String>>,
) {
    let result = (|| -> Result<(), String> {
        let host = cpal::default_host();
        let device = if let Some(id) = device_id.filter(|id| !id.is_empty()) {
            let mut devices = host.input_devices().map_err(|e| e.to_string())?;
            if let Ok(index) = id.parse::<usize>() {
                devices.nth(index)
            } else {
                devices.find(|device| device.name().is_ok_and(|name| name == id))
            }
            .ok_or("Selected microphone is no longer available")?
        } else {
            host.default_input_device().ok_or("No microphone found. Connect an input device and allow native microphone access in Windows privacy settings.")?
        };
        let supported = device
            .default_input_config()
            .map_err(|e| format!("Microphone configuration: {e}"))?;
        let rate = supported.sample_rate().0;
        let channels = supported.channels() as usize;
        if !(8_000..=192_000).contains(&rate) || channels == 0 || channels > 32 {
            return Err("Unsupported microphone sample rate or channel count".into());
        }
        let (send, receive) = mpsc::sync_channel::<Vec<f32>>(32);
        let callback_error = error.clone();
        let callback_active = active.clone();
        let callback_app = app.clone();
        let callback_owner = owner.clone();
        let on_error = move |e: cpal::StreamError| {
            let message = format!("Microphone stopped: {e}");
            if let Ok(mut error) = callback_error.lock() {
                *error = Some(message.clone());
            }
            callback_active.store(false, Ordering::SeqCst);
            let _ = callback_app.emit_to(callback_owner.as_str(), "microphone-error", message);
        };
        let config: cpal::StreamConfig = supported.clone().into();
        // The callback never blocks the real-time audio thread. The queue is capped.
        let queue = move |samples: Vec<f32>| {
            let _ = send.try_send(samples);
        };
        let stream = match supported.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    queue(
                        data.chunks_exact(channels)
                            .map(|v| v.iter().sum::<f32>() / channels as f32)
                            .collect(),
                    )
                },
                on_error,
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    queue(
                        data.chunks_exact(channels)
                            .map(|v| {
                                v.iter().map(|x| *x as f32 / 32768.0).sum::<f32>() / channels as f32
                            })
                            .collect(),
                    )
                },
                on_error,
                None,
            ),
            cpal::SampleFormat::U16 => device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    queue(
                        data.chunks_exact(channels)
                            .map(|v| {
                                v.iter()
                                    .map(|x| (*x as f32 - 32768.0) / 32768.0)
                                    .sum::<f32>()
                                    / channels as f32
                            })
                            .collect(),
                    )
                },
                on_error,
                None,
            ),
            other => {
                return Err(format!(
                    "Unsupported microphone format {other:?}; choose another input device"
                ))
            }
        }
        .map_err(|e| format!("Open microphone: {e}"))?;
        stream
            .play()
            .map_err(|e| format!("Start microphone: {e}"))?;
        let _ = ready.send(Ok(()));
        let _ = app.emit_to(owner.as_str(), "microphone-started", rate);
        let mut vad = core::Segmenter::new();
        // Linear, stateful resampling; retains fractional phase between callbacks.
        let step = rate as f64 / core::RATE as f64;
        let mut position = 0.0f64;
        let mut pending = Vec::<f32>::new();
        let mut meter = crate::audio_levels::Meter::new();
        while active.load(Ordering::SeqCst) {
            match receive.recv_timeout(Duration::from_millis(50)) {
                Ok(samples) => {
                    meter.update(&app, "[mic]", &samples);
                    pending.extend(samples);
                    while position + 1.0 < (pending.len() as f64) {
                        let index = position as usize;
                        let fraction = (position - index as f64) as f32;
                        let sample =
                            pending[index] + (pending[index + 1] - pending[index]) * fraction;
                        if let Some(segment) = vad.push(sample) {
                            emit_audio(&app, owner.as_str(), segment);
                        }
                        position += step;
                    }
                    let consumed = (position as usize).min(pending.len());
                    pending.drain(..consumed);
                    position -= consumed as f64;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        drop(stream);
        if let Some(segment) = vad.finish() {
            emit_audio(&app, owner.as_str(), segment);
        }
        Ok(())
    })();
    if let Err(message) = result {
        if let Ok(mut error) = error.lock() {
            *error = Some(message.clone());
        }
        let _ = ready.send(Err(message.clone()));
        let _ = app.emit_to(owner.as_str(), "microphone-error", message);
    }
    active.store(false, Ordering::SeqCst);
    let _ = app.emit_to(owner.as_str(), "microphone-stopped", ());
}
#[tauri::command]
pub fn start_microphone(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, MicrophoneState>,
    device_id: Option<String>,
) -> Result<(), String> {
    let mut worker = state
        .worker
        .lock()
        .map_err(|_| "Microphone lock unavailable")?;
    crate::sleep::ensure_awake(&app)?;
    if state.active.load(Ordering::SeqCst) {
        if state
            .owner
            .lock()
            .map_err(|_| "Microphone ownership unavailable")?
            .as_deref()
            == Some(window.label())
        {
            return Ok(());
        }
        return Err("Microphone is already in use by another Fluely window".into());
    }
    if let Some(previous) = worker.take() {
        let _ = previous.join();
    }
    if let Ok(mut error) = state.error.lock() {
        *error = None;
    }
    let owner = window.label().to_owned();
    *state
        .owner
        .lock()
        .map_err(|_| "Microphone ownership unavailable")? = Some(owner.clone());
    state.active.store(true, Ordering::SeqCst);
    let (ready_send, ready_receive) = mpsc::sync_channel(1);
    let active = state.active.clone();
    let error = state.error.clone();
    *worker = Some(thread::spawn(move || {
        capture(app, owner, device_id, active, error, ready_send)
    }));
    match ready_receive.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => Err(error),
        Err(_) => {
            state.active.store(false, Ordering::SeqCst);
            Err("Microphone did not start within 5 seconds".into())
        }
    }
}
