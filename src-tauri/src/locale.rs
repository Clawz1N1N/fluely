#[cfg(not(target_os="android"))]
#[tauri::command]
pub fn get_system_locale()->String{
    #[cfg(target_os="windows")]
    {
        #[link(name="kernel32")]
        extern "system" {fn GetUserDefaultUILanguage()->u16;}
        let language=unsafe{GetUserDefaultUILanguage()}&0x03ff;
        match language{0x22=>"uk",0x19=>"ru",_=>"en"}.into()
    }
    #[cfg(not(target_os="windows"))]
    {
        let locale=std::env::var("LC_ALL").or_else(|_|std::env::var("LC_MESSAGES")).or_else(|_|std::env::var("LANG")).unwrap_or_default().to_lowercase();
        if locale.starts_with("uk"){"uk".into()}else if locale.starts_with("ru"){"ru".into()}else{"en".into()}
    }
}
#[cfg(target_os="android")]
#[tauri::command]
pub fn get_system_locale(app:tauri::AppHandle)->String{tauri_plugin_fluely_mobile::system_locale(&app).unwrap_or_else(|_|"en".into())}
