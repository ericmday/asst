# Desktop Assistant

> A lightweight, always-available desktop companion powered by Claude

Popup desktop assistant with system tray, global hotkey activation, and rich tool integration.

## Status

**Current Phase:** Documentation & Planning (5%)
**Next Milestone:** Initialize monorepo and project structure

See [STATUS.md](./STATUS.md) for detailed progress tracking.

## Features (Planned)

- 🎯 **Popup Interface** - `Cmd+Shift+Space` to summon anywhere
- 💬 **AI Chat** - Powered by Claude 3.5 Sonnet with streaming responses
- 🔧 **Rich Tools** - Filesystem access, system commands, external API integrations
- 🔒 **Secure** - Sandboxed tools, OS keychain for API keys, audit logging
- ⚡ **Fast** - Minimal RAM footprint, instant activation

## Architecture

```
┌─────────────┐
│ Tauri Shell │ ← System tray, hotkeys, window management (Rust)
└──────┬──────┘
       │ IPC (stdio JSON)
┌──────▼──────────┐
│ Agent Runtime   │ ← Claude SDK, conversation state (Node.js)
└──────┬──────────┘
       │
┌──────▼──────────┐
│   Tool Layer    │ ← Filesystem, system, external APIs
└─────────────────┘
```

## Tech Stack

- **Shell:** Tauri (Rust)
- **UI:** React + TypeScript + Zustand
- **Agent:** Node.js + Anthropic SDK
- **IPC:** Stdio with line-delimited JSON
- **Tools:** Sandboxed filesystem, system, API integrations

## Documentation

- **[claude.md](./claude.md)** - Project context map and quick reference
- **[STATUS.md](./STATUS.md)** - Development progress and task tracking
- **[docs/](./docs/)** - Implementation guides for each component

## Development

```bash
# Prerequisites
node --version   # v20+
rustc --version  # latest stable
pnpm --version   # latest

# Setup (coming soon)
pnpm install

# Run development
pnpm dev:tauri   # Start Tauri shell
pnpm dev:agent   # Start agent runtime

# Build production
pnpm build
```

## Project Structure

```
asst/
├─ claude.md              # Context map
├─ STATUS.md              # Progress tracking
├─ docs/                  # Implementation guides
│  ├─ 01-project-setup.md
│  ├─ 02-tauri-shell.md
│  ├─ 03-agent-runtime.md
│  ├─ 04-tool-layer.md
│  ├─ 05-web-ui.md
│  ├─ 06-ipc-protocol.md
│  └─ 07-security-config.md
└─ apps/                  # (coming soon)
   ├─ tauri-shell/        # Rust + React UI
   └─ agent-runtime/      # Node agent process
```

## License

MIT

## Security

- API keys stored in OS keychain (production)
- Tools run in sandboxed environment
- All file operations validated against allowlist
- Command execution whitelist only
- Comprehensive audit logging

---

**Note:** This project is in early development. See [STATUS.md](./STATUS.md) for current progress.
