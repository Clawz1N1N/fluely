//! Pure local-engine launch validation, also exercised without a Tauri build.
use std::{io::Read, path::Path};
pub fn validate_limits(
    kind: &str,
    port: u16,
    threads: u16,
    context: u32,
    gpu_layers: u16,
) -> Result<(), String> {
    if !["brain", "stt", "vision", "gguf-asr"].contains(&kind) {
        return Err("Unsupported local engine kind".into());
    }
    if port < 1024 {
        return Err("Choose a port between 1024 and 65535".into());
    }
    if !(1..=128).contains(&threads) {
        return Err("Threads must be between 1 and 128".into());
    }
    if !(512..=131072).contains(&context) {
        return Err("Context must be between 512 and 131072 tokens".into());
    }
    if gpu_layers > 1000 {
        return Err("GPU layers must be between 0 (CPU) and 1000".into());
    }
    Ok(())
}
pub fn validate_model(path: &Path, whisper: bool) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!("Model file is missing: {}", path.display()));
    }
    let mut file = std::fs::File::open(path).map_err(|e| format!("Read model: {e}"))?;
    let mut header = [0u8; 4];
    file.read_exact(&mut header)
        .map_err(|_| "Model file is empty or incomplete")?;
    if header != if whisper { *b"lmgg" } else { *b"GGUF" } {
        return Err(if whisper {
            "Whisper requires a whisper.cpp GGML .bin model, not a text GGUF model"
        } else {
            "Model must be a GGUF file (the selected file has an invalid header)"
        }
        .into());
    }
    Ok(())
}
pub struct LaunchOptions<'a> {
    pub kind: &'a str,
    pub model: &'a str,
    pub projector: Option<&'a str>,
    pub port: u16,
    pub threads: u16,
    pub context: u32,
    pub gpu_layers: u16,
    pub language: &'a str,
}
pub fn arguments(options: LaunchOptions<'_>) -> Vec<String> {
    let LaunchOptions {
        kind,
        model,
        projector,
        port,
        threads,
        context,
        gpu_layers,
        language,
    } = options;
    let mut args = vec![
        "--model".into(),
        model.into(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--threads".into(),
        threads.to_string(),
    ];
    if kind == "stt" {
        args.extend([
            "--language".into(),
            language.into(),
            "--inference-path".into(),
            "/inference".into(),
        ]);
        if gpu_layers == 0 {
            args.push("--no-gpu".into());
        }
    } else {
        args.extend([
            "--ctx-size".into(),
            context.to_string(),
            "--n-gpu-layers".into(),
            gpu_layers.to_string(),
            "--alias".into(),
            format!("fluely-local-{kind}"),
        ]);
        if let Some(projector) = projector.filter(|path| !path.is_empty()) {
            args.extend(["--mmproj".into(), projector.into()]);
            if gpu_layers == 0 {
                args.push("--no-mmproj-offload".into());
            }
        }
    }
    args
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_kinds_ports_and_resource_limits_are_rejected() {
        assert!(validate_limits("brain", 8081, 4, 4096, 0).is_ok());
        for values in [
            ("other", 8081, 4, 4096, 0),
            ("brain", 80, 4, 4096, 0),
            ("stt", 8082, 0, 4096, 0),
            ("vision", 8083, 4, 999999, 0),
            ("brain", 8081, 4, 4096, 1001),
        ] {
            assert!(validate_limits(values.0, values.1, values.2, values.3, values.4).is_err());
        }
    }
    #[test]
    fn launch_keeps_paths_single_arguments_and_loopback_binding() {
        let args = arguments(LaunchOptions {
            kind: "vision",
            model: "C:/Models/model name.gguf",
            projector: Some("C:/Models/projector.gguf"),
            port: 8083,
            threads: 4,
            context: 4096,
            gpu_layers: 0,
            language: "auto",
        });
        assert!(args.windows(2).any(|pair| pair == ["--host", "127.0.0.1"]));
        assert!(args.iter().any(|arg| arg == "C:/Models/model name.gguf"));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--mmproj", "C:/Models/projector.gguf"]));
        assert!(args.windows(2).any(|pair| pair == ["--n-gpu-layers", "0"]));
        assert!(args.iter().any(|arg| arg == "--no-mmproj-offload"));
        let whisper = arguments(LaunchOptions {
            kind: "stt",
            model: "ggml-base.bin",
            projector: None,
            port: 8082,
            threads: 4,
            context: 4096,
            gpu_layers: 0,
            language: "auto",
        });
        assert!(whisper.iter().any(|arg| arg == "--no-gpu"));
        assert!(!whisper.iter().any(|arg| arg == "--ctx-size"));
    }
    #[test]
    fn model_validation_checks_file_header_not_just_suffix() {
        let temp = std::env::current_dir()
            .unwrap()
            .join(format!("fluely-model-test-{}", std::process::id()));
        std::fs::write(&temp, [b'G', b'G', b'U', b'F', 0, 0, 0, 0]).unwrap();
        assert!(validate_model(&temp, false).is_ok());
        assert!(validate_model(&temp, true).is_err());
        std::fs::write(&temp, [b'l', b'm', b'g', b'g', 0, 0, 0, 0]).unwrap();
        assert!(validate_model(&temp, true).is_ok());
        assert!(validate_model(&temp, false).is_err());
        std::fs::write(&temp, b"<!DOCTYPE html>").unwrap();
        assert!(validate_model(&temp, false).is_err());
        std::fs::remove_file(&temp).unwrap();
        assert!(validate_model(&temp, false).is_err());
    }
}
