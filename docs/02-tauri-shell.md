# 02 - Tauri Shell (Rust + macOS Integration)

## Overview

The Tauri shell is the native Rust backend that provides macOS desktop integration: system tray, global hotkeys, window management, and secure communication with the Node.js agent runtime. Built with Tauri 1.5 and macOS-specific APIs for transparency and window effects.

**Key Responsibilities:**
- System tray icon and menu
- Global keyboard shortcut (`Cmd+Shift+Space`)
- Window lifecycle (show, hide, resize, transparency)
- Agent process spawning and monitoring
- IPC bridge between UI (React) and Agent (Node.js)
- macOS entitlements and permissions
- Image file selection and encoding

**Tech Stack:**
- **Framework:** Tauri 1.5 (Rust-based desktop framework)
- **Runtime:** Tokio async runtime
- **macOS APIs:** Cocoa, Objective-C bindings
- **IPC:** Stdio (line-delimited JSON)
- **Serialization:** Serde JSON
- **Platform:** macOS 10.13+ (primary), cross-platform (future)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Tauri Shell (Rust Backend)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │             main.rs                                │    │
│  │                                                     │    │
│  │  - System tray setup                               │    │
│  │  - Global shortcut registration                    │    │
│  │  - macOS transparency (NSWindow)                   │    │
│  │  - Window event handling                           │    │
│  │  - Tauri command handlers (11 commands)            │    │
│  └────────────────┬────────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼────────────────────────────────────┐   │
│  │         agent_ipc.rs                                │   │
│  │                                                      │   │
│  │  AgentProcess:                                      │   │
│  │  - Spawn Node.js agent runtime                     │   │
│  │  - Manage stdio pipes (stdin/stdout/stderr)        │   │
│  │  - Parse JSON responses line-by-line               │   │
│  │  - Emit Tauri events to React UI                   │   │
│  │  - Handle EPIPE errors gracefully                  │   │
│  │  - Process lifecycle monitoring                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                         │
                         ↓
    ┌────────────────────────────────────────┐
    │      Node.js Agent Runtime             │
    │      (Claude Agent SDK)                │
    └────────────────────────────────────────┘
```

---

## File Structure

```
apps/tauri-shell/src-tauri/
├── src/
│   ├── main.rs           # Entry point, commands, setup
│   └── agent_ipc.rs      # Agent process management
├── Cargo.toml            # Rust dependencies
├── tauri.conf.json       # Tauri configuration
├── Info.plist            # macOS entitlements
├── build.rs              # Build script
└── icons/                # App and tray icons
    ├── icon.icns         # macOS app icon
    └── tray-icon.png     # System tray icon
```

---

## Cargo Dependencies

**apps/tauri-shell/src-tauri/Cargo.toml:**

```toml
[package]
name = "desktop-assistant"
version = "0.1.0"
edition = "2021"

[dependencies]
# Tauri with full feature set
tauri = { version = "1.5", features = [
    "path-all",                # Path utilities
    "os-all",                  # OS info
    "http-all",                # HTTP client
    "dialog-all",              # File dialogs
    "clipboard-all",           # Clipboard access
    "fs-all",                  # File system
    "notification-all",        # Notifications
    "window-all",              # Window management
    "process-all",             # Process spawning
    "macos-private-api",       # macOS-specific APIs
    "shell-all",               # Shell commands
    "global-shortcut-all",     # Global hotkeys
    "system-tray"              # System tray
]}

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Async runtime
tokio = { version = "1", features = ["full"] }

# Error handling
anyhow = "1.0"

# Utilities
once_cell = "1.19"          # Lazy statics
uuid = { version = "1.0", features = ["v4"] }  # UUIDs
base64 = "0.21"             # Image encoding (Session 30)

[target.'cfg(target_os = "macos")'.dependencies]
# macOS-specific APIs for transparency and window effects
cocoa = "0.25"
objc = "0.2"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

