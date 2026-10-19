//! Custom icons live in the own profile. Packaged applications stay untouched.
#[path="app_icon_core.rs"] mod core;
#[path="app_icon_native.rs"] mod native;
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageEncoder, ImageReader};
use serde::Serialize;
use std::{io::Cursor, path::Path, sync::Mutex};
use tauri::{AppHandle, Manager};
#[derive(Default)] pub struct AppIconState(pub Mutex<()>);
#[derive(Serialize)] pub struct AppIconStatus { pub custom:bool, pub preview_data_url:String, pub restart_required:bool, pub note:String }
const PNG:&str="app-icon.png"; const ICO:&str="app-icon.ico";
pub fn alias_icon(profile:&Path)->Result<Option<Vec<u8>>,String>{
    match std::fs::read(profile.join(ICO)){Ok(bytes)=>{if bytes.len()>core::MAX_ICON_BYTES||core::ico_resources(&bytes).is_err(){eprintln!("Saved Fluely icon is invalid; using packaged executable icon");return Ok(None)}Ok(Some(bytes))},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(None),Err(e)=>Err(format!("Read saved app icon: {e}"))}
}
pub fn patch_alias(path:&Path, bytes:&[u8])->Result<(),String>{native::patch_icon(path,bytes)}
pub fn apply_windows(app:&AppHandle)->Result<(),String>{
    let profile=crate::app_paths::data_dir(app)?;
    let bytes=std::fs::read(profile.join(PNG)).unwrap_or_else(|_|include_bytes!("../icons/icon.png").to_vec());
    let decoded=match decode(&bytes){Ok(image)=>image,Err(error)=>{eprintln!("Saved Fluely window icon ignored: {error}");decode(include_bytes!("../icons/icon.png"))?}};
    let icon=tauri::image::Image::new_owned(decoded.as_raw().clone(),decoded.width(),decoded.height());
    for window in app.webview_windows().values(){window.set_icon(icon.clone()).map_err(|e|format!("Apply native window icon: {e}"))?;}
    Ok(())
}
fn decode(bytes:&[u8])->Result<image::RgbaImage,String>{
    core::validate_container(bytes)?;
    let mut reader=ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|e|e.to_string())?;
    let mut limits=image::Limits::default();limits.max_image_width=Some(1024);limits.max_image_height=Some(1024);limits.max_alloc=Some(16*1024*1024);reader.limits(limits);
    reader.decode().map(|image|image.to_rgba8()).map_err(|e|e.to_string())
}
fn status(app:&AppHandle)->Result<AppIconStatus,String>{
    let profile=crate::app_paths::data_dir(app)?; let custom=profile.join(PNG).is_file();
    let bytes=std::fs::read(profile.join(PNG)).unwrap_or_else(|_|include_bytes!("../icons/icon.png").to_vec());
    Ok(AppIconStatus{custom,preview_data_url:format!("data:image/png;base64,{}",STANDARD.encode(bytes)),restart_required:cfg!(windows),note:if cfg!(windows){"Window icons apply immediately. Restart with the saved process name to apply the executable icon in Explorer and Task Manager; Windows may cache icons."}else if cfg!(target_os="android"){"Custom images apply inside Fluely. Android launcher icons are determined by the installed package."}else{"Window icons apply immediately where supported by the desktop. Packaged macOS Dock and Linux launcher icons remain the installed application icon."}.into()})
}
#[tauri::command] pub fn get_app_icon_status(app:AppHandle)->Result<AppIconStatus,String>{status(&app)}
#[tauri::command] pub fn save_app_icon(app:AppHandle,image_base64:String)->Result<AppIconStatus,String>{
    let state=app.state::<AppIconState>();let _guard=state.0.lock().map_err(|_|"Icon settings lock unavailable")?;
    if image_base64.len()>core::MAX_ICON_BYTES*4/3+8{return Err("Choose a PNG or ICO smaller than 4 MiB".into());}
    let input=STANDARD.decode(image_base64).map_err(|_|"Invalid image encoding")?;core::validate_container(&input)?;
    let mut reader=ImageReader::new(Cursor::new(&input)).with_guessed_format().map_err(|e|e.to_string())?;
    let mut limits=image::Limits::default();limits.max_image_width=Some(1024);limits.max_image_height=Some(1024);limits.max_alloc=Some(16*1024*1024);reader.limits(limits);
    let image=reader.decode().map_err(|e|format!("Invalid image (maximum 1024 × 1024): {e}"))?;
    if image.width()!=image.height() || image.width()<16{return Err("Choose a square icon between 16 and 1024 pixels".into());}
    let mut png=Cursor::new(Vec::new());image.write_to(&mut png,image::ImageFormat::Png).map_err(|e|e.to_string())?;
    let rgba=image.resize_exact(256,256,image::imageops::FilterType::Lanczos3).to_rgba8();let mut ico=Vec::new();
    image::codecs::ico::IcoEncoder::new(&mut ico).write_image(rgba.as_raw(),256,256,image::ExtendedColorType::Rgba8).map_err(|e|e.to_string())?;
    let profile=crate::app_paths::data_dir(&app)?;std::fs::create_dir_all(&profile).map_err(|e|e.to_string())?;
    crate::shell_store::replace_file(&profile.join(ICO),&ico).map_err(|e|e.to_string())?;
    crate::shell_store::replace_file(&profile.join(PNG),&png.into_inner()).map_err(|e|e.to_string())?;
    apply_windows(&app)?;#[cfg(windows)] crate::identity::refresh_saved_icon(&app)?;status(&app)
}
#[tauri::command] pub fn restore_default_app_icon(app:AppHandle)->Result<AppIconStatus,String>{
    let state=app.state::<AppIconState>();let _guard=state.0.lock().map_err(|_|"Icon settings lock unavailable")?;
    let profile=crate::app_paths::data_dir(&app)?;
    for name in [PNG,ICO]{match std::fs::remove_file(profile.join(name)){Ok(())=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e.to_string())}}
    apply_windows(&app)?;#[cfg(windows)] crate::identity::refresh_saved_icon(&app)?;status(&app)
}
