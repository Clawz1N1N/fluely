//! Standalone Windows resource check: rustc --edition=2021 --test tests/native-icon.rs -o <temporary.exe>
#[path="../src-tauri/src/app_icon_core.rs"] mod core;
#[path="../src-tauri/src/app_icon_native.rs"] mod native;
#[cfg(windows)]
#[test]
fn patches_private_pe_copy_and_preserves_source() {
    use std::{ffi::c_void,os::windows::ffi::OsStrExt};type Handle=*mut c_void;
    #[link(name="kernel32")] extern "system" {
        fn LoadLibraryExW(path:*const u16,file:Handle,flags:u32)->Handle;fn FreeLibrary(module:Handle)->i32;
        fn FindResourceW(module:Handle,name:*const u16,kind:*const u16)->Handle;
        fn LoadResource(module:Handle,resource:Handle)->Handle;fn LockResource(resource:Handle)->*const u8;fn SizeofResource(module:Handle,resource:Handle)->u32;
    }
    let source=std::env::var_os("FLUELY_ICON_TEST_EXE").map(std::path::PathBuf::from).unwrap_or_else(||std::env::current_exe().unwrap());
    let before=std::fs::read(&source).unwrap();let target=std::env::temp_dir().join(format!("fluely-icon-native-{}.exe",std::process::id()));std::fs::write(&target,&before).unwrap();
    let ico=include_bytes!("../src-tauri/icons/icon.ico");let (expected,images)=core::ico_resources(ico).unwrap();native::patch_icon(&target,ico).unwrap();
    let wide:Vec<_>=target.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {let module=LoadLibraryExW(wide.as_ptr(),std::ptr::null_mut(),0x2|0x20);assert!(!module.is_null());
        let group=FindResourceW(module,1usize as _,14usize as _);assert!(!group.is_null());let data=LockResource(LoadResource(module,group));assert_eq!(std::slice::from_raw_parts(data,SizeofResource(module,group) as usize),expected);
        for (index,image) in images.iter().enumerate(){let resource=FindResourceW(module,(index+1) as _,3usize as _);assert!(!resource.is_null());let data=LockResource(LoadResource(module,resource));assert_eq!(std::slice::from_raw_parts(data,SizeofResource(module,resource) as usize),image);}
        FreeLibrary(module);
    }
    assert_eq!(std::fs::read(source).unwrap(),before);std::fs::remove_file(target).unwrap();
}
