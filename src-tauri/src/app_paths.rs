//! Optional explicit portable/test profile. Normal launches use Tauri's OS paths.
use std::path::PathBuf;
use tauri::{AppHandle, Runtime, Manager};
pub fn override_dir() -> Result<Option<PathBuf>, String> {
    let Some(value) = std::env::var_os("PLUELY_DATA_DIR") else { return Ok(None); };
    let path = PathBuf::from(value);
    if !path.is_absolute() { return Err("PLUELY_DATA_DIR must be an absolute directory".into()); }
    std::fs::create_dir_all(&path).map_err(|e| format!("Portable profile: {e}"))?;
    Ok(Some(path))
}
pub fn data_dir<R:Runtime>(app:&AppHandle<R>) -> Result<PathBuf,String> {
    if let Some(path)=override_dir()? { return Ok(path); }
    app.path().app_data_dir().map_err(|e| e.to_string())
}
pub fn cache_dir<R:Runtime>(app:&AppHandle<R>) -> Result<PathBuf,String> {
    if let Some(path)=override_dir()? { return Ok(path.join("cache")); }
    app.path().app_cache_dir().map_err(|e| e.to_string())
}
pub fn webview_dir() -> Result<Option<PathBuf>,String> { Ok(override_dir()?.map(|path|path.join("webview"))) }
