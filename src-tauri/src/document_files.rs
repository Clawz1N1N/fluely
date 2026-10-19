//! Optional legacy document conversion through the installed LibreOffice parser.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
#[cfg(desktop)]
use std::{
    io::Read,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(desktop)]
use tauri::{Emitter, Manager, Runtime};

const MAX_BYTES: usize = 16 * 1024 * 1024;
#[derive(Serialize)]
pub struct ConvertedDocument {
    name: String,
    base64: String,
}
#[cfg(desktop)]
struct DropGrant {
    id: String,
    paths: Vec<PathBuf>,
    created: Instant,
}
#[cfg(desktop)]
#[derive(Default)]
pub struct DroppedDocumentsState {
    grant: Mutex<Option<DropGrant>>,
    sequence: AtomicU64,
}
#[cfg(desktop)]
impl DroppedDocumentsState {
    fn authorize(&self, paths: Vec<PathBuf>, now: Instant) -> Result<String, String> {
        self.clear();
        if paths.is_empty() || paths.len() > 8 {
            return Err("Attach at most 8 files.".into());
        }
        let id = self.sequence.fetch_add(1, Ordering::Relaxed).to_string();
        *self.grant.lock().map_err(|e| e.to_string())? = Some(DropGrant {
            id: id.clone(),
            paths,
            created: now,
        });
        Ok(id)
    }
    fn take(&self, id: &str, now: Instant) -> Result<Vec<PathBuf>, String> {
        let grant = self
            .grant
            .lock()
            .map_err(|e| e.to_string())?
            .take()
            .ok_or("Drop files into the interactive chat again.")?;
        if grant.id != id || now.duration_since(grant.created) > Duration::from_secs(30) {
            return Err("Drop files into the interactive chat again.".into());
        }
        Ok(grant.paths)
    }
    pub fn clear(&self) {
        if let Ok(mut grant) = self.grant.lock() {
            *grant = None;
        }
    }
}
#[cfg(desktop)]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentDrop {
    drop_id: Option<String>,
    count: usize,
    error: Option<String>,
}
/// Paths originate exclusively from Tauri's OS drop event, never from IPC arguments.
#[cfg(desktop)]
pub fn register_drop<R: Runtime>(app: &tauri::AppHandle<R>, paths: Vec<PathBuf>) {
    if !crate::shell::answer_is_interactive(app) {
        return;
    }
    let count = paths.len();
    let result = app
        .state::<DroppedDocumentsState>()
        .authorize(paths, Instant::now());
    let payload = match result {
        Ok(id) => AttachmentDrop {
            drop_id: Some(id),
            count,
            error: None,
        },
        Err(error) => AttachmentDrop {
            drop_id: None,
            count,
            error: Some(error),
        },
    };
    let _ = app.emit_to("answer", "answer-attachment-drop", payload);
}
#[cfg(desktop)]
fn read_dropped_paths(paths: Vec<PathBuf>) -> Result<Vec<ConvertedDocument>, String> {
    if paths.is_empty() || paths.len() > 8 {
        return Err("Attach at most 8 files.".into());
    }
    let mut result = Vec::new();
    let mut total = 0;
    for path in paths {
        if !path.is_absolute() {
            return Err("Dropped file path must be absolute.".into());
        }
        let path = path
            .canonicalize()
            .map_err(|_| "Could not read dropped file.")?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Unsupported attachment filename.")?
            .to_string();
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "txt"
                | "md"
                | "csv"
                | "tsv"
                | "json"
                | "xml"
                | "html"
                | "log"
                | "rtf"
                | "doc"
                | "docx"
                | "xls"
                | "xlsx"
                | "ppt"
                | "pptx"
                | "odt"
                | "ods"
                | "odp"
                | "pdf"
                | "png"
                | "jpg"
                | "jpeg"
                | "webp"
                | "gif"
        ) {
            return Err("Unsupported attachment format.".into());
        }
        let file = std::fs::File::open(path).map_err(|_| "Could not open dropped file.")?;
        let metadata = file
            .metadata()
            .map_err(|_| "Could not inspect dropped file.")?;
        if !metadata.is_file() {
            return Err("Attach files, not folders.".into());
        }
        if metadata.len() > MAX_BYTES as u64 {
            return Err("File is too large (maximum 16 MB).".into());
        }
        let mut bytes = Vec::new();
        file.take((MAX_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "Could not read dropped file.")?;
        if bytes.len() > MAX_BYTES {
            return Err("File is too large (maximum 16 MB).".into());
        }
        total += bytes.len();
        if total > 32 * 1024 * 1024 {
            return Err("Combined attachments exceed 32 MB. Attach fewer or smaller files.".into());
        }
        result.push(ConvertedDocument {
            name,
            base64: STANDARD.encode(bytes),
        });
    }
    Ok(result)
}
#[cfg(desktop)]
#[tauri::command]
pub async fn read_dropped_documents(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    drop_id: String,
) -> Result<Vec<ConvertedDocument>, String> {
    if window.label() != "answer" || !crate::shell::answer_is_interactive(&app) {
        return Err("Enable chat interaction before dropping files.".into());
    }
    let paths = app
        .state::<DroppedDocumentsState>()
        .take(&drop_id, Instant::now())?;
    tauri::async_runtime::spawn_blocking(move || read_dropped_paths(paths))
        .await
        .map_err(|e| e.to_string())?
}
fn target_extension(name: &str) -> Result<&'static str, String> {
    match name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "doc" | "rtf" => Ok("docx"),
        "xls" => Ok("xlsx"),
        "ppt" => Ok("pptx"),
        _ => Err("Only legacy DOC, XLS, PPT and RTF documents require conversion.".into()),
    }
}
fn libreoffice() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "windows")]
    for base in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(path) = std::env::var_os(base) {
            candidates.push(PathBuf::from(path).join("LibreOffice/program/soffice.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    candidates.push(PathBuf::from(
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ));
    if let Some(paths) = std::env::var_os("PATH") {
        for path in std::env::split_paths(&paths) {
            candidates.push(path.join(if cfg!(windows) {
                "soffice.exe"
            } else {
                "soffice"
            }));
        }
    }
    candidates.into_iter().find(|path| path.is_file())
}
struct TemporaryDirectory(PathBuf);
impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[tauri::command]
pub async fn convert_legacy_document(
    name: String,
    bytes_base64: String,
) -> Result<ConvertedDocument, String> {
    let target = target_extension(&name)?;
    if bytes_base64.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err("File is too large (maximum 16 MB).".into());
    }
    let bytes = STANDARD
        .decode(bytes_base64)
        .map_err(|_| "Invalid attachment encoding.")?;
    if bytes.len() > MAX_BYTES {
        return Err("File is too large (maximum 16 MB).".into());
    }
    let executable = libreoffice().ok_or("LibreOffice is not installed. Install LibreOffice or save this document as DOCX, XLSX, PPTX, ODT, ODS, ODP or PDF.")?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let path = std::env::temp_dir().join(format!("fluely-document-{}-{stamp}", std::process::id()));
    std::fs::create_dir(&path).map_err(|e| e.to_string())?;
    let temporary = TemporaryDirectory(path);
    let extension = name
        .rsplit('.')
        .next()
        .unwrap_or("doc")
        .to_ascii_lowercase();
    let input = temporary.0.join(format!("source.{extension}"));
    std::fs::write(&input, bytes).map_err(|e| e.to_string())?;
    let profile = temporary.0.join("profile");
    std::fs::create_dir(&profile).map_err(|e| e.to_string())?;
    // A separate profile disables document macros and automatic link updates.
    std::fs::write(profile.join("registrymodifications.xcu"), r#"<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateMode" oor:op="fuse"><value>0</value></prop></item></oor:items>"#).map_err(|e|e.to_string())?;
    let profile_url = format!(
        "file:///{}",
        profile
            .to_string_lossy()
            .replace('\\', "/")
            .trim_start_matches('/')
            .replace(' ', "%20")
    );
    let mut command = tokio::process::Command::new(executable);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    command
        .args([
            format!("-env:UserInstallation={profile_url}"),
            "--headless".into(),
            "--nologo".into(),
            "--nodefault".into(),
            "--norestore".into(),
            "--convert-to".into(),
            target.into(),
            "--outdir".into(),
        ])
        .arg(&temporary.0)
        .arg(&input)
        .kill_on_drop(true)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start LibreOffice: {e}"))?;
    let status = match tokio::time::timeout(std::time::Duration::from_secs(45), child.wait()).await
    {
        Ok(result) => result.map_err(|e| format!("LibreOffice conversion failed: {e}"))?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(
                "LibreOffice conversion timed out. Try saving the document in a modern format."
                    .into(),
            );
        }
    };
    if !status.success() {
        return Err(
            "LibreOffice could not convert this document (it may be encrypted or damaged).".into(),
        );
    }
    let output = temporary.0.join(format!("source.{target}"));
    let metadata = std::fs::metadata(&output).map_err(|_| {
        "LibreOffice returned no converted document (it may be encrypted or unsupported)."
    })?;
    if metadata.len() > MAX_BYTES as u64 {
        return Err("Converted document is too large (maximum 16 MB).".into());
    }
    let data = std::fs::read(output).map_err(|e| e.to_string())?;
    Ok(ConvertedDocument {
        name: format!("converted.{target}"),
        base64: STANDARD.encode(data),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_formats_use_real_office_conversion_targets() {
        assert_eq!(target_extension("notes.DOC").unwrap(), "docx");
        assert_eq!(target_extension("notes.rtf").unwrap(), "docx");
        assert_eq!(target_extension("sheet.xls").unwrap(), "xlsx");
        assert_eq!(target_extension("slides.ppt").unwrap(), "pptx");
        assert!(target_extension("../evil.exe").is_err());
    }
    #[cfg(desktop)]
    #[test]
    fn dropped_files_require_a_recent_one_use_os_grant() {
        let state = DroppedDocumentsState::default();
        let now = std::time::Instant::now();
        assert!(state.take("anything", now).is_err());
        let id = state
            .authorize(vec![PathBuf::from("actual-drop.txt")], now)
            .unwrap();
        assert_eq!(
            state.take(&id, now).unwrap(),
            vec![PathBuf::from("actual-drop.txt")]
        );
        assert!(state.take(&id, now).is_err());
        let id = state
            .authorize(vec![PathBuf::from("actual-drop.txt")], now)
            .unwrap();
        assert!(state
            .take(&id, now + std::time::Duration::from_secs(31))
            .is_err());
        assert!(state
            .authorize(vec![PathBuf::from("file.txt"); 9], now)
            .is_err());
        assert!(state.authorize(vec![], now).is_err());
    }
    #[cfg(desktop)]
    #[test]
    fn dropped_documents_reject_directories_unsupported_formats_and_oversized_files() {
        let directory = std::env::temp_dir().join(format!(
            "fluely-drop-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let valid = directory.join("дані.txt");
        std::fs::write(&valid, b"actual dropped document").unwrap();
        let file = read_dropped_paths(vec![valid]).unwrap().pop().unwrap();
        assert_eq!(file.name, "дані.txt");
        assert_eq!(
            STANDARD.decode(file.base64).unwrap(),
            b"actual dropped document"
        );
        assert!(read_dropped_paths(vec![directory.clone()]).is_err());
        let unsupported = directory.join("program.exe");
        std::fs::write(&unsupported, b"MZ").unwrap();
        assert!(read_dropped_paths(vec![unsupported]).is_err());
        let huge = directory.join("huge.txt");
        std::fs::File::create(&huge)
            .unwrap()
            .set_len((MAX_BYTES + 1) as u64)
            .unwrap();
        assert!(read_dropped_paths(vec![huge]).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
