// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if fluely_lib::gguf_asr_worker_mode() { return; }
    fluely_lib::run()
}