**Key Dependencies:**
- `tauri` - Core framework with extensive feature set
- `base64` - **Session 30:** Image encoding for file picker
- `cocoa`, `objc` - **Session 23:** macOS transparency and window effects
- `uuid` - Request ID generation
- `tokio` - Async runtime for agent process management

---

## Tauri Commands (11 total)

Tauri commands are Rust functions exposed to the frontend via `invoke()`.

### 1. Agent Lifecycle

#### `spawn_agent()`

**apps/tauri-shell/src-tauri/src/main.rs:24-42**

```rust
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
```

**Called from:** React `useAgent` hook on mount
**Purpose:** Start Node.js agent runtime process with stdio pipes

---

### 2. Message Sending

#### `send_message()`

**apps/tauri-shell/src-tauri/src/main.rs:44-70**

```rust
#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    id: String,
    message: String,
    images: Option<String>,  // JSON string of ImageAttachment[]
) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id,
                kind: "user_message".to_string(),
                message: Some(message),
                images,  // Passed through to Node.js
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
```

**Called from:** React `useAgent.sendMessage()`
**Purpose:** Send user message + optional images to agent runtime

---

### 3. Conversation Management

#### `clear_history()`

**apps/tauri-shell/src-tauri/src/main.rs:72-93**

```rust
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
```

**Called from:** React clear button, Cmd+N shortcut
**Purpose:** Clear current conversation history

#### `list_conversations()`

**apps/tauri-shell/src-tauri/src/main.rs:118-143**

```rust
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

            // Response comes via agent_response event
            Ok("Request sent".to_string())
        }
        None => Err("Agent not running".to_string()),
    }
}
```

**Called from:** React `Conversations` component
**Purpose:** Retrieve all conversations from SQLite

#### `load_conversation(conversation_id: String)`

**apps/tauri-shell/src-tauri/src/main.rs:145-166**

```rust
#[tauri::command]
async fn load_conversation(
    state: State<'_, AppState>,
    conversation_id: String
) -> Result<(), String> {
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
```

**Called from:** React `Conversations` component on click
**Purpose:** Load conversation messages from database

#### `new_conversation()`

**apps/tauri-shell/src-tauri/src/main.rs:168-189**

```rust
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
```

**Called from:** React "New conversation" button
**Purpose:** Create new conversation in database

#### `delete_conversation(conversation_id: String)`

**apps/tauri-shell/src-tauri/src/main.rs:191-212**

```rust
#[tauri::command]
async fn delete_conversation(
    state: State<'_, AppState>,
    conversation_id: String
) -> Result<(), String> {
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
```

**Called from:** React conversation context menu
**Purpose:** Delete conversation from database

---

### 4. Query Interruption (Session 26)

#### `send_interrupt()`

**apps/tauri-shell/src-tauri/src/main.rs:95-116**

```rust
#[tauri::command]
async fn send_interrupt(state: State<'_, AppState>) -> Result<(), String> {
    let agent = state.agent.lock().await;

    match agent.as_ref() {
        Some(process) => {
            let request = AgentRequest {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "interrupt".to_string(),
                message: None,
                images: None,
                conversation_id: None,
            };

            process
                .send_request(&request)
                .await
                .map_err(|e| format!("Failed to send interrupt: {}", e))
        }
        None => Err("Agent not running".to_string()),
    }
}
```

**Called from:** React ESC key handler, Stop button
**Purpose:** Interrupt currently running Claude query

---

### 5. macOS Window Effects (Session 23)

#### `toggle_transparent(enable: bool)`

**apps/tauri-shell/src-tauri/src/main.rs:214-237**

```rust
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
```

**Called from:** React (future feature for theme customization)
**Purpose:** Toggle window transparency for macOS visual effects

---

### 6. Image File Selection (Session 30)

#### `open_image_picker()`

**apps/tauri-shell/src-tauri/src/main.rs:246-261**

