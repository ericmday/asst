# Desktop Assistant - Context Map

> Tauri + Claude Agent SDK desktop companion with popup interface

## 🎯 Project Goal

Lightweight, always-available desktop assistant with tray icon, global hotkey (`Cmd+Shift+Space`), and rich tool integration (filesystem, scripts, external APIs).

## 📚 Documentation

### Implementation Guides
- **[01-project-setup.md](./docs/01-project-setup.md)** - Monorepo, dependencies, workspace
- **[02-tauri-shell.md](./docs/02-tauri-shell.md)** - Rust, tray, hotkeys, process management
- **[03-agent-runtime.md](./docs/03-agent-runtime.md)** - Node process, Claude SDK, streaming
- **[04-tool-layer.md](./docs/04-tool-layer.md)** - Tool architecture and implementations
- **[05-web-ui.md](./docs/05-web-ui.md)** - React components, state management
- **[06-ipc-protocol.md](./docs/06-ipc-protocol.md)** - Stdio JSON protocol spec
- **[07-security-config.md](./docs/07-security-config.md)** - API keys, permissions, security

### Project Tracking
- **[STATUS.md](./STATUS.md)** - Current progress, last/next tasks, changelog

## ⚙️ Tech Stack

| Layer | Technology |
|-------|------------|
| Shell | Tauri 1.5 (Rust) |
| UI | React 18 + TypeScript + Vite |
| State | Zustand |
| Styling | Tailwind CSS + shadcn/ui (Radix UI) |
| Markdown | react-markdown + remark-gfm |
| Agent | Node.js 20+ + Claude Agent SDK 0.1.50 |
| Storage | SQLite (better-sqlite3) |
| IPC | Stdio (line-delimited JSON) |
| Tools | 11 SDK tools (filesystem, bash, clipboard, open, etc.) |

## 🏗️ Architecture

```
┌─────────────┐
│ Tauri Shell │ ← Tray, hotkeys, window management
└──────┬──────┘
       │ IPC (stdio)
┌──────▼──────────┐
│ Agent Runtime   │ ← Claude SDK, conversation state
│ (Node.js)       │
└──────┬──────────┘
       │
┌──────▼──────────┐
│   Tool Layer    │ ← Filesystem, system, ComfyUI, etc.
└─────────────────┘
```

## 📦 Structure

```
desktop-assistant/
├─ claude.md              # This file (project context map)
├─ STATUS.md              # Progress tracking & changelog
├─ docs/                  # Implementation guides
├─ apps/
│  ├─ tauri-shell/        # Rust + React UI
│  │  ├─ src-tauri/       # Rust backend (IPC, window, tray)
│  │  └─ src/             # React frontend (UI components)
│  └─ agent-runtime/      # Node agent process (Claude SDK)
└─ package.json           # pnpm workspace root
```

## 🔑 Quick Reference

- **Window Size:** 365×60 (compact) → 365×600 (expanded)
- **Global Shortcut:** `Cmd+Shift+Space`
- **Auto-Compact:** 5-minute inactivity timeout
- **IPC Format:** `{"id":"...","kind":"...",...}\n`
- **Model:** `claude-3-5-sonnet-20241022`
- **Image Upload:** Paste (Cmd+V), File Picker, Drag-and-drop
- **Storage:** SQLite conversation history
- **Security:** OS keychain for keys, sandboxed tools, macOS entitlements

## 📝 Workflow

**Starting a session:**
1. Read [STATUS.md](./STATUS.md) for current state
2. Check "Next Task"
3. Load relevant doc from `/docs/`

**Ending a session:**
1. Update [STATUS.md](./STATUS.md) with progress
2. Log changes in diff/changelog section
3. Set "Next Task"
- always restart the app after a change
- Always delegate work to agents as much as possible