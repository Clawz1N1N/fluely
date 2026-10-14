//! Standalone Windows release binaries are portable; installer resources select
//! OS data paths. Explicit profiles always take precedence.
use std::path::PathBuf;
#[cfg(any(target_os="windows",test))]
use std::path::Path;
use tauri::{AppHandle, Runtime, Manager};
pub fn override_dir() -> Result<Option<PathBuf>, String> {
    let values:Vec<_>=std::env::args_os().collect();
    let argument=profile_argument(&values)?;
    let Some(value) = argument.or_else(||std::env::var_os("FLUELY_DATA_DIR")).or_else(||std::env::var_os("PLUELY_DATA_DIR")) else { return Ok(None); };
    let path = PathBuf::from(value);
    if !path.is_absolute() { return Err("FLUELY_DATA_DIR must be an absolute directory".into()); }
    std::fs::create_dir_all(&path).map_err(|e| format!("Portable profile: {e}"))?;
    Ok(Some(path))
}
fn profile_argument(values:&[std::ffi::OsString])->Result<Option<std::ffi::OsString>,String>{
    let Some(index)=values.iter().position(|value|value=="--fluely-profile")else{return Ok(None)};
    let value=values.get(index+1).ok_or("--fluely-profile requires an absolute directory")?;
    if !PathBuf::from(value).is_absolute(){return Err("--fluely-profile requires an absolute directory".into());}
    Ok(Some(value.clone()))
}
/// Normalize the portable/Startup argument before plugins and worker threads start.
pub fn configure_process_profile()->Result<(),String>{
    let mut profile=override_dir()?;
    #[cfg(target_os="windows")]
    if profile.is_none() && !cfg!(debug_assertions){
        let roaming=std::env::var_os("APPDATA").map(PathBuf::from);
        profile=default_windows_profile(&std::env::current_exe().map_err(|e|e.to_string())?,roaming.as_deref())?;
    }
    if let Some(path)=profile{
        std::env::set_var("FLUELY_DATA_DIR",&path);
        // Existing SQL vendor/profile migration uses the compatible environment name.
        std::env::set_var("PLUELY_DATA_DIR",&path);
    }
    Ok(())
}
#[cfg(any(target_os="windows",test))]
fn default_windows_profile(executable:&Path,roaming:Option<&Path>)->Result<Option<PathBuf>,String>{
    let directory=executable.parent().ok_or("Executable directory unavailable")?;
    match std::fs::read_to_string(directory.join("installed-profile.flag")){
        Err(error) if error.kind()==std::io::ErrorKind::NotFound=>return Ok(Some(directory.join("profile"))),
        Err(error)=>return Err(format!("Read installed profile marker: {error}")),
        Ok(marker) if marker.trim()=="com.clawz1n1n.fluely"=>{},
        Ok(_)=>return Err("Invalid installed profile marker; reinstall Fluely or remove the marker for portable use".into()),
    }
    if let Some(roaming)=roaming{
        let old=roaming.join("com.srikanthnani.pluely");
        if old.is_dir()&&!roaming.join("com.clawz1n1n.fluely").exists(){return Ok(Some(old));}
    }
    Ok(None)
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_explicit_profile_cannot_silently_select_another_profile() {
        assert!(profile_argument(&["fluely.exe".into(),"--fluely-profile".into()]).is_err());
        assert!(profile_argument(&["fluely.exe".into(),"--fluely-profile".into(),"relative".into()]).is_err());
        let path=std::env::temp_dir();
        assert_eq!(profile_argument(&["fluely.exe".into(),"--fluely-profile".into(),path.clone().into_os_string()]).unwrap(),Some(path.into_os_string()));
    }
    fn directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!("fluely-profile-test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn standalone_executable_uses_adjacent_profile_without_appdata() {
        let root = directory();
        assert_eq!(default_windows_profile(&root.join("fluely.exe"), None).unwrap(), Some(root.join("profile")));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn installed_marker_preserves_os_paths_and_legacy_migration() {
        let root = directory();
        std::fs::write(root.join("installed-profile.flag"), "com.clawz1n1n.fluely\n").unwrap();
        let roaming = root.join("roaming");
        assert_eq!(default_windows_profile(&root.join("fluely.exe"), Some(&roaming)).unwrap(), None);
        std::fs::create_dir_all(roaming.join("com.srikanthnani.pluely")).unwrap();
        assert_eq!(default_windows_profile(&root.join("fluely.exe"), Some(&roaming)).unwrap(), Some(roaming.join("com.srikanthnani.pluely")));
        std::fs::create_dir_all(roaming.join("com.clawz1n1n.fluely")).unwrap();
        assert_eq!(default_windows_profile(&root.join("fluely.exe"), Some(&roaming)).unwrap(), None);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn invalid_installed_marker_is_a_visible_configuration_error() {
        let root = directory();
        std::fs::write(root.join("installed-profile.flag"), "broken").unwrap();
        assert!(default_windows_profile(&root.join("fluely.exe"), None).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