```rust
#[derive(serde::Serialize)]
struct ImageData {
    data: String,         // base64 encoded image
    mime_type: String,    // e.g., "image/png"
    name: String,         // e.g., "photo.jpg"
}

#[tauri::command]
async fn open_image_picker() -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    tauri::api::dialog::FileDialogBuilder::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp"])
        .pick_file(move |file_path| {
            tx.send(file_path).unwrap();
        });

    match rx.recv() {
        Ok(Some(path)) => Ok(Some(path.to_string_lossy().to_string())),
        Ok(None) => Ok(None),  // User cancelled
        Err(e) => Err(format!("File dialog error: {}", e)),
    }
}
```

**Called from:** React paperclip button click
**Purpose:** Open macOS file picker (NSOpenPanel) for image selection

#### `read_image_as_base64(path: String)`

**apps/tauri-shell/src-tauri/src/main.rs:263-308**

```rust
#[tauri::command]
async fn read_image_as_base64(path: String) -> Result<ImageData, String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or("Invalid file extension")?
        .to_lowercase();

    // Validate file type
    let valid_extensions = ["png", "jpg", "jpeg", "gif", "webp"];
    if !valid_extensions.contains(&ext.as_str()) {
        return Err(format!("Unsupported format: {}", ext));
    }

    // Read file bytes
    let bytes = fs::read(&file_path)
        .map_err(|e| format!("Failed to read: {}", e))?;

    // Encode to base64 (Session 30 - added base64 dependency)
    use base64::{engine::general_purpose, Engine as _};
    let base64_data = general_purpose::STANDARD.encode(&bytes);

    // Determine MIME type
    let mime_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    }
    .to_string();

    Ok(ImageData {
        data: base64_data,
        mime_type,
        name: file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("image")
            .to_string(),
    })
}
```

**Called from:** React after `open_image_picker()` returns path
**Purpose:** Read image file and encode as base64 (bypasses web sandbox)

**Critical:** Requires `base64 = "0.21"` in Cargo.toml (added Session 30)

---

## Command Registration

**apps/tauri-shell/src-tauri/src/main.rs:323-335**

```rust
tauri::Builder::default()
    .manage(AppState {
        agent: Arc::new(Mutex::new(None)),
    })
    .invoke_handler(tauri::generate_handler![
        spawn_agent,              // 1. Agent lifecycle
        send_message,             // 2. User messages
        clear_history,            // 3. Clear conversation
        send_interrupt,           // 4. Interrupt query (Session 26)
        list_conversations,       // 5. List all conversations
        load_conversation,        // 6. Load specific conversation
        new_conversation,         // 7. Create new conversation
        delete_conversation,      // 8. Delete conversation
        toggle_transparent,       // 9. Window transparency (Session 23)
        open_image_picker,        // 10. File picker (Session 30)
        read_image_as_base64      // 11. Image encoding (Session 30)
    ])
    .system_tray(tray)
    .on_system_tray_event(handle_tray_event)
    .setup(setup_handler)
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

---

## macOS Entitlements (Info.plist)

**Session 30, 34:** Comprehensive entitlements for future-proofing.

**apps/tauri-shell/src-tauri/Info.plist:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ========================================== -->
    <!-- FILE SYSTEM ACCESS -->
    <!-- ========================================== -->

    <!-- Allow reading user-selected files (via file picker/drag-drop) -->
    <key>com.apple.security.files.user-selected.read-only</key>
    <true/>

    <!-- Allow writing to user-selected files -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>

    <!-- Allow reading from Downloads folder -->
    <key>com.apple.security.files.downloads.read-only</key>
    <true/>

    <!-- Allow reading and writing to Downloads folder -->
    <key>com.apple.security.files.downloads.read-write</key>
    <true/>

    <!-- ========================================== -->
    <!-- NETWORK ACCESS -->
    <!-- ========================================== -->

    <!-- Outgoing network connections (API calls, web requests) -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- Incoming network connections (for local servers, webhooks) -->
    <key>com.apple.security.network.server</key>
    <true/>

    <!-- ========================================== -->
    <!-- HARDWARE ACCESS (Future Vision/Voice) -->
    <!-- ========================================== -->

    <!-- Camera access for vision features -->
    <key>com.apple.security.device.camera</key>
    <true/>

    <!-- Microphone access for voice features -->
    <key>com.apple.security.device.audio-input</key>
    <true/>

    <!-- ========================================== -->
    <!-- AUTOMATION & ACCESSIBILITY -->
    <!-- ========================================== -->

    <!-- AppleScript/JXA automation -->
    <key>com.apple.security.automation.apple-events</key>
    <true/>

    <!-- ========================================== -->
    <!-- APP SANDBOX (Required for distribution) -->
    <!-- ========================================== -->

    <!-- Enable App Sandbox -->
    <key>com.apple.security.app-sandbox</key>
    <true/>

    <!-- ========================================== -->
    <!-- TEMPORARY EXCEPTION ENTITLEMENTS -->
    <!-- (Use during development, review before production) -->
    <!-- ========================================== -->

    <!-- Disable library validation for development flexibility -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>

    <!-- Allow loading unsigned executable memory (for JIT, debugging) -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>

    <!-- Allow DYLD environment variables (useful for debugging) -->
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>

    <!-- ========================================== -->
    <!-- PRIVACY DESCRIPTIONS (Required for prompts) -->
    <!-- ========================================== -->

    <key>NSCameraUsageDescription</key>
    <string>Desktop Assistant needs camera access to analyze images and provide visual assistance.</string>

    <key>NSMicrophoneUsageDescription</key>
    <string>Desktop Assistant needs microphone access for voice input and audio transcription.</string>

    <key>NSAppleEventsUsageDescription</key>
    <string>Desktop Assistant needs automation access to interact with other applications on your behalf.</string>
</dict>
</plist>
```

