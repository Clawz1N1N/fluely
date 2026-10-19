//! Windows Credential Manager implementation for the published JS API.
//! The upstream 2.0.2 package registered no desktop command handlers.
#[cfg(any(target_os="linux",target_os="macos"))]
#[path="unix_secure.rs"] mod unix_secure;
fn target(key:&str)->Result<Vec<u16>,String> {
    if key.is_empty() || key.contains('\0') || key.encode_utf16().count()>2048 {
        return Err("Invalid credential key".into());
    }
    Ok(format!("PluelyOverlay/v1/{key}").encode_utf16().chain(Some(0)).collect())
}

#[tauri::command]
pub fn save_item(key:String,password:String)->Result<(),String> {
    #[cfg(any(target_os="linux",target_os="macos"))]
    {target(&key)?;return unix_secure::save(&key,&password);}
    #[cfg(target_os="windows")]
    unsafe {
        use windows::{core::PWSTR,Win32::Security::Credentials::{CredWriteW,CREDENTIALW,CRED_TYPE_GENERIC,CRED_PERSIST_LOCAL_MACHINE,CRED_MAX_CREDENTIAL_BLOB_SIZE}};
        let mut name=target(&key)?;
        let mut secret=password.into_bytes();
        if secret.len()>CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {return Err("Credential exceeds Windows storage limit".into());}
        let credential=CREDENTIALW {Type:CRED_TYPE_GENERIC,TargetName:PWSTR(name.as_mut_ptr()),
            CredentialBlobSize:secret.len() as u32,CredentialBlob:secret.as_mut_ptr(),Persist:CRED_PERSIST_LOCAL_MACHINE,..Default::default()};
        let result=CredWriteW(&credential,0).map_err(|error|format!("Windows Credential Manager write failed: {}",error.code()));
        // Never log secrets or leave an intentional plaintext fallback.
        secret.fill(0);result
    }
    #[cfg(not(any(target_os="windows",target_os="linux",target_os="macos")))]
    {let _=(key,password);Err("This fork's secure credential backend requires Windows".into())}
}

fn read_item(key:String)->Result<Option<String>,String> {
    #[cfg(any(target_os="linux",target_os="macos"))]
    {target(&key)?;return unix_secure::read(&key);}
    #[cfg(target_os="windows")]
    unsafe {
        use windows::{core::PCWSTR,Win32::{Foundation::ERROR_NOT_FOUND,Security::Credentials::{CredReadW,CredFree,CREDENTIALW,CRED_TYPE_GENERIC}}};
        let name=target(&key)?;let mut credential:*mut CREDENTIALW=std::ptr::null_mut();
        if let Err(error)=CredReadW(PCWSTR(name.as_ptr()),CRED_TYPE_GENERIC,None,&mut credential){
            if error.code()==windows::core::HRESULT::from_win32(ERROR_NOT_FOUND.0){return Ok(None);}
            return Err(format!("Windows Credential Manager read failed: {}",error.code()));
        }
        if credential.is_null(){return Err("Credential Manager returned no credential".into());}
        let value=&*credential;
        let bytes=if value.CredentialBlobSize==0 {Vec::new()} else {std::slice::from_raw_parts(value.CredentialBlob,value.CredentialBlobSize as usize).to_vec()};
        CredFree(credential.cast());
        String::from_utf8(bytes).map(Some).map_err(|_|"Stored credential is not UTF-8".into())
    }
    #[cfg(not(any(target_os="windows",target_os="linux",target_os="macos")))]
    {let _=key;Err("This fork's secure credential backend requires Windows".into())}
}

#[derive(serde::Serialize)]
pub struct PasswordResponse { password:Option<String> }
#[tauri::command]
pub fn get_item(key:String)->Result<PasswordResponse,String> { Ok(PasswordResponse { password:read_item(key)? }) }

#[tauri::command]
pub fn remove_item(key:String)->Result<(),String> {
    #[cfg(any(target_os="linux",target_os="macos"))]
    {target(&key)?;return unix_secure::remove(&key);}
    #[cfg(target_os="windows")]
    unsafe {
        use windows::{core::PCWSTR,Win32::{Foundation::ERROR_NOT_FOUND,Security::Credentials::{CredDeleteW,CRED_TYPE_GENERIC}}};
        let name=target(&key)?;
        match CredDeleteW(PCWSTR(name.as_ptr()),CRED_TYPE_GENERIC,None){
            Ok(())=>Ok(()),Err(error) if error.code()==windows::core::HRESULT::from_win32(ERROR_NOT_FOUND.0)=>Ok(()),
            Err(error)=>Err(format!("Windows Credential Manager delete failed: {}",error.code())),
        }
    }
    #[cfg(not(any(target_os="windows",target_os="linux",target_os="macos")))]
    {let _=key;Err("This fork's secure credential backend requires Windows".into())}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credential_target_is_namespaced_utf16_and_rejects_embedded_null() {
        let name=target("ключ").unwrap();assert_eq!(name.last(),Some(&0));
        assert_eq!(String::from_utf16(&name[..name.len()-1]).unwrap(),"PluelyOverlay/v1/ключ");
        assert!(target("bad\0key").is_err());assert!(target("").is_err());
    }
}
