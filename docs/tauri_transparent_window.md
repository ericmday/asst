# Tauri Transparent Window Guide

## 1. Enable Transparency in `tauri.conf.json`

```json
{
  "tauri": {
    "windows": [
      {
        "transparent": true,
        "decorations": false,
        "fullscreen": false,
        "resizable": true,
        "focus": true
      }
    ]
  }
}
```

## 2. Transparent WebView Background

```css
html, body {
  background: transparent !important;
}

#root {
  background: transparent;
}
```

## 3. Rust Setup for macOS Transparency

```rust
use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let window = app.get_window("main").unwrap();

      #[cfg(target_os = "macos")]
      {
        use cocoa::appkit::{NSWindow, NSWindowStyleMask};
        use cocoa::base::id;
        use objc::{class, msg_send, sel, sel_impl};

        let ns_window = window.ns_window().unwrap() as id;

        unsafe {
          let _: () = msg_send![ns_window, setOpaque: false];
          let _: () = msg_send![ns_window, setBackgroundColor: cocoa::appkit::NSColor::clearColor()];
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error running tauri app");
}
```

## 4. Optional macOS Vibrancy

```sh
cargo add tauri-plugin-vibrancy
```

```rust
use tauri_plugin_vibrancy::Vibrancy;

Vibrancy::apply(
    &window,
    NSVisualEffectMaterial::HUDWindow,
    None
).ok();
```

## 5. Hotkey Toggle for Transparency

```rust
#[tauri::command]
fn toggle_transparent(window: tauri::Window, enable: bool) {
    #[cfg(target_os = "macos")]
    unsafe {
        let ns_window = window.ns_window().unwrap() as cocoa::base::id;
        let color = if enable {
            cocoa::appkit::NSColor::clearColor()
        } else {
            cocoa::appkit::NSColor::windowBackgroundColor()
        };
        let _: () = msg_send![ns_window, setBackgroundColor: color];
    }
}
```

```ts
import { invoke } from "@tauri-apps/api";

document.addEventListener("keydown", (e) => {
  if (e.key === "F12") {
    invoke("toggle_transparent", { enable: true });
  }
});
```

## 6. Common Issues

- WebView background not transparent  
- Tailwind applying default `bg-white`  
- Missing `setOpaque:false` on macOS  
- Windows transparency inconsistencies  
