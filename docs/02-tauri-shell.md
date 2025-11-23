# 02 - Tauri Shell

## Overview

The Tauri shell provides the native desktop integration layer: system tray, global hotkeys, window management, and process orchestration for the agent runtime.

**Key responsibilities:**
- Application lifecycle management
- System tray and popup window
- Global keyboard shortcuts
- Spawning and monitoring the Node agent process
- Secure IPC bridge between UI and agent

## Tauri Configuration

**src-tauri/tauri.conf.json:**

```json
{
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devPath": "http://localhost:1420",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Desktop Assistant",
    "version": "0.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      },
      "dialog": {
        "all": false,
        "open": true
      },
      "fs": {
        "all": false,
        "readFile": true,
        "scope": ["$HOME/allowed-workspace/**"]
      },
      "globalShortcut": {
        "all": true
      }
    },
    "bundle": {
      "active": true,
      "category": "Productivity",
      "identifier": "com.yourcompany.desktop-assistant",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "macOS": {
        "frameworks": [],
        "minimumSystemVersion": "10.13"
      }
    },
    "security": {
      "csp": null
    },
    "systemTray": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true
    },
    "windows": [
      {
        "title": "Desktop Assistant",
        "label": "main",
        "width": 360,
        "height": 600,
        "resizable": true,
        "fullscreen": false,
        "visible": false,
        "decorations": true,
        "alwaysOnTop": false,
        "center": true,
        "skipTaskbar": true
      }
    ]
  }
}
```

## Cargo Dependencies

**src-tauri/Cargo.toml:**

```toml
[package]
name = "desktop-assistant"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1.5", features = ["global-shortcut", "system-tray", "shell-open", "dialog-open", "fs-read-file"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
anyhow = "1.0"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

## Main Application Entry

**src-tauri/src/main.rs:**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_process;
mod ipc;

use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, GlobalShortcutManager, WindowEvent
};

fn main() {
    // Build system tray menu
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Show Assistant"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(handle_tray_event)
        .setup(setup_handler)
        .invoke_handler(tauri::generate_handler![
            ipc::send_to_agent,
            ipc::get_agent_status,
            ipc::restart_agent,
            ipc::open_settings,
        ])
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
    let app_handle = app.handle();
    let main_window = app.get_window("main").unwrap();

    // Register global shortcut (Cmd+Shift+Space)
    let window_clone = main_window.clone();
    app.global_shortcut_manager().register("CmdOrCtrl+Shift+Space", move || {
        if window_clone.is_visible().unwrap() {
            window_clone.hide().unwrap();
        } else {
            window_clone.show().unwrap();
            window_clone.set_focus().unwrap();
        }
    })?;

    // Spawn agent runtime process
    tauri::async_runtime::spawn(async move {
        if let Err(e) = agent_process::spawn_and_monitor(app_handle).await {
            eprintln!("Agent process error: {}", e);
        }
    });

    Ok(())
}

fn handle_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            let window = app.get_window("main").unwrap();
            if window.is_visible().unwrap() {
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
```

## Agent Process Management

**src-tauri/src/agent_process.rs:**

