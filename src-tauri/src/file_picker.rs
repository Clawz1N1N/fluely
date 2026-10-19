use tauri::{AppHandle, Manager};
#[tauri::command]
pub async fn pick_local_engine_file(
    app: AppHandle,
    kind: String,
    field: String,
) -> Result<Option<String>, String> {
    if !matches!(kind.as_str(), "brain" | "stt" | "vision" | "gguf-asr")
        || !matches!(field.as_str(), "executable" | "model_path" | "mmproj_path")
    {
        return Err("Unknown model file selection".into());
    }
    #[cfg(target_os = "windows")]
    {
        let owner = app
            .get_webview_window("dashboard")
            .and_then(|w| w.hwnd().ok())
            .map(|w| w.0 as isize)
            .unwrap_or(0);
        tauri::async_runtime::spawn_blocking(move || {
            use windows::core::{PCWSTR, PWSTR};
            use windows::Win32::Foundation::HWND;
            use windows::Win32::UI::Controls::Dialogs::{
                CommDlgExtendedError, GetOpenFileNameW, OFN_DONTADDTORECENT, OFN_EXPLORER,
                OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST, OPENFILENAMEW,
            };
            let filter = if field == "executable" && kind == "gguf-asr" {
                "Native ASR library\0*.dll\0All files\0*.*\0\0"
            } else if field == "executable" {
                "Executable\0*.exe\0All files\0*.*\0\0"
            } else if kind == "gguf-asr" {
                "ASR GGUF model\0*.gguf\0All files\0*.*\0\0"
            } else {
                "Models\0*.gguf;*.bin;*.onnx\0All files\0*.*\0\0"
            };
            let filter: Vec<u16> = filter.encode_utf16().collect();
            let title: Vec<u16> = "Fluely\0".encode_utf16().collect();
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
                    let length = buffer.iter().position(|x| *x == 0).unwrap_or(buffer.len());
                    Ok(Some(String::from_utf16_lossy(&buffer[..length])))
                } else {
                    let code = CommDlgExtendedError().0;
                    if code == 0 {
                        Ok(None)
                    } else {
                        Err(format!("File picker failed: {code}"))
                    }
                }
            }
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(any(target_os="macos",target_os="linux"))]
    {
        let _ = app;
        tauri::async_runtime::spawn_blocking(move || {
            #[cfg(target_os="macos")]
            let result=std::process::Command::new("osascript").args(["-e", "POSIX path of (choose file with prompt \"Choose a Fluely model or server file\")"]).output();
            #[cfg(target_os="linux")]
            let result=std::process::Command::new("zenity").args(["--file-selection", "--title=Choose a Fluely model or server file"]).output();
            let output=result.map_err(|e|format!("Native file picker unavailable: {e}"))?;
            if !output.status.success(){
                #[cfg(target_os="macos")]
                if String::from_utf8_lossy(&output.stderr).contains("(-128)"){return Ok(None);}
                #[cfg(target_os="linux")]
                if output.status.code()==Some(1){return Ok(None);}
                return Err("The native file picker failed (Linux requires zenity)".into());
            }
            let value=String::from_utf8(output.stdout).map_err(|_|"File picker returned invalid UTF-8")?.trim_end_matches(['\r','\n']).to_string();
            if value.is_empty(){Ok(None)}else if std::path::Path::new(&value).is_absolute(){Ok(Some(value))}else{Err("File picker returned a relative path".into())}
        }).await.map_err(|e|e.to_string())?
    }
    #[cfg(not(any(target_os="windows",target_os="macos",target_os="linux")))]
    {
        let _ = app;
        Err("Native file picker is supported on Windows".into())
    }
}
