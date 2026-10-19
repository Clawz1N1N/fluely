//! Source Android entry path. Desktop hooks are deliberately excluded.
use tauri::Manager;
pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_fluely_mobile::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keychain::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:pluely.db",crate::db::migrations()).build())
        .manage(crate::providers::ProvidersState::default())
        .manage(crate::chat_preferences::ChatPreferencesState::default())
        .manage(crate::chat_sessions::ChatSessionsState::default())
        .invoke_handler(tauri::generate_handler![crate::get_app_version,crate::locale::get_system_locale,
            crate::providers::list_providers,crate::providers::upsert_provider,crate::providers::save_provider_models,
            crate::providers::remove_provider,crate::providers::pick_provider,crate::providers::report_provider_result,
            crate::providers::reserve_provider_tokens,crate::providers::get_providers_status,
            crate::document_files::convert_legacy_document,
            crate::chat_preferences::get_chat_preferences,crate::chat_preferences::update_chat_preferences,
            crate::chat_preferences::migrate_chat_preferences,crate::structured::parse_structured,
            crate::chat_sessions::create_chat_session,crate::chat_sessions::get_chat_session,crate::chat_sessions::list_chat_sessions,
            crate::chat_sessions::append_chat_session_event,crate::chat_sessions::rename_chat_session,
            crate::chat_sessions::delete_chat_session,crate::chat_sessions::read_chat_media])
        .setup(|app|{crate::providers::initialize(app.handle()).map_err(std::io::Error::other)?;if let Some(window)=app.get_webview_window("main"){window.show()?;}Ok(())})
        .run(tauri::generate_context!()).expect("Run Fluely Android source port");
}
