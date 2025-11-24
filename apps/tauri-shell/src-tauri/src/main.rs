#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_ipc;

use agent_ipc::{AgentProcess, AgentRequest};
use std::sync::Arc;
use tauri::{
    CustomMenuItem, Manager, State, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, GlobalShortcutManager, WindowEvent
};
use tokio::sync::Mutex;

// State to hold the agent process
struct AppState {
    agent: Arc<Mutex<Option<AgentProcess>>>,
}

// Tauri commands
#[tauri::command]
async fn spawn_agent(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut agent = state.agent.lock().await;

    if agent.is_some() {
        return Err("Agent already running".to_string());
    }

    match AgentProcess::spawn(app_handle).await {
        Ok(process) => {
            *agent = Some(process);
            Ok(())
        }
        Err(e) => Err(format!("Failed to spawn agent: {}", e)),
    }
}

#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    id: String,
    message: String,
    images: Option<String>,
) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id,
                kind: "user_message".to_string(),
                message: Some(message),
                images,
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to send message: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}

#[tauri::command]
async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "clear_history".to_string(),
                message: None,
                images: None,
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to clear history: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}

fn main() {
    // Build system tray menu
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Show Assistant"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(AppState {
            agent: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            spawn_agent,
            send_message,
            clear_history
        ])
        .system_tray(tray)
        .on_system_tray_event(handle_tray_event)
        .setup(setup_handler)
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                // Hide instead of closing
                event.window().hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_handler(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let main_window = app.get_window("main").unwrap();

    // Register global shortcut (Cmd+Shift+Space)
    let window_clone = main_window.clone();
    app.global_shortcut_manager().register("CmdOrCtrl+Shift+Space", move || {
        if window_clone.is_visible().unwrap_or(false) {
            window_clone.hide().unwrap();
        } else {
            window_clone.show().unwrap();
            window_clone.set_focus().unwrap();
        }
    })?;

    Ok(())
}

fn handle_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            let window = app.get_window("main").unwrap();
            if window.is_visible().unwrap_or(false) {
                window.hide().unwrap();
            } else {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "show" => {
                    let window = app.get_window("main").unwrap();
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        }
        _ => {}
    }
}
