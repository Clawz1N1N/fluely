//! Shared chat preferences. Every update merges while holding one lock and
//! atomically replaces the file, so changes from different webviews survive.
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct ChatPreferencesState(pub Mutex<Option<Value>>);

fn defaults() -> Value {
    json!({"revision":0,"initialized":false,"system_prompt":"","structured_prompt":"",
        "prompt_id":null,"response_language":"auto","response_length":"auto",
        "mode_prompts":[],"selections":{}})
}
fn load(app: &AppHandle, state: &mut Option<Value>) -> Result<(), String> {
    if state.is_some() { return Ok(()); }
    let path = crate::app_paths::data_dir(app)?.join("chat_preferences.json");
    *state = Some(match std::fs::read(path) {
        Ok(bytes) => { let mut value=defaults(); merge(&mut value,serde_json::from_slice(&bytes).map_err(|e|format!("Load chat preferences: {e}"))?)?; value },
        Err(e) if e.kind()==std::io::ErrorKind::NotFound => defaults(),
        Err(e) => return Err(format!("Read chat preferences: {e}")),
    });
    Ok(())
}
fn merge(current: &mut Value, patch: Value) -> Result<(), String> {
    let fields=patch.as_object().ok_or("Chat preferences patch must be an object")?;
    for (key,value) in fields {
        if !current.as_object().unwrap().contains_key(key) { return Err(format!("Unknown chat preference: {key}")); }
        if key=="selections" {
            let selections=value.as_object().ok_or("Invalid source selections")?;
            for (kind,selection) in selections {
                if !["brain","stt","tts","vision"].contains(&kind.as_str()) { return Err("Invalid source kind".into()); }
                let source=selection["source"].as_str().ok_or("Invalid source selection")?;
                if !["auto","cloud","local","system"].contains(&source) || (source=="system" && kind!="stt" && kind!="tts" && kind!="vision") { return Err("Unavailable system source".into()); }
                if !selection["provider_id"].is_null() && !selection["provider_id"].is_string() {return Err("Invalid selected model".into());}
                current["selections"][kind]=selection.clone();
            }
        } else { current[key]=value.clone(); }
    }
    for key in ["system_prompt","structured_prompt","response_language","response_length"] {
        if !current[key].is_string() || current[key].as_str().unwrap().len()>131072 { return Err(format!("Invalid {key}")); }
    }
    if !["auto","short","medium","detailed"].contains(&current["response_length"].as_str().unwrap()) {return Err("Invalid response length".into());}
    if !current["mode_prompts"].is_array() || current["mode_prompts"].as_array().unwrap().len()>100 {return Err("Invalid mode prompts".into());}
    for prompt in current["mode_prompts"].as_array().unwrap() {
        for key in ["title","prompt","modelId"] {if !prompt[key].is_string() || prompt[key].as_str().unwrap().len()>131072 {return Err("Invalid mode prompt".into());}}
    }
    if !current["prompt_id"].is_null()&&!current["prompt_id"].is_string(){return Err("Invalid selected prompt".into());}
    Ok(())
}
#[tauri::command]
pub fn get_chat_preferences(app: AppHandle) -> Result<Value,String> {
    let state=app.state::<ChatPreferencesState>();
    let mut value=state.0.lock().map_err(|_|"Chat preferences lock unavailable")?;
    load(&app,&mut value)?; Ok(value.as_ref().unwrap().clone())
}
fn write(app:AppHandle,patch:Value,migrate:bool)->Result<Value,String>{
    if patch.get("revision").is_some() || patch.get("initialized").is_some(){return Err("Chat preference metadata is read-only".into());}
    let state=app.state::<ChatPreferencesState>();
    let mut stored=state.0.lock().map_err(|_|"Chat preferences lock unavailable")?;
    load(&app,&mut stored)?;
    let mut value=stored.as_ref().unwrap().clone();
    if migrate && value["initialized"]==true { return Ok(value); }
    let revision=value["revision"].as_u64().unwrap_or(0)+1;
    merge(&mut value,patch)?;
    value["initialized"]=json!(true);value["revision"]=json!(revision);
    let bytes=serde_json::to_vec_pretty(&value).map_err(|e|e.to_string())?;
    crate::shell_store::replace_file(&crate::app_paths::data_dir(&app)?.join("chat_preferences.json"),&bytes).map_err(|e|format!("Save chat preferences: {e}"))?;
    *stored=Some(value.clone());
    app.emit("chat-preferences-changed",&value).map_err(|e|e.to_string())?;
    Ok(value)
}
#[tauri::command]
pub fn update_chat_preferences(app:AppHandle,patch:Value)->Result<Value,String>{write(app,patch,false)}
#[tauri::command]
pub fn migrate_chat_preferences(app:AppHandle,patch:Value)->Result<Value,String>{write(app,patch,true)}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn unrelated_window_changes_survive_merge(){
        let mut value=defaults();
        merge(&mut value,json!({"response_length":"short","selections":{"brain":{"source":"cloud","provider_id":"cloud-a"}}})).unwrap();
        merge(&mut value,json!({"response_language":"ukrainian","selections":{"stt":{"source":"local","provider_id":null}}})).unwrap();
        assert_eq!(value["response_length"],"short");assert_eq!(value["selections"]["brain"]["provider_id"],"cloud-a");
    }
    #[test] fn invalid_sources_and_response_lengths_are_rejected(){
        assert!(merge(&mut defaults(),json!({"selections":{"brain":{"source":"system","provider_id":null}}})).is_err());
        assert!(merge(&mut defaults(),json!({"response_length":"huge"})).is_err());
    }
    #[test] fn offline_system_stt_is_a_valid_source(){
        let mut value=defaults();merge(&mut value,json!({"selections":{"stt":{"source":"system","provider_id":"installed-en"}}})).unwrap();
        assert_eq!(value["selections"]["stt"]["source"],"system");
    }
}
