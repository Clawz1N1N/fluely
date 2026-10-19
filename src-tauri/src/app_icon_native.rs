//! Update only the private, not-running alias prepared by identity.rs.
use std::path::Path;
#[cfg(windows)] mod win {
    use super::*;use std::{ffi::c_void,os::windows::ffi::OsStrExt};
    type Handle=*mut c_void;
    #[link(name="kernel32")] extern "system" {
        fn LoadLibraryExW(path:*const u16,file:Handle,flags:u32)->Handle;
        fn FreeLibrary(module:Handle)->i32;
        fn EnumResourceNamesW(module:Handle,kind:*const u16,callback:Option<unsafe extern "system" fn(Handle,*const u16,*const u16,isize)->i32>,param:isize)->i32;
        fn EnumResourceLanguagesW(module:Handle,kind:*const u16,name:*const u16,callback:Option<unsafe extern "system" fn(Handle,*const u16,*const u16,u16,isize)->i32>,param:isize)->i32;
        fn BeginUpdateResourceW(path:*const u16,delete:i32)->Handle;
        fn UpdateResourceW(update:Handle,kind:*const u16,name:*const u16,language:u16,data:*const c_void,size:u32)->i32;
        fn EndUpdateResourceW(update:Handle,discard:i32)->i32;
    }
    enum Name { Id(u16), Text(Vec<u16>) }
    impl Name { fn pointer(&self)->*const u16 {match self{Self::Id(id)=>*id as usize as _,Self::Text(words)=>words.as_ptr()}} }
    unsafe extern "system" fn name(_module:Handle,_kind:*const u16,value:*const u16,param:isize)->i32{
        let names=&mut *(param as *mut Vec<Name>);
        if value as usize<=65535{names.push(Name::Id(value as usize as u16));}else{let mut length=0;while *value.add(length)!=0{length+=1;}names.push(Name::Text(std::slice::from_raw_parts(value,length+1).to_vec()));}1
    }
    unsafe extern "system" fn language(_module:Handle,_kind:*const u16,_name:*const u16,lang:u16,param:isize)->i32{(*(param as *mut Vec<u16>)).push(lang);1}
    pub fn patch_icon(path:&Path,bytes:&[u8])->Result<(),String>{
        let (group,images)=super::super::core::ico_resources(bytes)?;
        let path:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe {
            let module=LoadLibraryExW(path.as_ptr(),std::ptr::null_mut(),0x2|0x20);
            if module.is_null(){return Err(format!("Load own icon resources: {}",std::io::Error::last_os_error()));}
            let mut names=Vec::<Name>::new();EnumResourceNamesW(module,14usize as _,Some(name),&mut names as *mut _ as isize);
            if names.is_empty(){names.push(Name::Id(1));}
            let mut groups=Vec::new();
            for name in names{let mut langs=Vec::new();EnumResourceLanguagesW(module,14usize as _,name.pointer(),Some(language),&mut langs as *mut _ as isize);if langs.is_empty(){langs.push(0);}groups.push((name,langs));}
            FreeLibrary(module);
            let update=BeginUpdateResourceW(path.as_ptr(),0);
            if update.is_null(){return Err(format!("Begin own icon update: {}",std::io::Error::last_os_error()));}
            let result=(||{
                for (name,langs) in groups {for lang in langs {
                    for (index,image) in images.iter().enumerate(){if UpdateResourceW(update,3usize as _,(index+1) as _,lang,image.as_ptr().cast(),image.len() as u32)==0{return Err(format!("Update own icon image: {}",std::io::Error::last_os_error()));}}
                    if UpdateResourceW(update,14usize as _,name.pointer(),lang,group.as_ptr().cast(),group.len() as u32)==0{return Err(format!("Update own icon group: {}",std::io::Error::last_os_error()));}
                }}Ok(())
            })();
            if result.is_err(){EndUpdateResourceW(update,1);return result;}
            if EndUpdateResourceW(update,0)==0{return Err(format!("Finish own icon update: {}",std::io::Error::last_os_error()));}
        }Ok(())
    }
}
#[cfg(windows)] pub use win::patch_icon;
#[cfg(not(windows))] pub fn patch_icon(_path:&Path,_bytes:&[u8])->Result<(),String>{Err("Executable resource icons require Windows".into())}
