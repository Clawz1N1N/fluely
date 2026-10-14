use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

pub const REPOSITORY_URL: &str = "https://github.com/Clawz1N1N/fluely";

/// Always hand the fixed repository URL to the operating system's default handler.
#[tauri::command]
pub fn open_repository<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.opener().open_url(REPOSITORY_URL, None::<&str>)
        .map_err(|error| format!("Could not open the repository in your browser: {error}"))
}
