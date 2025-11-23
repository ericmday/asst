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
| Shell | Tauri (Rust) |
| UI | React + TypeScript + Zustand |
| Agent | Node.js + Anthropic SDK |
| IPC | Stdio (line-delimited JSON) |
| Tools | Sandboxed filesystem, system, API integrations |

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
├─ claude.md              # This file
├─ STATUS.md              # Progress tracking
├─ docs/                  # Implementation guides
├─ apps/
│  ├─ tauri-shell/        # Rust + React UI
│  └─ agent-runtime/      # Node agent process
└─ package.json           # Workspace root
```

## 🔑 Quick Reference

- **Window Size:** 360×600 (resizable)
- **Global Shortcut:** `Cmd+Shift+Space`
- **IPC Format:** `{"id":"...","kind":"...",...}\n`
- **Model:** `claude-3-5-sonnet-20241022`
- **Security:** OS keychain for keys, sandboxed tools, audit logs

## 📝 Workflow

**Starting a session:**
1. Read [STATUS.md](./STATUS.md) for current state
2. Check "Next Task"
3. Load relevant doc from `/docs/`

**Ending a session:**
1. Update [STATUS.md](./STATUS.md) with progress
2. Log changes in diff/changelog section
3. Set "Next Task"