**Entitlement Categories:**

| Category | Entitlements | Purpose |
|----------|--------------|---------|
| **File System** | `user-selected.read-only/read-write`, `downloads.*` | Image picker, file tools |
| **Network** | `network.client`, `network.server` | Anthropic API, local MCP servers |
| **Hardware** | `device.camera`, `device.audio-input` | Future voice/vision features |
| **Automation** | `automation.apple-events` | Future AppleScript integration |
| **Sandbox** | `app-sandbox` | Required for App Store distribution |
| **Development** | `disable-library-validation`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables` | Development flexibility (remove for production) |

**Privacy Descriptions:**
- Required by macOS for camera/microphone prompts
- Shown to user when app requests access
- Must be clear and specific about usage

---

## Window Transparency (Session 23)

**macOS-specific:** Uses Cocoa/Objective-C APIs for native transparency.

**apps/tauri-shell/src-tauri/src/main.rs:350-387**

```rust
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

        // Configure content view with rounded corners
        let content_view: id = msg_send![ns_window, contentView];
        let _: () = msg_send![content_view, setWantsLayer: true];
        let layer: id = msg_send![content_view, layer];
        let _: () = msg_send![layer, setCornerRadius: 4.0f64];
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
```

**Features:**
- ✅ Transparent window background (`clearColor`)
- ✅ Non-opaque window (`setOpaque: false`)
- ✅ Rounded corners (4px radius)
- ✅ Layer-backed content view

**Result:** Floating window with rounded corners, no title bar artifacts.

---

## Global Shortcuts

**Registered in:** `setup_handler()` function

**apps/tauri-shell/src-tauri/src/main.rs:375-384**

```rust
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
```

**Shortcut:** `Cmd+Shift+Space` (macOS), `Ctrl+Shift+Space` (Windows/Linux)
**Behavior:** Toggle window visibility (show/hide)
**Always Active:** Works even when app is in background

---

## System Tray

**Configuration:**

**apps/tauri-shell/src-tauri/src/main.rs:311-317**

```rust
// Build system tray menu
let tray_menu = SystemTrayMenu::new()
    .add_item(CustomMenuItem::new("show", "Show Assistant"))
    .add_native_item(SystemTrayMenuItem::Separator)
    .add_item(CustomMenuItem::new("quit", "Quit"));

