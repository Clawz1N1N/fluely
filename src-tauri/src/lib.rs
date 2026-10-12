// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod capture;
mod app_paths;
mod db;
mod shortcuts;
mod shell;
mod shell_store;
mod continuous;
mod vision;
mod ui_automation;
mod providers;
mod structured;
mod structured_core;
mod tts;
mod stt;
mod window;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tokio::task::JoinHandle;
mod speaker;
use capture::CaptureState;
use speaker::VadConfig;

#[derive(Default)]
pub struct AudioState {
    stream_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    vad_config: Arc<Mutex<VadConfig>>,
    is_capturing: Arc<Mutex<bool>>,
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn shortcut_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

                            let action_id = {
                                let state = app.state::<shortcuts::RegisteredShortcuts>();
                                let registered = match state.shortcuts.lock() {
                                    Ok(guard) => guard,
                                    Err(poisoned) => {
                                        eprintln!("Mutex poisoned in handler, recovering...");
                                        poisoned.into_inner()
                                    }
                                };

                                registered.iter().find_map(|(action_id, shortcut_str)| {
                                    if let Ok(s) = shortcut_str.parse::<Shortcut>() {
                                        if &s == shortcut {
                                            return Some(action_id.clone());
                                        }
                                    }
                                    None
                                })
                            };

                            if let Some(action_id) = action_id {
                                match event.state() {
                                    ShortcutState::Pressed => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::start_move_window(app, direction);
                                        } else {
                                            eprintln!("Shortcut triggered: {}", action_id);
                                            shortcuts::handle_shortcut_action(app, &action_id);
                                        }
                                    }
                                    ShortcutState::Released => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::stop_move_window(app, direction);
                                        }
                                    }
                                }
                            }
                        })
                        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(shortcut_plugin())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pluely.db", db::migrations())
                .build(),
        )
        .manage(AudioState::default())
        .manage(CaptureState::default())
        .manage(shortcuts::WindowVisibility {
            is_hidden: Mutex::new(false),
        })
        .manage(shortcuts::RegisteredShortcuts::default())
        .manage(shortcuts::MoveWindowState::default())
        .manage(shell::ShellState::default())
        .manage(continuous::ContinuousState::default())
        .manage(vision::VisionState::default())
        .manage(providers::ProvidersState::default())
        .manage(tts::TtsState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keychain::init())
        .plugin(tauri_plugin_shell::init()) // Add shell plugin
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            window::set_window_height,
            window::open_dashboard,
            window::toggle_dashboard,
            window::move_window,
            capture::capture_to_base64,
            capture::start_screen_capture,
            capture::capture_selected_area,
            capture::close_overlay_window,
            shortcuts::check_shortcuts_registered,
            shortcuts::get_registered_shortcuts,
            shortcuts::update_shortcuts,
            shortcuts::validate_shortcut_key,
            shortcuts::set_app_icon_visibility,
            shortcuts::set_always_on_top,
            shortcuts::exit_app,
            speaker::start_system_audio_capture,
            speaker::stop_system_audio_capture,
            speaker::manual_stop_continuous,
            speaker::check_system_audio_access,
            speaker::request_system_audio_access,
            speaker::get_vad_config,
            speaker::update_vad_config,
            speaker::get_capture_status,
            speaker::get_audio_sample_rate,
            shell::get_window_display_affinity,
            shell::move_shell_window,
            shell::set_ui_mode,
            shell::get_ui_mode,
            shell::set_shimmer,
            shell::set_shimmer_speed,
            shell::set_answer_opacity,
            shell::set_shell_opacity,
            shell::get_answer_interaction,
            shell::toggle_answer_interaction_window,
            shell::reset_shell_layout,
            shell::find_shell_buttons,
            shell::get_shell_settings,
            shell::toggle_answer_window,
            shell::show_answer_window,
            shell::present_answer_window,
            shell::close_answer_window,
            shell::set_answer_editing,
            shell::answer_ask,
            continuous::get_capture_settings,
            continuous::update_capture_settings,
            continuous::continuous_add_question,
            continuous::continuous_add_transcript,
            continuous::start_continuous,
            continuous::stop_continuous,
            continuous::continuous_request_done,
            continuous::capture_now,
            continuous::flush_continuous,
            continuous::continuous_set_audio_pending,
            vision::get_vision_settings,
            vision::update_vision_settings,
            vision::build_screen_context,
            providers::list_providers,
            providers::upsert_provider,
            providers::remove_provider,
            providers::pick_provider,
            providers::report_provider_result,
            providers::set_global_daily_limit,
            providers::set_global_limits,
            providers::get_global_limits,
            providers::set_neutral_mode,
            providers::get_providers_status,
            structured::parse_structured,
            tts::get_tts_settings,
            tts::update_tts_settings,
            tts::set_tts_enabled,
            tts::synthesize_piper,
            stt::transcribe_system_audio,
            speaker::get_input_devices,
            speaker::get_output_devices,
        ])
        .setup(|app| {
            // A portable profile also isolates WebView2/localStorage. The main
            // window is created manually because WindowConfig has no data-dir.
            if let Some(directory) = app_paths::webview_dir()? {
                let config = app.config().app.windows.iter().find(|window| window.label == "main")
                    .ok_or("Main window config unavailable")?.clone();
                tauri::WebviewWindowBuilder::from_config(app, &config)?.data_directory(directory).build()?;
            }
            // Keep the legacy webview hidden until it becomes the service host.
            window::setup_service_window(app)?;
            providers::initialize(app.handle())?;
            let app_handle = app.handle();
            if app_handle.get_webview_window("dashboard").is_none() {
                if let Err(e) = window::create_dashboard_window(&app_handle) {
                    eprintln!("Failed to pre-create dashboard window on startup: {}", e);
                }
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;

                #[allow(deprecated, unexpected_cfgs)]
                if let Err(e) = app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    Some(vec![]),
                )) {
                    eprintln!("Failed to initialize autostart plugin: {}", e);
                }
            }

            // Build the custom overlay shell windows.
            if let Err(e) = shell::init_shell(app.handle()) {
                eprintln!("Failed to initialize shell windows: {}", e);
            }
            if let Err(e) = shortcuts::setup_global_shortcuts(app.handle()) {
                eprintln!("Failed to setup global shortcuts: {}", e);
            }
            Ok(())
        });

    // Add macOS-specific permissions plugin
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_macos_permissions::init());

    let mut context = tauri::generate_context!();
    if app_paths::webview_dir().expect("Invalid explicit profile directory").is_some() {
        for window in &mut context.config_mut().app.windows { if window.label == "main" { window.create = false; } }
    }
    builder
        .run(context)
        .expect("error while running tauri application");
}
