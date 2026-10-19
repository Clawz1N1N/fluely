//! Android permission/foreground-service bridge. No desktop capture dependencies.
use serde_json::Value;
use tauri::{Manager, Runtime, plugin::{Builder,PluginHandle,TauriPlugin}};
struct Bridge<R:Runtime>(PluginHandle<R>);
pub fn system_locale<R:Runtime>(app:&tauri::AppHandle<R>)->Result<String,String>{
    let value:Value=app.state::<Bridge<R>>().0.run_mobile_plugin("systemLocale",()).map_err(|error|error.to_string())?;
    value.get("language").and_then(Value::as_str).map(String::from).ok_or("Android language unavailable".into())
}
macro_rules! command {($name:ident,$native:literal)=>{
    #[tauri::command] fn $name<R:Runtime>(app:tauri::AppHandle<R>)->Result<Value,String>{
        app.state::<Bridge<R>>().0.run_mobile_plugin($native,()).map_err(|e|e.to_string())
    }
};}
command!(status,"status");command!(request_microphone,"requestMicrophone");command!(request_overlay,"requestOverlay");
command!(show_overlay,"showOverlay");command!(hide_overlay,"hideOverlay");command!(start_microphone,"startMicrophone");
command!(stop_microphone,"stopMicrophone");command!(capture_screen,"captureScreen");
pub fn init<R:Runtime>()->TauriPlugin<R>{
    Builder::new("fluely-mobile")
        .invoke_handler(tauri::generate_handler![status,request_microphone,request_overlay,show_overlay,hide_overlay,start_microphone,stop_microphone,capture_screen])
        .setup(|app,api|{let handle=api.register_android_plugin("com.fluely.mobile","FluelyMobilePlugin")?;app.manage(Bridge(handle));Ok(())}).build()
}
