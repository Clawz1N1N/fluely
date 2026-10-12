//! Offline Windows dictation uses the installed System.Speech recognizers.
//! No network service, downloadable model or microphone ownership is involved.
use tauri::AppHandle;
#[tauri::command]
pub async fn transcribe_system_audio(app:AppHandle,audio_base64:String,language:String)->Result<String,String> {
    #[cfg(target_os="windows")]
    {
        use base64::Engine;
        let bytes=base64::engine::general_purpose::STANDARD.decode(audio_base64).map_err(|_|"Invalid audio encoding")?;
        if bytes.len()>16*1024*1024 {return Err("Audio exceeds 16 MiB".into());}
        let cache=crate::app_paths::cache_dir(&app)?;
        tauri::async_runtime::spawn_blocking(move || {
            use std::{process::{Command,Stdio},time::{Duration,Instant}};
            use std::os::windows::process::CommandExt;
            std::fs::create_dir_all(&cache).map_err(|e|e.to_string())?;
            let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
            let audio=cache.join(format!("system-stt-{nonce}.wav"));
            let script=cache.join(format!("system-stt-{nonce}.ps1"));
            struct Files(Vec<std::path::PathBuf>);
            impl Drop for Files {fn drop(&mut self){for path in &self.0{let _=std::fs::remove_file(path);}}}
            let _files=Files(vec![audio.clone(),script.clone()]);
            std::fs::write(&audio,bytes).map_err(|e|e.to_string())?;
            std::fs::write(&script,include_str!("../resources/system-stt.ps1")).map_err(|e|e.to_string())?;
            let mut child=Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"])
                .arg(script).arg("-Audio").arg(audio).arg("-Language").arg(language)
                .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).creation_flags(0x08000000)
                .spawn().map_err(|_|"Windows offline speech runtime unavailable")?;
            // Drain stdout concurrently so long transcripts cannot block exit.
            let output=child.stdout.take().ok_or("Speech output unavailable")?;
            let reader=std::thread::spawn(move || {use std::io::Read;let mut bytes=Vec::new();output.take(65536).read_to_end(&mut bytes).map(|_|bytes)});
            let deadline=Instant::now()+Duration::from_secs(45);
            loop {
                if let Some(status)=child.try_wait().map_err(|e|e.to_string())? {
                    let bytes=reader.join().map_err(|_|"Speech reader failed")?.map_err(|e|e.to_string())?;
                    if !status.success(){return Err("Offline Windows recognizer is unavailable for this language. Select an installed language or local Whisper in STT settings.".into());}
                    return String::from_utf8(bytes).map_err(|_|"Speech transcript was not UTF-8".into());
                }
                if Instant::now()>=deadline {let _=child.kill();let _=child.wait();return Err("Offline speech timed out after 45 seconds".into());}
                std::thread::sleep(Duration::from_millis(50));
            }
        }).await.map_err(|e|e.to_string())?
    }
    #[cfg(not(target_os="windows"))]
    {let _=(app,audio_base64,language);Err("Offline OS speech backend requires Windows".into())}
}
