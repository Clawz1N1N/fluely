//! Owned, loopback-only llama.cpp/whisper.cpp servers. No shell or model downloads.
#[path = "local_engine_asr_worker.rs"]
mod asr_worker;
#[path = "local_engine_core.rs"]
mod core;
#[path = "local_engine_job.rs"]
mod job;
#[path = "local_model_manifest.rs"]
mod models;
pub fn gguf_asr_worker_mode() -> bool {
    asr_worker::worker_mode()
}
use crate::providers::ProviderEntry;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    io::{BufRead, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_http::reqwest;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalEngineConfig {
    pub kind: String,
    pub executable: String,
    pub model_path: String,
    pub mmproj_path: String,
    pub port: u16,
    pub threads: u16,
    pub context: u32,
    pub gpu_layers: u16,
    pub language: String,
}
impl LocalEngineConfig {
    fn default_for(kind: &str, port: u16) -> Self {
        Self {
            kind: kind.into(),
            executable: String::new(),
            model_path: String::new(),
            mmproj_path: String::new(),
            port,
            threads: 4,
            context: 2048,
            gpu_layers: 0,
            language: "auto".into(),
        }
    }
    fn validate(&self, files: bool) -> Result<(), String> {
        core::validate_limits(
            &self.kind,
            self.port,
            self.threads,
            self.context,
            self.gpu_layers,
        )?;
        if self.language.is_empty()
            || self.language.len() > 16
            || !self
                .language
                .chars()
                .all(|c| c.is_ascii_alphabetic() || c == '-')
        {
            return Err("Language must be auto or a language code such as uk/en".into());
        }
        for path in [&self.executable, &self.model_path, &self.mmproj_path] {
            if path.len() > 32768 || path.contains('\0') {
                return Err("Invalid local engine path".into());
            }
        }
        if files {
            if self.executable.is_empty() || !Path::new(&self.executable).is_file() {
                return Err("Engine executable is missing. Download the CPU engine or choose llama-server / whisper-server.".into());
            }
            let executable = Path::new(&self.executable);
            if !executable.is_absolute() {
                return Err("Engine executable must use an absolute path".into());
            }
            #[cfg(target_os = "windows")]
            if executable.extension().is_none_or(|ext| {
                !ext.eq_ignore_ascii_case(if self.kind == "gguf-asr" {
                    "dll"
                } else {
                    "exe"
                })
            }) {
                return Err(
                    "Choose the engine's native .exe server or transcribe.dll for GGUF ASR".into(),
                );
            }
            if self.kind == "gguf-asr" && self.gpu_layers != 0 {
                return Err("Managed GGUF ASR uses the CPU backend; GPU layers must be 0".into());
            }
            if self.model_path.is_empty() {
                return Err(if self.kind == "stt" {
                    "Choose a whisper.cpp GGML .bin model before starting"
                } else {
                    "Choose a GGUF model before starting"
                }
                .into());
            }
            if !Path::new(&self.model_path).is_absolute()
                || (!self.mmproj_path.is_empty() && !Path::new(&self.mmproj_path).is_absolute())
            {
                return Err("Model and projector files must use absolute paths".into());
            }
            core::validate_model(Path::new(&self.model_path), self.kind == "stt")?;
            if self.kind == "vision" && self.mmproj_path.is_empty() {
                return Err(
                    "Local vision requires the matching multimodal projector (mmproj GGUF)".into(),
                );
            }
            if !self.mmproj_path.is_empty() {
                core::validate_model(Path::new(&self.mmproj_path), false)?;
            }
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct LocalEngineStatus {
    pub kind: String,
    pub state: String,
    pub pid: Option<u32>,
    pub url: Option<String>,
    pub error: Option<String>,
    pub logs: Vec<String>,
}
struct OwnedServer {
    child: Child,
    _job: job::ProcessJob,
    asr: Option<AsrPipe>,
}
struct AsrPipe {
    input: Arc<Mutex<std::process::ChildStdin>>,
    responses: tokio::sync::mpsc::Receiver<serde_json::Value>,
}
impl AsrPipe {
    fn new(input: std::process::ChildStdin, output: std::process::ChildStdout) -> Self {
        let (sender, responses) = tokio::sync::mpsc::channel(8);
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(output);
            loop {
                let mut line = String::new();
                match reader.by_ref().take(131073).read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(size) => {
                        if size > 131072 {
                            let _ = sender.blocking_send(
                                serde_json::json!({"error":"ASR worker response exceeds 128 KiB"}),
                            );
                            break;
                        }
                        if let Ok(response) = serde_json::from_str(&line) {
                            if sender.blocking_send(response).is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        });
        Self {
            input: Arc::new(Mutex::new(input)),
            responses,
        }
    }
    async fn transcribe(&mut self, audio: String) -> Result<String, String> {
        let input = self.input.clone();
        let mut data =
            serde_json::to_vec(&serde_json::json!({"audio":audio})).map_err(|e| e.to_string())?;
        data.push(b'\n');
        tauri::async_runtime::spawn_blocking(move || {
            let mut input = input
                .lock()
                .map_err(|_| "ASR input lock unavailable".to_string())?;
            input
                .write_all(&data)
                .and_then(|_| input.flush())
                .map_err(|e| format!("ASR worker input: {e}"))
        })
        .await
        .map_err(|e| e.to_string())??;
        let response = self
            .responses
            .recv()
            .await
            .ok_or("ASR worker stopped before returning a transcript")?;
        if let Some(error) = response["error"].as_str() {
            return Err(error.into());
        }
        response["text"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| "Invalid ASR worker transcript response".into())
    }
}
impl Drop for OwnedServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Default)]
struct EngineSlot {
    server: tokio::sync::Mutex<Option<OwnedServer>>,
    status: Mutex<LocalEngineStatus>,
    logs: Arc<Mutex<VecDeque<String>>>,
    stop: AtomicBool,
}
#[derive(Default)]
pub struct LocalEngineState {
    configs: Mutex<Option<Vec<LocalEngineConfig>>>,
    brain: EngineSlot,
    stt: EngineSlot,
    vision: EngineSlot,
    gguf_asr: EngineSlot,
    installing: tokio::sync::Mutex<()>,
    asr_admission: AsrAdmission,
}
struct AsrAdmission(tokio::sync::Semaphore);
impl Default for AsrAdmission {
    fn default() -> Self { Self(tokio::sync::Semaphore::new(8)) }
}
async fn admit_asr<'a>(slot: &'a EngineSlot, admission: &'a AsrAdmission, deadline: tokio::time::Instant)
    -> Result<(tokio::sync::SemaphorePermit<'a>, tokio::sync::MutexGuard<'a, Option<OwnedServer>>), String> {
    let permit = admission.0.try_acquire().map_err(|_| "GGUF ASR queue is full (maximum 8 recordings); use another STT provider or a smaller model")?;
    let server = tokio::time::timeout_at(deadline, slot.server.lock()).await
        .map_err(|_| "GGUF ASR queue wait exceeded the 90-second request deadline")?;
    Ok((permit, server))
}

#[cfg(test)]
mod admission_tests {
    use super::*;
    #[test]
    fn restarting_a_managed_model_preserves_its_account_rank_limits_and_manual_capabilities() {
        let mut config = LocalEngineConfig::default_for("vision",8083);
        config.model_path="same.gguf".into();config.mmproj_path="same-mmproj.gguf".into();
        let mut saved = provider(&config,true);
        saved.rank=7;saved.limit_per_minute=12;saved.display_name="My vision".into();
        saved.credential_id=saved.id.clone();saved.supports_images=false;saved.max_output_tokens=Some(100);
        let updated=retain_managed_preferences(provider(&config,true),saved);
        assert_eq!(updated.rank,7);assert_eq!(updated.limit_per_minute,12);
        assert_eq!(updated.display_name,"My vision");assert_eq!(updated.credential_id,updated.id);
        assert!(!updated.supports_images);assert_eq!(updated.max_output_tokens,Some(100));
    }
    #[tokio::test]
    async fn asr_queue_has_a_fixed_capacity_and_releases_cancelled_recordings() {
        let state = LocalEngineState::default();
        let mut permits = (0..8).map(|_| state.asr_admission.0.try_acquire().unwrap()).collect::<Vec<_>>();
        let error = admit_asr(&state.gguf_asr, &state.asr_admission, tokio::time::Instant::now()+Duration::from_secs(1)).await.err().unwrap();
        assert!(error.contains("queue is full"));
        permits.pop();
        let accepted = admit_asr(&state.gguf_asr, &state.asr_admission, tokio::time::Instant::now()+Duration::from_secs(1)).await.unwrap();
        drop(accepted);
        assert_eq!(state.asr_admission.0.available_permits(),1);
    }
    #[tokio::test]
    async fn inference_lock_wait_uses_the_request_deadline_and_returns_its_queue_permit() {
        let state = LocalEngineState::default();
        let _held = state.gguf_asr.server.lock().await;
        let error = admit_asr(&state.gguf_asr, &state.asr_admission, tokio::time::Instant::now()).await.err().unwrap();
        assert!(error.contains("queue wait exceeded"));
        assert_eq!(state.asr_admission.0.available_permits(),8);
    }
}
impl LocalEngineState {
    fn slot(&self, kind: &str) -> Result<&EngineSlot, String> {
        match kind {
            "brain" => Ok(&self.brain),
            "stt" => Ok(&self.stt),
            "vision" => Ok(&self.vision),
            "gguf-asr" => Ok(&self.gguf_asr),
            _ => Err("Unsupported local engine kind".into()),
        }
    }
    pub fn shutdown(&self) {
        for slot in [&self.brain, &self.stt, &self.vision, &self.gguf_asr] {
            slot.stop.store(true, Ordering::SeqCst);
            if let Ok(mut server) = slot.server.try_lock() {
                server.take();
            }
        }
    }
}
impl Drop for LocalEngineState {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::data_dir(app)?.join("local-engines.json"))
}
fn load_configs(
    app: &AppHandle,
    state: &LocalEngineState,
) -> Result<Vec<LocalEngineConfig>, String> {
    let mut stored = state
        .configs
        .lock()
        .map_err(|_| "Local config lock unavailable")?;
    if stored.is_none() {
        let path = config_path(app)?;
        let defaults = vec![
            LocalEngineConfig::default_for("brain", 8081),
            LocalEngineConfig::default_for("stt", 8082),
            LocalEngineConfig::default_for("vision", 8083),
            LocalEngineConfig::default_for("gguf-asr", 8084),
        ];
        let configs = if path.exists() {
            let bytes =
                std::fs::read(path).map_err(|e| format!("Read local engine settings: {e}"))?;
            if bytes.len() > 128 * 1024 {
                return Err("Local engine settings exceed 128 KiB".into());
            }
            let mut parsed: Vec<LocalEngineConfig> = serde_json::from_slice(&bytes)
                .map_err(|e| format!("Invalid local engine settings: {e}"))?;
            if !parsed.iter().any(|config| config.kind == "gguf-asr") {
                parsed.push(LocalEngineConfig::default_for("gguf-asr", 8084));
            }
            validate_configs(&parsed)?;
            parsed
        } else {
            defaults
        };
        // A previous application run may have crashed with providers enabled.
        // No persisted local provider is available until this process owns it.
        let existing = crate::providers::list_providers(app.clone())?;
        for mut provider in existing.into_iter().filter(|entry| {
            [
                "fluely-local-brain",
                "fluely-local-stt",
                "fluely-local-vision",
                "fluely-local-gguf-asr",
            ]
            .contains(&entry.id.as_str())
        }) {
            provider.enabled = false;
            crate::providers::upsert_provider(app.clone(), provider)?;
        }
        *stored = Some(configs);
    }
    Ok(stored.as_ref().unwrap().clone())
}
fn validate_configs(configs: &[LocalEngineConfig]) -> Result<(), String> {
    if configs.len() != 4 {
        return Err("Expected independent brain, Whisper, GGUF ASR and vision settings".into());
    }
    let mut kinds = std::collections::HashSet::new();
    let mut ports = std::collections::HashSet::new();
    for config in configs {
        config.validate(false)?;
        if !kinds.insert(&config.kind) || (config.kind != "gguf-asr" && !ports.insert(config.port))
        {
            return Err("Local engines require distinct kinds and ports".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn get_local_engine_configs(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
) -> Result<Vec<LocalEngineConfig>, String> {
    load_configs(&app, &state)
}
#[tauri::command]
pub fn save_local_engine_config(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    config: LocalEngineConfig,
) -> Result<(), String> {
    config.validate(false)?;
    let slot = state.slot(&config.kind)?;
    let phase = slot
        .status
        .lock()
        .map_err(|_| "Local status lock unavailable")?
        .state
        .clone();
    if phase == "running" || phase == "starting" {
        return Err("Stop this local engine before changing its configuration".into());
    }
    load_configs(&app, &state)?;
    let mut stored = state
        .configs
        .lock()
        .map_err(|_| "Local config lock unavailable")?;
    let mut configs = stored.as_ref().ok_or("Local settings unavailable")?.clone();
    let index = configs
        .iter()
        .position(|c| c.kind == config.kind)
        .ok_or("Unknown engine kind")?;
    configs[index] = config;
    validate_configs(&configs)?;
    crate::shell_store::replace_file(
        &config_path(&app)?,
        &serde_json::to_vec_pretty(&configs).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Save local engine settings: {e}"))?;
    *stored = Some(configs);
    Ok(())
}
fn set_status(app: &AppHandle, slot: &EngineSlot, status: LocalEngineStatus) {
    if let Ok(mut current) = slot.status.lock() {
        *current = status.clone();
    }
    let _ = app.emit("local-engine-status", status);
}
fn drain_log(reader: impl Read + Send + 'static, logs: Arc<Mutex<VecDeque<String>>>) {
    std::thread::spawn(move || {
        // Byte-based framing also caps engines that produce very long/no-newline output.
        let mut reader = reader;
        let mut buffer = [0u8; 1024];
        let mut line = Vec::new();
        while let Ok(size) = reader.read(&mut buffer) {
            if size == 0 {
                break;
            }
            for byte in &buffer[..size] {
                if *byte == b'\n' || line.len() >= 1024 {
                    if let Ok(mut logs) = logs.lock() {
                        logs.push_back(String::from_utf8_lossy(&line).trim().into());
                        while logs.len() > 80 {
                            logs.pop_front();
                        }
                    }
                    line.clear();
                } else {
                    line.push(*byte);
                }
            }
        }
        if !line.is_empty() {
            if let Ok(mut logs) = logs.lock() {
                logs.push_back(String::from_utf8_lossy(&line).into());
                while logs.len() > 80 {
                    logs.pop_front();
                }
            }
        }
    });
}
fn provider(config: &LocalEngineConfig, enabled: bool) -> ProviderEntry {
    let stt = config.kind == "stt";
    let asr = config.kind == "gguf-asr";
    let base = format!("http://127.0.0.1:{}", config.port);
    let provider_name = if asr {
        "transcribe.cpp"
    } else if stt {
        "whisper.cpp"
    } else {
        "llama.cpp"
    };
    serde_json::from_value(serde_json::json!({
        "id":format!("fluely-local-{}",config.kind),"kind":if asr{"stt"}else{config.kind.as_str()},
        "preset":if asr{"local-gguf-asr"}else if stt{"custom"}else{"openai-compatible"},
        "base_url":if asr{"http://127.0.0.1".into()}else if stt{base.clone()}else{format!("{base}/v1")},
        "model":format!("fluely-local-{}",config.kind),"provider_id":format!("local-{provider_name}"),"provider_name":provider_name,
        "display_name":format!("Local {}",config.kind),"model_display_name":Path::new(&config.model_path).file_name().unwrap_or_default().to_string_lossy(),
        "supports_audio":stt||asr,"supports_images":!config.mmproj_path.is_empty(),"rank":0,"enabled":enabled,
        "context_window":if stt||asr{None}else{Some(config.context)},
        "max_output_tokens":if stt||asr{None}else{Some((config.context/4).min(1024))},
        "curl":stt.then(||format!("curl --request POST {base}/inference -F 'file=@{{{{AUDIO}}}}' -F 'response_format=json' -F 'language={}'",config.language)),
        "streaming":!stt&&!asr,"response_content_path":if stt||asr{"text"}else{"choices.0.message.content"}
    })).expect("Native local provider metadata matches the serializable registry schema")
}
fn retain_managed_preferences(mut runtime: ProviderEntry, previous: ProviderEntry) -> ProviderEntry {
    runtime.rank = previous.rank;
    runtime.limit_per_second = previous.limit_per_second;
    runtime.limit_per_minute = previous.limit_per_minute;
    runtime.limit_per_hour = previous.limit_per_hour;
    runtime.limit_per_day = previous.limit_per_day;
    runtime.token_limit_per_second = previous.token_limit_per_second;
    runtime.token_limit_per_minute = previous.token_limit_per_minute;
    runtime.token_limit_per_hour = previous.token_limit_per_hour;
    runtime.token_limit_per_day = previous.token_limit_per_day;
    runtime.manual_neutral = previous.manual_neutral;
    runtime.reasoning_effort = previous.reasoning_effort;
    runtime.reasoning_efforts = previous.reasoning_efforts;
    runtime.credential_id = previous.credential_id;
    runtime.secret_keys = previous.secret_keys;
    if !previous.display_name.is_empty() { runtime.display_name = previous.display_name; }
    if previous.model_display_name == runtime.model_display_name {
        runtime.supports_images &= previous.supports_images;
        runtime.supports_audio &= previous.supports_audio;
        if let (Some(configured), Some(actual)) = (previous.max_output_tokens, runtime.context_window) {
            runtime.max_output_tokens = Some(configured.min(actual));
        }
    }
    runtime
}
fn register_managed_provider(app: &AppHandle, config: &LocalEngineConfig, enabled: bool) -> Result<(), String> {
    let runtime = provider(config, enabled);
    let previous = crate::providers::list_providers(app.clone())?.into_iter().find(|entry| entry.id == runtime.id);
    let entry = if let Some(saved) = previous { retain_managed_preferences(runtime, saved) } else { runtime };
    crate::providers::upsert_provider(app.clone(), entry)
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_millis(500))
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())
}
async fn healthy(client: &reqwest::Client, port: u16) -> bool {
    match client
        .get(format!("http://127.0.0.1:{port}/health"))
        .send()
        .await
    {
        Ok(mut response) if response.status().is_success() => {
            if response.content_length().is_some_and(|n| n > 65536) {
                return false;
            }
            // Both pinned servers return status:ok only after model load completes.
            let mut bytes = Vec::new();
            loop {
                match response.chunk().await {
                    Ok(Some(chunk)) => {
                        if bytes.len() + chunk.len() > 65536 {
                            return false;
                        }
                        bytes.extend(chunk);
                    }
                    Ok(None) => break,
                    Err(_) => return false,
                }
            }
            serde_json::from_slice::<serde_json::Value>(&bytes)
                .ok()
                .is_some_and(|value| value["status"] == "ok")
        }
        _ => false,
    }
}
#[tauri::command]
pub async fn get_local_engine_status(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
) -> Result<Vec<LocalEngineStatus>, String> {
    let configs = load_configs(&app, &state)?;
    let mut results = Vec::new();
    for config in configs {
        let slot = state.slot(&config.kind)?;
        if let Ok(mut server) = slot.server.try_lock() {
            if let Some(owned) = server.as_mut() {
                if let Some(exit) = owned.child.try_wait().map_err(|e| e.to_string())? {
                    server.take();
                    let _ =
                        register_managed_provider(&app, &config, false);
                    set_status(
                        &app,
                        slot,
                        LocalEngineStatus {
                            kind: config.kind.clone(),
                            state: "error".into(),
                            error: Some(format!("Engine exited: {exit}")),
                            ..Default::default()
                        },
                    );
                }
            }
        }
        let mut status = slot
            .status
            .lock()
            .map_err(|_| "Local status lock unavailable")?
            .clone();
        if status.kind.is_empty() {
            status.kind = config.kind;
            status.state = "stopped".into();
        }
        status.logs = slot
            .logs
            .lock()
            .map_err(|_| "Local log lock unavailable")?
            .iter()
            .cloned()
            .collect();
        results.push(status);
    }
    Ok(results)
}
#[tauri::command]
pub async fn start_local_engine(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    kind: String,
) -> Result<LocalEngineStatus, String> {
    let config = load_configs(&app, &state)?
        .into_iter()
        .find(|c| c.kind == kind)
        .ok_or("Unknown engine kind")?;
    config.validate(true)?;
    let slot = state.slot(&kind)?;
    let mut server = slot.server.lock().await;
    if server.is_some() {
        return Err("Engine is already running. Stop or restart it to apply new settings.".into());
    }
    // Refuse attaching to an unrelated local service or claiming another process is ours.
    if kind != "gguf-asr" {
        let listener = std::net::TcpListener::bind(("127.0.0.1", config.port)).map_err(|_| {
            format!(
                "Port {} is already in use; choose another port",
                config.port
            )
        })?;
        drop(listener);
    }
    slot.stop.store(false, Ordering::SeqCst);
    if let Ok(mut logs) = slot.logs.lock() {
        logs.clear();
    }
    let args = core::arguments(core::LaunchOptions {
        kind: &kind,
        model: &config.model_path,
        projector: (!config.mmproj_path.is_empty()).then_some(config.mmproj_path.as_str()),
        port: config.port,
        threads: config.threads,
        context: config.context,
        gpu_layers: config.gpu_layers,
        language: &config.language,
    });
    let mut command = if kind == "gguf-asr" {
        let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
        command.args([
            "--fluely-gguf-asr-worker",
            &config.executable,
            &config.model_path,
            &config.threads.to_string(),
            &config.language,
        ]);
        command.stdin(Stdio::piped());
        command
    } else {
        let mut command = Command::new(&config.executable);
        command.args(args).stdin(Stdio::null());
        command
    };
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(parent) = Path::new(&config.executable).parent() {
        command.current_dir(parent);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start local engine: {e}"))?;
    let process_job = match job::ProcessJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let mut owned = OwnedServer {
        child,
        _job: process_job,
        asr: None,
    };
    if kind == "gguf-asr" {
        owned.asr = Some(AsrPipe::new(
            owned
                .child
                .stdin
                .take()
                .ok_or("ASR input pipe unavailable")?,
            owned
                .child
                .stdout
                .take()
                .ok_or("ASR output pipe unavailable")?,
        ));
    }
    if let Some(out) = owned.child.stdout.take() {
        drain_log(out, slot.logs.clone());
    }
    if let Some(err) = owned.child.stderr.take() {
        drain_log(err, slot.logs.clone());
    }
    set_status(
        &app,
        slot,
        LocalEngineStatus {
            kind: kind.clone(),
            state: "starting".into(),
            pid: Some(owned.child.id()),
            ..Default::default()
        },
    );
    let check = client();
    let result:Result<LocalEngineStatus,String>=async{
        let client=check?;let deadline=Instant::now()+Duration::from_secs(120);
        loop{
            if slot.stop.load(Ordering::SeqCst){return Err("Engine startup cancelled".into());}
            if let Some(asr)=owned.asr.as_mut(){
                match tokio::time::timeout(Duration::from_millis(250),asr.responses.recv()).await{
                    Ok(Some(response))=>{
                        if let Some(error)=response["error"].as_str(){return Err(error.into());}
                        if response["ready"]==true&&response["protocol"]==1&&response["backend"]=="cpu"{
                            register_managed_provider(&app,&config,true)?;
                            return Ok(LocalEngineStatus{kind:kind.clone(),state:"running".into(),pid:Some(owned.child.id()),..Default::default()});
                        }
                        return Err("Unexpected GGUF ASR worker readiness response".into());
                    },Ok(None)=>return Err("GGUF ASR worker stopped during model loading".into()),Err(_)=>{},
                }
            }
            if let Some(exit)=owned.child.try_wait().map_err(|e|e.to_string())?{return Err(format!("Engine exited while loading the model: {exit}. See its log and verify the model/runtime match."));}
            if kind!="gguf-asr"&&healthy(&client,config.port).await{
                register_managed_provider(&app,&config,true)?;
                return Ok(LocalEngineStatus{kind:kind.clone(),state:"running".into(),pid:Some(owned.child.id()),url:Some(format!("http://127.0.0.1:{}",config.port)),..Default::default()});
            }
            if Instant::now()>=deadline{return Err("Local model did not become ready within 120 seconds. Try a smaller model/context or inspect the log.".into());}
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }.await;
    match result {
        Ok(status) => {
            *server = Some(owned);
            set_status(&app, slot, status.clone());
            let monitor_app = app.clone();
            let monitor_kind = kind.clone();
            let pid = status.pid;
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    let state = monitor_app.state::<LocalEngineState>();
                    let slot = match state.slot(&monitor_kind) {
                        Ok(slot) => slot,
                        Err(_) => break,
                    };
                    let keep =
                        !slot.stop.load(Ordering::SeqCst)
                            && slot.status.lock().ok().is_some_and(|status| {
                                status.state == "running" && status.pid == pid
                            });
                    if !keep {
                        break;
                    }
                    let _ = get_local_engine_status(monitor_app.clone(), state).await;
                }
            });
            Ok(status)
        }
        Err(error) => {
            drop(owned);
            let _ = register_managed_provider(&app, &config, false);
            set_status(
                &app,
                slot,
                LocalEngineStatus {
                    kind,
                    state: "error".into(),
                    error: Some(error.clone()),
                    ..Default::default()
                },
            );
            Err(error)
        }
    }
}
#[tauri::command]
pub async fn stop_local_engine(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    kind: String,
) -> Result<(), String> {
    let slot = state.slot(&kind)?;
    slot.stop.store(true, Ordering::SeqCst);
    slot.server.lock().await.take();
    if let Some(config) = load_configs(&app, &state)?.iter().find(|c| c.kind == kind) {
        register_managed_provider(&app, config, false)?;
    }
    set_status(
        &app,
        slot,
        LocalEngineStatus {
            kind,
            state: "stopped".into(),
            ..Default::default()
        },
    );
    Ok(())
}
#[tauri::command]
pub async fn restart_local_engine(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    kind: String,
) -> Result<LocalEngineStatus, String> {
    stop_local_engine(app.clone(), state.clone(), kind.clone()).await?;
    start_local_engine(app, state, kind).await
}
#[tauri::command]
pub async fn test_local_engine(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    kind: String,
) -> Result<String, String> {
    let config = load_configs(&app, &state)?
        .into_iter()
        .find(|c| c.kind == kind)
        .ok_or("Unknown engine kind")?;
    config.validate(true)?;
    let slot = state.slot(&kind)?;
    if slot.server.lock().await.is_none() {
        return Err("Start this engine before testing its readiness".into());
    }
    if kind == "gguf-asr" {
        return Ok("GGUF ASR model is loaded in its isolated CPU worker".into());
    }
    if !healthy(&client()?, config.port).await {
        return Err("Engine is not ready. Start it and inspect the log.".into());
    }
    Ok("Local server is healthy and its model is loaded".into())
}

#[tauri::command]
pub async fn transcribe_gguf_asr_audio(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    audio_base64: String,
    provider_id: Option<String>,
) -> Result<String, String> {
    if provider_id
        .as_deref()
        .is_some_and(|id| id != "fluely-local-gguf-asr")
    {
        return Err(
            "This native ASR worker is bound to the managed fluely-local-gguf-asr model".into(),
        );
    }
    if audio_base64.len() > 24 * 1024 * 1024 {
        return Err("ASR audio exceeds its encoded size limit".into());
    }
    let slot = state.slot("gguf-asr")?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
    let (_permit, mut server) = admit_asr(slot, &state.asr_admission, deadline).await?;
    let asr = server
        .as_mut()
        .and_then(|server| server.asr.as_mut())
        .ok_or("Start the GGUF ASR engine in Local engines settings before transcribing")?;
    match tokio::time::timeout_at(deadline, asr.transcribe(audio_base64)).await {
        Ok(result) => result,
        Err(_) => {
            server.take();
            slot.stop.store(true, Ordering::SeqCst);
            if let Some(config) = load_configs(&app, &state)?
                .iter()
                .find(|config| config.kind == "gguf-asr")
            {
                let _ = register_managed_provider(&app, config, false);
            }
            let error = "GGUF ASR inference exceeded 90 seconds; its owned worker was stopped";
            set_status(
                &app,
                slot,
                LocalEngineStatus {
                    kind: "gguf-asr".into(),
                    state: "error".into(),
                    error: Some(error.into()),
                    ..Default::default()
                },
            );
            Err(error.into())
        }
    }
}
// Engine packages are deliberately pinned, verified, and installed under app data.
// Models are selected explicitly and never downloaded by this installer.
struct Package {
    url: &'static str,
    sha256: &'static str,
    version: &'static str,
    executable: &'static str,
    license_url: &'static str,
}
fn package(kind: &str) -> Result<Package, String> {
    match kind{
    "brain"|"vision"=>Ok(Package{url:"https://github.com/ggml-org/llama.cpp/releases/download/b11575/llama-b11575-bin-win-cpu-x64.zip",sha256:"8c0508c796e1fe5d1e6bcf1d659b55be834348d5fff08aaba1b6d068abef55e6",version:"llama-b11575-cpu-x64",executable:"llama-server.exe",license_url:"https://raw.githubusercontent.com/ggml-org/llama.cpp/b11575/LICENSE"}),
    "stt"=>Ok(Package{url:"https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",sha256:"6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",version:"whisper-b5454-cpu-x64",executable:"whisper-server.exe",license_url:"https://raw.githubusercontent.com/ggml-org/whisper.cpp/b5454/LICENSE"}),
    "gguf-asr"=>Ok(Package{url:"https://github.com/handy-computer/transcribe.cpp/releases/download/v0.4.0/transcribe-native-0.4.0-windows-x86_64-cpu-vulkan.tar.gz",sha256:"9d5bd89f720d7979323e73f5220fe50fad5e38a7b0c2525225d453bd09adf2b0",version:"transcribe-v0.4.0-cpu-x64",executable:"transcribe.dll",license_url:"https://raw.githubusercontent.com/handy-computer/transcribe.cpp/v0.4.0/LICENSE"}),
    _=>Err("Unknown engine kind".into()),
}
}
fn find_executable(directory: &Path, name: &str) -> Result<PathBuf, String> {
    let mut directories = vec![directory.to_path_buf()];
    let mut visited = 0;
    while let Some(directory) = directories.pop() {
        visited += 1;
        if visited > 128 {
            return Err("Engine archive contains too many directories".into());
        }
        for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                directories.push(entry.path());
            } else if entry.file_name().eq_ignore_ascii_case(name) {
                return Ok(entry.path());
            }
        }
    }
    Err(format!(
        "Official package does not contain {name}; select a separately built server executable"
    ))
}
#[tauri::command]
pub async fn install_local_engine(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    kind: String,
) -> Result<String, String> {
    if !cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        return Err("Automatic CPU engine installation supports Windows x64. Browse to a compatible server executable on this platform.".into());
    }
    let _install = state.installing.lock().await;
    let package = package(&kind)?;
    let root = crate::app_paths::data_dir(&app)?.join("engines");
    let destination = root.join(package.version);
    if destination.is_dir() {
        return find_executable(&destination, package.executable)
            .map(|p| p.to_string_lossy().into());
    }
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(package.url)
        .send()
        .await
        .map_err(|e| format!("Official engine download: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Official engine download: {e}"))?;
    if response
        .content_length()
        .is_some_and(|size| size > 64 * 1024 * 1024)
    {
        return Err("Engine package exceeds the 64 MiB CPU-package limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 64 * 1024 * 1024 {
            return Err("Engine package exceeds 64 MiB".into());
        }
        bytes.extend(chunk);
    }
    let hash = ring::digest::digest(&ring::digest::SHA256, &bytes);
    let actual = hash
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != package.sha256 {
        return Err("Official engine checksum mismatch. Nothing was installed.".into());
    }
    let license = client
        .get(package.license_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    if license.len() > 64 * 1024 || !license.contains("MIT License") {
        return Err("Could not verify the engine license".into());
    }
    let staging = root.join(format!("{}.partial", package.version));
    if staging.exists() {
        std::fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir(&staging).map_err(|e| e.to_string())?;
    let executable_name = package.executable.to_string();
    let digest = package.sha256.to_string();
    let source = package.url.to_string();
    let installed = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let result = (|| {
            if executable_name == "transcribe.dll" {
                let decoder = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
                let mut archive = tar::Archive::new(decoder);
                let mut total = 0u64;
                for (index, entry) in archive.entries().map_err(|e| e.to_string())?.enumerate() {
                    if index > 2048 {
                        return Err("Engine archive has too many entries".into());
                    }
                    let mut entry = entry.map_err(|e| e.to_string())?;
                    let path = entry.path().map_err(|e| e.to_string())?.into_owned();
                    if path.components().any(|component| {
                        !matches!(
                            component,
                            std::path::Component::Normal(_) | std::path::Component::CurDir
                        )
                    }) {
                        return Err("ASR archive contains an unsafe path".into());
                    }
                    total = total.saturating_add(entry.size());
                    if total > 256 * 1024 * 1024 {
                        return Err("Unpacked ASR engine exceeds 256 MiB".into());
                    }
                    let target = staging.join(path);
                    let kind = entry.header().entry_type();
                    if kind.is_dir() {
                        std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                    } else if kind.is_file() {
                        if let Some(parent) = target.parent() {
                            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                        }
                        let mut output =
                            std::fs::File::create(&target).map_err(|e| e.to_string())?;
                        std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
                    } else {
                        return Err("ASR archive contains a link or special file".into());
                    }
                }
            } else {
                let mut archive =
                    zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
                if archive.len() > 2048 {
                    return Err("Engine archive has too many entries".into());
                }
                let mut total = 0u64;
                for index in 0..archive.len() {
                    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
                    let relative = entry
                        .enclosed_name()
                        .ok_or("Engine archive contains an unsafe path")?
                        .to_path_buf();
                    total = total.saturating_add(entry.size());
                    if total > 256 * 1024 * 1024 {
                        return Err("Unpacked engine exceeds 256 MiB".into());
                    }
                    if entry
                        .unix_mode()
                        .is_some_and(|mode| mode & 0o170000 == 0o120000)
                    {
                        return Err("Engine archive contains a symlink".into());
                    }
                    let target = staging.join(relative);
                    if entry.is_dir() {
                        std::fs::create_dir_all(target).map_err(|e| e.to_string())?;
                    } else {
                        if let Some(parent) = target.parent() {
                            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                        }
                        let mut file = std::fs::File::create(target).map_err(|e| e.to_string())?;
                        std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
                    }
                }
            }
            find_executable(&staging, &executable_name)?;
            std::fs::write(staging.join("LICENSE-MIT.txt"), license).map_err(|e| e.to_string())?;
            std::fs::write(
                staging.join("SOURCE.txt"),
                format!("Source: {source}\nSHA256: {digest}\n"),
            )
            .map_err(|e| e.to_string())?;
            std::fs::rename(&staging, &destination).map_err(|e| e.to_string())?;
            find_executable(&destination, &executable_name)
        })();
        if result.is_err() {
            let _ = std::fs::remove_dir_all(&staging);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(installed.to_string_lossy().into())
}

#[derive(Serialize)]
pub struct InstalledModel {
    pub model_path: String,
    pub mmproj_path: String,
    pub name: String,
}
struct PartialModel(PathBuf);
impl Drop for PartialModel {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
fn hex_sha(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
async fn verify_model_file(path: PathBuf, size: u64, expected: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !path.is_file() {
            return Ok(false);
        }
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        if file.metadata().map_err(|e| e.to_string())?.len() != size {
            return Ok(false);
        }
        let mut context = ring::digest::Context::new(&ring::digest::SHA256);
        let mut buffer = [0u8; 65536];
        loop {
            let size = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if size == 0 {
                break;
            }
            context.update(&buffer[..size]);
        }
        Ok(hex_sha(context.finish().as_ref()) == expected)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn install_recommended_local_model(
    app: AppHandle,
    state: State<'_, LocalEngineState>,
    kind: String,
) -> Result<InstalledModel, String> {
    use tokio::io::AsyncWriteExt;
    let _install = state.installing.lock().await;
    let package = models::package(&kind)?;
    let root = crate::app_paths::data_dir(&app)?
        .join("models")
        .join(format!(
            "{}-{}",
            package.id.replace('/', "-"),
            &package.revision[..12]
        ));
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?;
    let mut paths = Vec::new();
    for model in package.files {
        let destination = root.join(model.name);
        if !verify_model_file(destination.clone(), model.bytes, model.sha256.into()).await? {
            let partial = root.join(format!("{}.part", model.name));
            let _cleanup = PartialModel(partial.clone());
            let mut output = tokio::fs::File::create(&partial)
                .await
                .map_err(|e| e.to_string())?;
            let url = format!(
                "https://huggingface.co/{}/resolve/{}/{}",
                package.id, package.revision, model.name
            );
            let mut response = client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("Model download: {e}"))?
                .error_for_status()
                .map_err(|e| format!("Model download: {e}"))?;
            if response.content_length().is_some_and(|n| n != model.bytes) {
                return Err("The pinned model download has an unexpected size".into());
            }
            let mut hash = ring::digest::Context::new(&ring::digest::SHA256);
            let mut received = 0u64;
            let mut progress = Instant::now();
            while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
                received = received.saturating_add(chunk.len() as u64);
                if received > model.bytes {
                    return Err("Model download exceeded its pinned size".into());
                }
                output.write_all(&chunk).await.map_err(|e| e.to_string())?;
                hash.update(&chunk);
                if progress.elapsed() >= Duration::from_millis(250) {
                    let _=app.emit("local-model-download",serde_json::json!({"kind":kind,"name":model.name,"received":received,"total":model.bytes}));
                    progress = Instant::now();
                }
            }
            output.flush().await.map_err(|e| e.to_string())?;
            output.sync_all().await.map_err(|e| e.to_string())?;
            drop(output);
            if received != model.bytes || hex_sha(hash.finish().as_ref()) != model.sha256 {
                return Err("Model checksum mismatch. No downloaded model was activated.".into());
            }
            core::validate_model(&partial, kind == "stt")?;
            std::fs::rename(&partial, &destination).map_err(|e| e.to_string())?;
            let _=app.emit("local-model-download",serde_json::json!({"kind":kind,"name":model.name,"received":received,"total":model.bytes}));
        }
        paths.push(destination);
    }
    // Preserve the model card and full declared license beside the weights.
    let card = client
        .get(format!(
            "https://huggingface.co/{}/raw/{}/README.md",
            package.id, package.revision
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let license = client
        .get(package.license_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    if card.len() > 512 * 1024 || license.len() > 128 * 1024 {
        return Err("Model attribution metadata exceeds its size limit".into());
    }
    std::fs::write(root.join("README-MODEL.md"), card).map_err(|e| e.to_string())?;
    std::fs::write(root.join("LICENSE-MODEL.txt"), license).map_err(|e| e.to_string())?;
    std::fs::write(
        root.join("SOURCE.txt"),
        format!(
            "Model: {}\nRevision: {}\nLicense: {}\n{}",
            package.id,
            package.revision,
            package.license,
            package
                .files
                .iter()
                .map(|f| format!("{} {} {} bytes\n", f.name, f.sha256, f.bytes))
                .collect::<String>()
        ),
    )
    .map_err(|e| e.to_string())?;
    Ok(InstalledModel {
        model_path: paths[0].to_string_lossy().into(),
        mmproj_path: paths
            .get(1)
            .map(|p| p.to_string_lossy().into())
            .unwrap_or_default(),
        name: package.id.into(),
    })
}
