//! Versioned JSON-lines protocol for the isolated transcribe.cpp worker.
#[path = "local_engine_asr_audio.rs"]
mod audio;
#[path = "local_engine_asr_ffi.rs"]
mod ffi;
use base64::Engine;
use std::{
    io::{BufRead, Read, Write},
    path::Path,
};
const MAX_REQUEST: usize = 24 * 1024 * 1024;
pub fn worker_mode() -> bool {
    let args = std::env::args().collect::<Vec<_>>();
    if args
        .get(1)
        .is_none_or(|arg| arg != "--fluely-gguf-asr-worker")
    {
        return false;
    }
    let result = run(&args);
    if let Err(error) = result {
        let _ = write_response(&serde_json::json!({"error":error}));
        std::process::exit(1);
    }
    true
}
fn write_response(response: &serde_json::Value) -> Result<(), String> {
    let mut output = std::io::stdout().lock();
    serde_json::to_writer(&mut output, response).map_err(|e| e.to_string())?;
    output.write_all(b"\n").map_err(|e| e.to_string())?;
    output.flush().map_err(|e| e.to_string())
}
#[cfg(target_os = "windows")]
fn run(args: &[String]) -> Result<(), String> {
    if args.len() != 6 {
        return Err("ASR worker requires native library, model, threads and language".into());
    }
    let threads = args[4]
        .parse::<u16>()
        .map_err(|_| "Invalid ASR worker threads")?;
    if !(1..=128).contains(&threads) {
        return Err("Invalid ASR worker threads".into());
    }
    let mut session = ffi::Session::load(Path::new(&args[2]), Path::new(&args[3]), threads)?;
    write_response(
        &serde_json::json!({"ready":true,"protocol":1,"engine":"transcribe.cpp","version":"0.4.0","backend":"cpu"}),
    )?;
    let mut input = std::io::stdin().lock();
    let mut line = String::new();
    loop {
        line.clear();
        // Cap before allocation; only this app owns the worker's stdin pipe.
        let length = std::io::Read::by_ref(&mut input)
            .take((MAX_REQUEST + 1) as u64)
            .read_line(&mut line)
            .map_err(|e| e.to_string())?;
        if length == 0 {
            break;
        }
        if length > MAX_REQUEST {
            return Err("ASR worker request exceeds its size limit".into());
        }
        let result = (|| -> Result<String, String> {
            let request: serde_json::Value =
                serde_json::from_str(&line).map_err(|e| e.to_string())?;
            let encoded = request["audio"]
                .as_str()
                .ok_or("ASR worker requires WAV audio")?;
            let wav = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| "Invalid ASR audio encoding")?;
            let pcm = audio::decode_wav(&wav)?;
            session.transcribe(&pcm, audio::language_hint(&args[5]))
        })();
        match result {
            Ok(text) => write_response(&serde_json::json!({"text":text}))?,
            Err(error) => write_response(&serde_json::json!({"error":error}))?,
        }
    }
    Ok(())
}
#[cfg(not(target_os = "windows"))]
fn run(_args: &[String]) -> Result<(), String> {
    Err("Managed GGUF ASR native engine currently supports Windows x64".into())
}