let tray = SystemTray::new().with_menu(tray_menu);
```

**Event Handler:**

**apps/tauri-shell/src-tauri/src/main.rs:389-415**

```rust
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
```

**Menu Items:**
- **Show Assistant** - Show window and focus
- **Quit** - Exit application

**Click Behavior:**
- **Left Click** - Toggle window (same as global shortcut)
- **Right Click** - Show menu

---

## Window Event Handling

**apps/tauri-shell/src-tauri/src/main.rs:339-345**

```rust
.on_window_event(|event| {
    if let WindowEvent::CloseRequested { api, .. } = event.event() {
        // Hide instead of closing
        event.window().hide().unwrap();
        api.prevent_close();
    }
})
```

**Behavior:** Clicking window close button (X) hides instead of quitting
**Why:** Desktop assistant should stay running in tray, not quit

---

## Agent Process Management

**Module:** `agent_ipc.rs`

**Key Features:**
- ✅ Spawn Node.js process with stdio pipes
- ✅ Parse line-delimited JSON responses
- ✅ Emit Tauri events to React UI
- ✅ Handle EPIPE errors gracefully (Session 29)
- ✅ Process lifecycle monitoring

**Architecture:**

```rust
pub struct AgentProcess {
    stdin: ChildStdin,
    app_handle: tauri::AppHandle,
}

impl AgentProcess {
    pub async fn spawn(app_handle: tauri::AppHandle) -> Result<Self> {
        // Spawn node process: node apps/agent-runtime/src/index.js
        let mut child = Command::new("node")
            .arg("apps/agent-runtime/src/index.js")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        // Spawn stdout reader task
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            read_stdout(stdout, app_clone).await;
        });

        // Spawn stderr logger task
        tokio::spawn(async move {
            read_stderr(stderr).await;
        });

        Ok(Self { stdin, app_handle })
    }

    pub async fn send_request(&self, request: &AgentRequest) -> Result<()> {
        let json = serde_json::to_string(request)?;
        self.stdin.write_all(json.as_bytes()).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;
        Ok(())
    }
}
```

**EPIPE Handling (Session 29):**

```rust
async fn read_stdout(stdout: ChildStdout, app_handle: tauri::AppHandle) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                // Parse and emit JSON response
                if let Ok(response) = serde_json::from_str::<AgentResponse>(&line) {
                    app_handle.emit_all("agent_response", response).ok();
                }
            }
            Ok(None) => {
                // EOF reached (agent process exited)
                eprintln!("[AGENT IPC] Agent process stdout EOF");
                break;
            }
            Err(e) => {
                // Handle errors gracefully (don't crash on EPIPE)
                if e.kind() == std::io::ErrorKind::BrokenPipe {
                    eprintln!("[AGENT IPC] Broken pipe (EPIPE) - agent process likely closed");
                } else {
                    eprintln!("[AGENT IPC] Error reading stdout: {}", e);
                }
                // Continue reading (don't exit loop on transient errors)
                continue;
            }
        }
    }
}
```

**Session 29 Fix:** Changed from `while let Ok(Some(line))` to explicit match with error handling. Prevents silent exit on EPIPE, continues reading on transient errors.

---

## Tauri Configuration

**apps/tauri-shell/src-tauri/tauri.conf.json** (key sections):

```json
{
  "tauri": {
    "windows": [
      {
        "title": "Desktop Assistant",
        "label": "main",
        "width": 365,
        "height": 600,
        "resizable": true,
        "fullscreen": false,
        "visible": false,           // Start hidden (tray app)
        "decorations": true,
        "alwaysOnTop": false,
        "center": true,
        "skipTaskbar": true,        // Don't show in Dock
        "fileDropEnabled": false    // Session 33: Disable for HTML5 drag-drop
      }
    ],
    "systemTray": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true        // macOS template icon (adapts to dark mode)
    },
    "bundle": {
      "active": true,
      "category": "Productivity",
      "identifier": "com.yourcompany.desktop-assistant",
      "macOS": {
        "frameworks": [],
        "minimumSystemVersion": "10.13",
        "entitlements": "Info.plist"  // Use custom entitlements
      }
    }
  }
}
```

**Key Settings:**
- `visible: false` - App starts in tray (not visible)
- `skipTaskbar: true` - No Dock icon
- `fileDropEnabled: false` - **Session 33:** Allows HTML5 drag events to reach React
- `entitlements: "Info.plist"` - Use custom entitlements file

---

## Future Enhancements

### 1. Window Positioning Memory

**Planned:** Remember last window position across sessions

```rust
#[tauri::command]
fn save_window_position(window: tauri::Window) -> Result<(), String> {
    let position = window.outer_position()?;
    let size = window.outer_size()?;

    // Save to user config
    let config = WindowConfig { x: position.x, y: position.y, width: size.width, height: size.height };
    save_config(&config)?;

    Ok(())
}

