fn main() {
    tauri_plugin::Builder::new(&["status", "request_microphone", "request_overlay", "show_overlay", "hide_overlay", "start_microphone", "stop_microphone", "capture_screen"])
        .android_path("android").build();
}
