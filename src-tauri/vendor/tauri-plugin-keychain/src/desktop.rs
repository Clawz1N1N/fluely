use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};


pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<Keychain<R>> {
  Ok(Keychain(app.clone()))
}

/// Access to the Keychain APIs.
pub struct Keychain<R: Runtime>(AppHandle<R>);
