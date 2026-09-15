#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let web_mode = std::env::args().any(|arg| arg == "--web")
        || std::env::var("WEB_MODE").unwrap_or_default() == "1";

    if web_mode {
        app_lib::run_web_server();
    } else {
        app_lib::run();
    }
}