fn setup_handler(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let main_window = app.get_window("main").unwrap();

    // Restore last position
    if let Ok(config) = load_config() {
        main_window.set_position(Position::Physical(PhysicalPosition { x: config.x, y: config.y }))?;
        main_window.set_size(Size::Physical(PhysicalSize { width: config.width, height: config.height }))?;
    }

    // ... rest of setup
}
```

### 2. Multiple Tray Menu Items

**Planned:** Add quick actions to tray menu

```rust
let tray_menu = SystemTrayMenu::new()
    .add_item(CustomMenuItem::new("show", "Show Assistant"))
    .add_item(CustomMenuItem::new("new", "New Conversation"))    // NEW
    .add_native_item(SystemTrayMenuItem::Separator)
    .add_item(CustomMenuItem::new("settings", "Settings"))       // NEW
    .add_item(CustomMenuItem::new("quit", "Quit"));
```

### 3. Additional Global Shortcuts

**Planned:** More keyboard shortcuts

```rust
// Show settings
app.global_shortcut_manager().register("CmdOrCtrl+Comma", move || {
    settings_window.show().unwrap();
})?;

// New conversation
app.global_shortcut_manager().register("CmdOrCtrl+N", move || {
    // Trigger new conversation
})?;
```

### 4. Voice Input Integration

**Planned:** Tauri commands for audio recording (docs/assistant-upgrades/voice-features.md)

```rust
#[tauri::command]
async fn start_audio_recording() -> Result<String, String> {
    // Start recording audio from microphone
    // Return recording session ID
}

#[tauri::command]
async fn stop_audio_recording(session_id: String) -> Result<Vec<u8>, String> {
    // Stop recording, return audio data
}

#[tauri::command]
async fn transcribe_audio(audio_data: Vec<u8>) -> Result<String, String> {
    // Send to Groq Whisper API
    // Return transcribed text
}
```

### 5. ComfyUI Integration

**Planned:** MCP server for image generation

```rust
#[tauri::command]
async fn generate_image(prompt: String, workflow: String) -> Result<ImageData, String> {
    // Call ComfyUI API
    // Return generated image as base64
}
```

---

## Testing

**Manual Testing:**

```bash
# Run in dev mode
cd apps/tauri-shell
pnpm tauri dev

# Build for production
pnpm tauri build
```

**Test Cases:**
- [ ] System tray icon appears
- [ ] Left-click tray toggles window
- [ ] Right-click shows menu
- [ ] Global shortcut (Cmd+Shift+Space) works
- [ ] Window transparency/rounded corners (macOS)
- [ ] Agent process spawns on startup
- [ ] All 11 Tauri commands work
- [ ] Image picker opens correctly
- [ ] Drag-and-drop accepts images (fileDropEnabled: false)
- [ ] Window hides on close (doesn't quit)
- [ ] EPIPE errors handled gracefully

**Unit Tests:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_data_serialization() {
        let data = ImageData {
            data: "base64data".to_string(),
            mime_type: "image/png".to_string(),
            name: "test.png".to_string(),
        };
        let json = serde_json::to_string(&data).unwrap();
        assert!(json.contains("image/png"));
    }

    #[tokio::test]
    async fn test_agent_request_formatting() {
        let request = AgentRequest {
            id: "test-123".to_string(),
            kind: "user_message".to_string(),
            message: Some("Hello".to_string()),
            images: None,
            conversation_id: None,
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("user_message"));
    }
}
```

