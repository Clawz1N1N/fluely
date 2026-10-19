//! System credential stores. No plaintext fallback or secrets in process arguments.
#[cfg(target_os="linux")]
mod linux {
    use std::{io::Write,process::{Command,Stdio}};
    pub fn save(key:&str,password:&str)->Result<(),String>{
        let mut child=Command::new("secret-tool").args(["store","--label=Fluely API credential","application","com.clawz1n1n.fluely","key",key]).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_|"Install libsecret's secret-tool and unlock the desktop secret service")?;
        let write=child.stdin.take().ok_or("Secret service input unavailable")?.write_all(password.as_bytes());
        if write.is_err(){let _=child.kill();let _=child.wait();return Err("Secret service input failed".into());}
        if child.wait().map_err(|_|"Secret service failed")?.success(){Ok(())}else{Err("Secret service did not store the credential; unlock your keyring".into())}
    }
    pub fn read(key:&str)->Result<Option<String>,String>{
        let output=Command::new("secret-tool").args(["lookup","application","com.clawz1n1n.fluely","key",key]).stdin(Stdio::null()).stderr(Stdio::null()).output().map_err(|_|"Install libsecret's secret-tool and unlock the desktop secret service")?;
        if !output.status.success(){if output.status.code()==Some(1){return Ok(None)}return Err("Secret service lookup failed".into());}
        let mut value=String::from_utf8(output.stdout).map_err(|_|"Credential is not UTF-8")?;if value.ends_with('\n'){value.pop();}Ok(Some(value))
    }
    pub fn remove(key:&str)->Result<(),String>{
        let status=Command::new("secret-tool").args(["clear","application","com.clawz1n1n.fluely","key",key]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().map_err(|_|"Install libsecret's secret-tool and unlock the desktop secret service")?;
        if status.success()||status.code()==Some(1){Ok(())}else{Err("Secret service removal failed".into())}
    }
}
#[cfg(target_os="macos")]
mod mac {
    use std::ffi::c_void;type Item=*mut c_void;
    #[link(name="Security",kind="framework")] extern "C" {
        fn SecKeychainFindGenericPassword(keychain:Item,service_len:u32,service:*const u8,account_len:u32,account:*const u8,length:*mut u32,data:*mut *mut c_void,item:*mut Item)->i32;
        fn SecKeychainAddGenericPassword(keychain:Item,service_len:u32,service:*const u8,account_len:u32,account:*const u8,length:u32,data:*const u8,item:*mut Item)->i32;
        fn SecKeychainItemModifyAttributesAndData(item:Item,attributes:*const c_void,length:u32,data:*const u8)->i32;
        fn SecKeychainItemFreeContent(attributes:*mut c_void,data:*mut c_void)->i32;
        fn SecKeychainItemDelete(item:Item)->i32;
    }
    #[link(name="CoreFoundation",kind="framework")] extern "C" {fn CFRelease(item:Item);}
    const SERVICE:&[u8]=b"com.clawz1n1n.fluely";const NOT_FOUND:i32=-25300;
    fn error(status:i32)->String{format!("macOS Keychain operation failed ({status}); unlock the login keychain")}
    unsafe fn find(key:&str,length:*mut u32,data:*mut *mut c_void,item:*mut Item)->i32{SecKeychainFindGenericPassword(std::ptr::null_mut(),SERVICE.len() as u32,SERVICE.as_ptr(),key.len() as u32,key.as_ptr(),length,data,item)}
    pub fn save(key:&str,password:&str)->Result<(),String>{unsafe{
        let mut item=std::ptr::null_mut();let found=find(key,std::ptr::null_mut(),std::ptr::null_mut(),&mut item);
        let status=if found==NOT_FOUND{SecKeychainAddGenericPassword(std::ptr::null_mut(),SERVICE.len() as u32,SERVICE.as_ptr(),key.len() as u32,key.as_ptr(),password.len() as u32,password.as_ptr(),std::ptr::null_mut())}else if found==0{let result=SecKeychainItemModifyAttributesAndData(item,std::ptr::null(),password.len() as u32,password.as_ptr());CFRelease(item);result}else{return Err(error(found));};if status==0{Ok(())}else{Err(error(status))}
    }}
    pub fn read(key:&str)->Result<Option<String>,String>{unsafe{
        let mut length=0;let mut data=std::ptr::null_mut();let status=find(key,&mut length,&mut data,std::ptr::null_mut());if status==NOT_FOUND{return Ok(None)}if status!=0{return Err(error(status))}
        let bytes=if length==0{Vec::new()}else{std::slice::from_raw_parts(data.cast::<u8>(),length as usize).to_vec()};SecKeychainItemFreeContent(std::ptr::null_mut(),data);String::from_utf8(bytes).map(Some).map_err(|_|"Credential is not UTF-8".into())
    }}
    pub fn remove(key:&str)->Result<(),String>{unsafe{
        let mut item=std::ptr::null_mut();let status=find(key,std::ptr::null_mut(),std::ptr::null_mut(),&mut item);if status==NOT_FOUND{return Ok(())}if status!=0{return Err(error(status))}let status=SecKeychainItemDelete(item);CFRelease(item);if status==0{Ok(())}else{Err(error(status))}
    }}
}
#[cfg(target_os="linux")] pub use linux::*;
#[cfg(target_os="macos")] pub use mac::*;
