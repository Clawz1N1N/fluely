//! Optional explicit portable/test profile. Normal launches use Tauri's OS paths.
use std::path::PathBuf;
use tauri::{AppHandle, Runtime, Manager};
pub fn override_dir() -> Result<Option<PathBuf>, String> {
    let values:Vec<_>=std::env::args_os().collect();
    let argument=values.windows(2).find(|pair|pair[0]=="--fluely-profile").map(|pair|pair[1].clone());
    let Some(value) = argument.or_else(||std::env::var_os("FLUELY_DATA_DIR")).or_else(||std::env::var_os("PLUELY_DATA_DIR")) else { return Ok(None); };
    let path = PathBuf::from(value);
    if !path.is_absolute() { return Err("FLUELY_DATA_DIR must be an absolute directory".into()); }
    std::fs::create_dir_all(&path).map_err(|e| format!("Portable profile: {e}"))?;
    Ok(Some(path))
}
/// Normalize the portable/Startup argument before plugins and worker threads start.
pub fn configure_process_profile()->Result<(),String>{
    let mut profile=override_dir()?;
    #[cfg(target_os="windows")]
    if profile.is_none(){
        if let Some(roaming)=std::env::var_os("APPDATA"){
            let root=PathBuf::from(roaming);
            let old=root.join("com.srikanthnani.pluely");
            if old.is_dir()&&!root.join("com.clawz1n1n.fluely").exists(){profile=Some(old);}
        }
    }
    if let Some(path)=profile{
        std::env::set_var("FLUELY_DATA_DIR",&path);
        // Existing SQL vendor/profile migration uses the compatible environment name.
        std::env::set_var("PLUELY_DATA_DIR",&path);
    }
    Ok(())
}
pub fn data_dir<R:Runtime>(app:&AppHandle<R>) -> Result<PathBuf,String> {
    if let Some(path)=override_dir()? { return Ok(path); }
    app.path().app_data_dir().map_err(|e| e.to_string())
}
pub fn cache_dir<R:Runtime>(app:&AppHandle<R>) -> Result<PathBuf,String> {
    if let Some(path)=override_dir()? { return Ok(path.join("cache")); }
    app.path().app_cache_dir().map_err(|e| e.to_string())
}
pub fn webview_dir() -> Result<Option<PathBuf>,String> {
    let Some(path)=override_dir()? else{return Ok(None)};
    #[cfg(target_os="windows")]
    if path.file_name().is_some_and(|name|name=="com.srikanthnani.pluely"){
        if let Some(local)=std::env::var_os("LOCALAPPDATA"){
            let old=PathBuf::from(local).join("com.srikanthnani.pluely");
            if old.is_dir(){return Ok(Some(old));}
        }
    }
    Ok(Some(path.join("webview")))
}