---

## Troubleshooting

**Agent process not spawning:**
- ✅ Check Node.js is installed (`node --version`)
- ✅ Verify `apps/agent-runtime/src/index.js` exists
- ✅ Review stderr logs for Node.js errors
- ✅ Check `ANTHROPIC_API_KEY` environment variable

**Image picker not working:**
- ✅ Verify `open_image_picker` command registered
- ✅ Check `base64` dependency in Cargo.toml
- ✅ Review Info.plist entitlements (`files.user-selected.read-only`)
- ✅ Test with different image formats

**Transparency not working:**
- ✅ macOS only (check `#[cfg(target_os = "macos")]`)
- ✅ Verify `cocoa` and `objc` dependencies
- ✅ Check `macos-private-api` feature enabled
- ✅ Test with `toggle_transparent()` command

**Global shortcut not registering:**
- ✅ Check accessibility permissions (System Preferences → Security)
- ✅ Verify shortcut string format (`CmdOrCtrl+Shift+Space`)
- ✅ Test with different key combinations
- ✅ Review `global-shortcut-all` feature in Cargo.toml

**EPIPE errors crashing app:**
- ✅ Review `agent_ipc.rs` error handling (Session 29 fix)
- ✅ Check for `while let Ok(Some(line))` pattern (should use explicit match)
- ✅ Verify continue-on-error logic in stdout reader

---

## Best Practices

### 1. Command Error Handling
```rust
// ✅ Good: Return Result<T, String>
#[tauri::command]
async fn my_command() -> Result<String, String> {
    match do_something().await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("Failed: {}", e))
    }
}

// ❌ Bad: Panic on error
#[tauri::command]
async fn my_command() -> String {
    do_something().await.unwrap()  // Will crash app!
}
```

### 2. State Management
```rust
// ✅ Good: Arc<Mutex<>> for shared state
struct AppState {
    agent: Arc<Mutex<Option<AgentProcess>>>,
}

// ❌ Bad: Direct mutable state (not thread-safe)
struct AppState {
    agent: Option<AgentProcess>,
}
```

### 3. macOS Platform-Specific Code
```rust
// ✅ Good: Conditional compilation
#[cfg(target_os = "macos")]
unsafe {
    // macOS-specific code
}

#[cfg(not(target_os = "macos"))]
{
    return Err("macOS only".to_string());
}

// ❌ Bad: Assume macOS
unsafe {
    // Will fail on Windows/Linux!
}
```

### 4. Event Emission
```rust
// ✅ Good: Emit to all windows
app_handle.emit_all("agent_response", response).ok();

// ⚠️ Careful: Emit to specific window (may not exist)
window.emit("event", data)?;
```

### 5. Process Lifecycle
```rust
// ✅ Good: Graceful shutdown
tokio::spawn(async move {
    agent_process.wait().await;
    eprintln!("Agent exited");
});

// ❌ Bad: Block main thread
agent_process.wait();  // Freezes UI!
```

---

## Next Steps

- Document IPC protocol → [06-ipc-protocol.md](./06-ipc-protocol.md)
- Configure security → [07-security-config.md](./07-security-config.md)
- Agent runtime details → [03-agent-runtime.md](./03-agent-runtime.md)
- UI implementation → [05-web-ui.md](./05-web-ui.md)

---

## References

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Cocoa Framework](https://developer.apple.com/documentation/appkit)
- [macOS App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)
- [Objective-C Runtime](https://developer.apple.com/documentation/objectivec/objective-c_runtime)