```rust
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AgentMessage {
    pub id: String,
    pub payload: serde_json::Value,
}

pub struct AgentProcess {
    child: Arc<Mutex<Option<Child>>>,
    stdin_tx: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
}

impl AgentProcess {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            child: Arc::new(Mutex::new(None)),
            stdin_tx: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn spawn(&self, app_handle: AppHandle) -> Result<()> {
        // Get path to agent runtime
        let agent_path = get_agent_runtime_path(&app_handle)?;

        // Spawn Node process
        let mut child = Command::new("node")
            .arg(&agent_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to spawn agent runtime")?;

        // Take stdin/stdout handles
        let stdin = child.stdin.take().context("Failed to get stdin")?;
        let stdout = child.stdout.take().context("Failed to get stdout")?;
        let stderr = child.stderr.take().context("Failed to get stderr")?;

        // Store stdin for writing
        *self.stdin_tx.lock().await = Some(stdin);
        *self.child.lock().await = Some(child);

        // Spawn stdout reader task
        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            Self::read_stdout(stdout, app_handle_clone).await;
        });

        // Spawn stderr reader task
        tokio::spawn(async move {
            Self::read_stderr(stderr).await;
        });

        Ok(())
    }

    pub async fn send_message(&self, message: &AgentMessage) -> Result<()> {
        let json = serde_json::to_string(message)?;
        let mut stdin_guard = self.stdin_tx.lock().await;

        if let Some(stdin) = stdin_guard.as_mut() {
            stdin.write_all(json.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        }

        Ok(())
    }

    async fn read_stdout(stdout: tokio::process::ChildStdout, app_handle: AppHandle) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            // Parse JSON response from agent
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                // Emit to frontend
                app_handle.emit_all("agent_stream", msg).ok();
            }
        }
    }

    async fn read_stderr(stderr: tokio::process::ChildStderr) {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[Agent Runtime] {}", line);
        }
    }
}

// Global agent process instance
static AGENT: once_cell::sync::Lazy<Arc<Mutex<Option<AgentProcess>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

pub async fn spawn_and_monitor(app_handle: AppHandle) -> Result<()> {
    let agent = AgentProcess::new().await?;
    agent.spawn(app_handle.clone()).await?;

    // Store globally
    *AGENT.lock().await = Some(agent);

    Ok(())
}

pub async fn get_agent() -> Option<AgentProcess> {
    AGENT.lock().await.clone()
}

fn get_agent_runtime_path(app_handle: &AppHandle) -> Result<String> {
    // In development
    if cfg!(debug_assertions) {
        return Ok("../agent-runtime/src/index.ts".to_string());
    }

    // In production, bundled with the app
    let resource_path = app_handle
        .path_resolver()
        .resolve_resource("../agent-runtime/dist/index.js")
        .context("Failed to resolve agent runtime path")?;

    Ok(resource_path.to_string_lossy().to_string())
}
```

## IPC Commands

**src-tauri/src/ipc.rs:**

```rust
use crate::agent_process::{get_agent, AgentMessage};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct SendMessagePayload {
    pub message: String,
    pub attachments: Option<Vec<String>>,
}

#[tauri::command]
pub async fn send_to_agent(payload: SendMessagePayload) -> Result<(), String> {
    let agent = get_agent()
        .await
        .ok_or("Agent not running")?;

    let msg = AgentMessage {
        id: uuid::Uuid::new_v4().to_string(),
        payload: serde_json::json!({
            "kind": "user_message",
            "message": payload.message,
            "attachments": payload.attachments,
        }),
    };

    agent
        .send_message(&msg)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_agent_status() -> Result<String, String> {
    if get_agent().await.is_some() {
        Ok("running".to_string())
    } else {
        Ok("stopped".to_string())
    }
}

#[tauri::command]
pub async fn restart_agent() -> Result<(), String> {
    // TODO: Implement agent restart logic
    Err("Not implemented".to_string())
}

#[tauri::command]
pub fn open_settings(window: tauri::Window) {
    // TODO: Open settings window or route
    println!("Open settings requested");
}
```

## Development Workflow

### Run Tauri in Dev Mode

```bash
cd apps/tauri-shell
pnpm tauri dev
```

This will:
1. Start Vite dev server for the UI
2. Compile and run the Rust app
3. Hot-reload on file changes

### Build for Production

```bash
pnpm tauri build
```

Output locations:
- **macOS:** `src-tauri/target/release/bundle/macos/`
- **Windows:** `src-tauri/target/release/bundle/msi/`
- **Linux:** `src-tauri/target/release/bundle/appimage/`

## Next Steps

- Implement IPC protocol → [06-ipc-protocol.md](./06-ipc-protocol.md)
- Build React UI → [05-web-ui.md](./05-web-ui.md)
- Connect to agent runtime → [03-agent-runtime.md](./03-agent-runtime.md)

## Troubleshooting

**Global shortcut not working:**
- Check permissions on macOS (Accessibility)
- Try different key combination

**Agent process fails to spawn:**
- Verify Node.js installed and in PATH
- Check agent runtime path resolution
- Review stderr logs

**Window doesn't hide/show:**
- Verify window label matches ("main")
- Check window event handler logic
