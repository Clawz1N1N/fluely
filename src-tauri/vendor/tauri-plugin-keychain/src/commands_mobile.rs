use crate::{KeychainExt,KeychainRequest,KeychainResponse};
use tauri::{AppHandle,Runtime};
fn payload(key:String,password:Option<String>)->Result<KeychainRequest,String>{if key.is_empty()||key.contains('\0')||key.len()>4096{return Err("Invalid credential key".into());}Ok(KeychainRequest{key:Some(key),password})}
#[tauri::command] pub fn save_item<R:Runtime>(app:AppHandle<R>,key:String,password:String)->Result<(),String>{app.save_item().save_item(payload(key,Some(password))?).map(|_|()).map_err(|e|e.to_string())}
#[tauri::command] pub fn get_item<R:Runtime>(app:AppHandle<R>,key:String)->Result<KeychainResponse,String>{app.get_item().get_item(payload(key,None)?).map_err(|e|e.to_string())}
#[tauri::command] pub fn remove_item<R:Runtime>(app:AppHandle<R>,key:String)->Result<(),String>{app.remove_item().remove_item(payload(key,None)?).map(|_|()).map_err(|e|e.to_string())}
