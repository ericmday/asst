# Development Status

**Last Updated:** November 25, 2025
**Current Phase:** SDK Migration Complete
**Progress:** 50% (3/8 SDK phases complete + UI complete)

---

## 🎯 Current Focus

### ✅ Last Task Completed
**Draggable Header - COMPLETE!**

**Window Dragging:**
- ✅ Added `data-tauri-drag-region` attribute to header
- ✅ Enabled `startDragging` permission in Tauri allowlist
- ✅ Header area (hamburger, status, clear buttons) is now draggable
- ✅ Buttons remain fully interactive while dragging works
- ✅ Professional desktop app window behavior

**Technical Implementation:**
- Modified `apps/tauri-shell/src/App.tsx`:
  - Added `data-tauri-drag-region` to header div (line 306)
- Modified `apps/tauri-shell/src-tauri/tauri.conf.json`:
  - Added `"startDragging": true` to window allowlist
- Rebuild triggered automatically by Tauri dev server
- Tested and verified: drag works, no console errors

**Previous Session: Compact Window Mode with Auto-Timeout:**
- ✅ Window starts at 90px height (input-only, no decorations)
- ✅ Auto-expands to 600px on first message or conversation load
- ✅ 5-minute auto-compact timeout with activity tracking
- ✅ Timer resets on all user interactions
- ✅ Timer pauses when agent is responding
- ✅ Clean, bug-free implementation

### ⏭️ Next Task
**Additional UI Polish & Features**

- [ ] Add visual timer countdown indicator (optional)
- [ ] Configurable timeout duration in Settings
- [ ] Window position memory (remember where user placed it)
- [ ] Keyboard shortcut to manually toggle compact/expanded
- [ ] Real-time conversation title updates in sidebar
- [ ] Search/filter conversations
- [ ] Keyboard shortcuts for navigation (Cmd+1/2/3 for tabs)

**Option B: SDK Migration Phase 4+**
- [ ] Implement SDK hooks (PreToolUse, PostToolUse, SessionStart, SessionEnd)
- [ ] Add permission system with canUseTool callback
- [ ] Integrate persistence with SDK hooks
- [ ] Test advanced SDK features (forkSession, resumeSessionAt)

**Reference:** See [docs/08-sdk-migration-plan.md](./docs/08-sdk-migration-plan.md) for SDK migration guide

---

## 🗂️ File Index

- **[claude.md](./claude.md)** - Project overview & navigation
- **[STATUS.md](./STATUS.md)** - This file
- **[docs/01-project-setup.md](./docs/01-project-setup.md)** - Monorepo initialization
- **[docs/02-tauri-shell.md](./docs/02-tauri-shell.md)** - Rust implementation
- **[docs/03-agent-runtime.md](./docs/03-agent-runtime.md)** - Node agent process
- **[docs/04-tool-layer.md](./docs/04-tool-layer.md)** - Tool implementations
- **[docs/05-web-ui.md](./docs/05-web-ui.md)** - React components
- **[docs/06-ipc-protocol.md](./docs/06-ipc-protocol.md)** - IPC specification
- **[docs/07-security-config.md](./docs/07-security-config.md)** - Security model

---

## 💡 Notes for Next Session

### Context to Remember
- This is a greenfield project - no existing code yet
- Focus on minimal footprint and fast startup
- Security is critical: sandbox everything
- UI should feel like ChatGPT desktop but with richer tools

### Key Principles
1. **Fast launch** - No heavy initialization
2. **Minimal RAM** - Long-lived but lightweight
3. **Secure by default** - Whitelist everything
4. **Easy extensibility** - Simple to add tools

### Where We Left Off
- ✅ Phase 4 Complete - UI Polish fully complete!
- ✅ Phase 6-9 Roadmap defined with clear priorities
- ✅ Strategic pivot: Focus on prototype features over production packaging
- 🚧 Phase 6 In Progress - Essential Extensions
- 📋 Implementing: Clipboard, Vision, Persistence, Custom Tools
- Next Steps:
  1. Install clipboardy and create clipboard tools
  2. Create vision tools for screenshots and image analysis
  3. Set up SQLite persistence layer
  4. Build custom tool script loader
  5. Test all new features end-to-end

---

**📝 Update Instructions:**
Before clearing context, update:
1. "Last Task Completed" → what you just finished
2. "Next Task" → what to do next (with checklist)
3. "Recent Changes" → add diff log entry
4. "Last Updated" → current date
5. Component status table (if progress made)
