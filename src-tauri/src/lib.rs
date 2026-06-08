mod api;
mod models;
mod providers;
mod settings;

use models::{ProviderSnapshot, ProviderStatus, ProviderType};

#[tauri::command]
fn get_provider_snapshots() -> Vec<ProviderSnapshot> {
    vec![ProviderSnapshot::unavailable(
        "codex-local",
        "Codex",
        ProviderType::Codex,
        "Codex provider is not connected yet",
    )]
}

#[tauri::command]
fn get_settings_dir() -> String {
    settings::settings_dir().to_string_lossy().to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_provider_snapshots,
            get_settings_dir
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Codex Quota Glance");
}
