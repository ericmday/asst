#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_ipc;

use agent_ipc::{AgentProcess, AgentRequest};
use std::sync::Arc;
use tauri::{
    CustomMenuItem, Manager, State, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, GlobalShortcutManager, WindowEvent
};
use tokio::sync::Mutex;

#[cfg(target_os = "macos")]
use cocoa::base::id;
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

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
                conversation_id: None,
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
                conversation_id: None,
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to clear history: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}

#[tauri::command]
async fn list_conversations(state: State<'_, AppState>) -> Result<String, String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "list_conversations".to_string(),
                message: None,
                images: None,
                conversation_id: None,
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to list conversations: {}", e))?;

            // Note: The response will come through the event emitter
            // The UI will handle it via the agent_response event
            Ok("Request sent".to_string())
        }
        None => Err("Agent not running".to_string()),
    }
}

#[tauri::command]
async fn load_conversation(state: State<'_, AppState>, conversation_id: String) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "load_conversation".to_string(),
                message: None,
                images: None,
                conversation_id: Some(conversation_id),
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to load conversation: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}

#[tauri::command]
async fn new_conversation(state: State<'_, AppState>) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "new_conversation".to_string(),
                message: None,
                images: None,
                conversation_id: None,
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to create new conversation: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}

#[tauri::command]
async fn delete_conversation(state: State<'_, AppState>, conversation_id: String) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "delete_conversation".to_string(),
                message: None,
                images: None,
                conversation_id: Some(conversation_id),
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to delete conversation: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}

#[tauri::command]
fn toggle_transparent(window: tauri::Window, enable: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        use objc::runtime::Class;

        let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
        let color_class = Class::get("NSColor").unwrap();
        let color: id = if enable {
            msg_send![color_class, clearColor]
        } else {
            msg_send![color_class, windowBackgroundColor]
        };
        let _: () = msg_send![ns_window, setBackgroundColor: color];
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, enable);
        return Err("Transparency toggle is only supported on macOS".to_string());
    }

    Ok(())
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
            clear_history,
            list_conversations,
            load_conversation,
            new_conversation,
            delete_conversation,
            toggle_transparent
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

    // Configure macOS transparency
    #[cfg(target_os = "macos")]
    unsafe {
        use objc::runtime::Class;

        let ns_window = main_window.ns_window()? as id;

        // Get NSColor class
        let color_class = Class::get("NSColor").unwrap();
        let clear_color: id = msg_send![color_class, clearColor];

        // Enable transparency
        let _: () = msg_send![ns_window, setOpaque: false];
        let _: () = msg_send![ns_window, setBackgroundColor: clear_color];

        // Set corner radius (8.0 for rounded-lg equivalent)
        let content_view: id = msg_send![ns_window, contentView];
        let _: () = msg_send![content_view, setWantsLayer: true];
        let layer: id = msg_send![content_view, layer];
        let _: () = msg_send![layer, setCornerRadius: 8.0f64];
        let _: () = msg_send![layer, setMasksToBounds: true];
    }

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
