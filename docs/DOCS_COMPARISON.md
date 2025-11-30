# Documentation vs Reality Comparison

**Generated:** November 27, 2025
**Purpose:** Identify gaps between documentation and actual implementation

---

## Executive Summary

### Overall Status
- **03-agent-runtime.md:** ❌ **CRITICALLY OUTDATED** (describes deleted code)
- **05-web-ui.md:** ❌ **OUTDATED** (missing 6+ major features from Sessions 21-35)
- **02-tauri-shell.md:** ⚠️ **PARTIALLY OUTDATED** (missing 4 commands, entitlements)
- **08-sdk-migration-plan.md:** ⚠️ **COMPLETED** (migration is done, doc says "Planning Phase")
- **04-tool-layer.md:** ⚠️ **PARTIALLY OUTDATED** (shows old tool interface, not SDK format)
- **Missing Docs:** 2 critical docs don't exist (conversation persistence, UI components)

---

## 📄 03-agent-runtime.md - CRITICAL

### Status: ❌ COMPLETELY OUTDATED

### What Doc Says:
```typescript
// Lines 45-107: Shows AgentOrchestrator class
export class AgentOrchestrator {
  private client: Anthropic;
  private conversationHistory: Anthropic.MessageParam[] = [];
  // Manual streaming, tool execution, etc.
}
```

### Reality (from STATUS.md + git diff):
- ✅ **AgentOrchestrator was DELETED** during SDK migration
- ✅ **Now uses:** `sdk-adapter.ts` with SDK's `query()` function
- ✅ **New architecture:** SDK handles conversation state, streaming, tools
- ✅ **Images handled** via AsyncIterable<SDKUserMessage> (not mentioned in docs)

### Missing from Doc:
1. **SDK Adapter Pattern** (`apps/agent-runtime/src/sdk-adapter.ts`)
   - `query()` async generator usage
   - Message type handling (SDKAssistantMessage, SDKToolRequestMessage, etc.)
   - AsyncIterable for image handling (Session 32 fix)

2. **Image Handling** (Sessions 30-32)
   - Base64 image encoding
   - AsyncIterable vs string prompt detection
   - Type guards for `.length` access (crashed without this)

3. **Error Handling** (Sessions 28-29)
   - EPIPE error recovery
   - Readline stdout conflict fix
   - Broken pipe detection in Rust

4. **Actual File Structure** (current reality)
   ```
   apps/agent-runtime/src/
   ├── index.ts              ← Entry point (uses SDK adapter, not orchestrator)
   ├── sdk-adapter.ts        ← NEW: SDK integration layer
   ├── sdk-tools.ts          ← NEW: SDK-format tools
   ├── agents/loader.ts      ← NEW: Agent loading system
   ├── agent.ts.backup       ← OLD: Deleted AgentOrchestrator
   └── agent.ts.old          ← OLD: Backup of deleted code
   ```

5. **SDK-Specific Concepts**
   - Session IDs and resumption
   - SDK hooks (not yet implemented but planned)
   - MCP server integration (future)

### Sections That Need Complete Rewrite:
- Lines 14-36: Architecture diagram (shows AgentOrchestrator, should show SDK)
- Lines 40-108: Entry point code (completely different now)
- Lines 162-387: AgentOrchestrator class (DELETED - replace with SDK adapter)
- Lines 389-410: Type definitions (outdated, now uses SDK types)

### Recommended Action:
**REWRITE from scratch** using actual `sdk-adapter.ts` as reference.

---

## 📄 05-web-ui.md - OUTDATED

### Status: ❌ MISSING 6+ MAJOR FEATURES

### What Doc Says:
- Shows separate component files (ChatWindow.tsx, MessageList.tsx, etc.)
- Shows Zustand state management
- Shows event-based IPC (`listen('agent_stream')`)
- Basic textarea input
- Simple message bubbles

### Reality (from CHANGELOG Sessions 21-35):

#### Missing Feature #1: **Image Upload (3 Methods)** - Session 30-33
- ❌ **Paste (Cmd+V):** Not documented
- ❌ **File Picker (📎 button):** Not documented
- ❌ **Drag-and-Drop:** Not documented
- ❌ Tauri commands: `open_image_picker()`, `read_image_as_base64()`
- ❌ Image preview UI with loading states (Session 31)
- ❌ AsyncIterable handling (Session 32)

#### Missing Feature #2: **Compact Mode** - Session 19, 35
- ❌ Dynamic window height: 60-140px (Session 35)
- ❌ Auto-expand on focus
- ❌ 5-minute inactivity timeout
- ❌ `COMPACT_HEIGHT` constant and resize logic

#### Missing Feature #3: **Navigation Sidebar** - Earlier sessions
- ❌ Conversations list
- ❌ Settings panel
- ❌ New conversation button
- ❌ Conversation switching (Session 34 fix)

#### Missing Feature #4: **ESC Key Dual Purpose** - Session 35
- ❌ Interrupt query when loading
- ❌ Hide window when idle
- ❌ State-based ESC behavior

#### Missing Feature #5: **UI Component Library** - Session 21
- ❌ shadcn/ui integration (Radix UI components)
- ❌ `components/ui/` directory structure
- ❌ Tailwind CSS configuration
- ❌ react-markdown + remark-gfm

#### Missing Feature #6: **Modern Chat UI** - Session 35
- ❌ Removed chat bubbles from AI responses
- ❌ User messages with primary background
- ❌ ChatGPT-style clean interface

#### Missing Feature #7: **Loading States** - Session 31, 35
- ❌ `isLoadingImages` state
- ❌ Loader2 spinner for images
- ❌ "Loading images..." placeholder text
- ❌ Disabled send button during loading

### Actual Component Structure (Reality):
```
apps/tauri-shell/src/
├── App.tsx                      ← Monolithic (not separate components)
├── components/
│   ├── Conversations.tsx        ← NEW: Sidebar
│   ├── Navigation.tsx           ← NEW: Settings panel
│   ├── ToolResult.tsx           ← Exists but different
│   ├── Markdown.tsx             ← NEW: react-markdown
│   └── ui/                      ← NEW: shadcn/ui components
│       ├── avatar.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── textarea.tsx
│       └── ... (15+ components)
├── useAgent.ts                  ← NEW: Custom hook (not event-based)
├── useAgentLogs.ts              ← NEW: Logging hook
└── types.ts
```

### State Management (Reality):
- ❌ **NOT using Zustand** (doc says we are)
- ✅ **Actually using:** React useState in App.tsx
- ✅ **Custom hooks:** useAgent, useAgentLogs

### Recommended Action:
**Major rewrite** to document:
1. Actual component structure (monolithic App.tsx)
2. Image upload system (3 methods)
3. Compact mode with dynamic height
4. shadcn/ui components
5. react-markdown integration
6. useAgent hook pattern (not event-based)

---

## 📄 02-tauri-shell.md - PARTIALLY OUTDATED

### Status: ⚠️ MISSING 4 COMMANDS + ENTITLEMENTS

### Missing Commands (Added Sessions 26, 30):

#### 1. Image Picker Commands - Session 30
```rust
// NOT in doc, but EXISTS in main.rs
#[tauri::command]
async fn open_image_picker() -> Result<ImageData, String>

#[tauri::command]
async fn read_image_as_base64(path: String) -> Result<ImageData, String>
```

#### 2. Interrupt Command - Session 26
```rust
// NOT in doc, but EXISTS in main.rs
#[tauri::command]
async fn send_interrupt() -> Result<(), String>
```

#### 3. Missing Dependency - Session 30
```toml
# NOT in doc, but in Cargo.toml
base64 = "0.21"  # Added for image encoding
```

### Missing Entitlements - Session 30, 34

#### Info.plist (Completely Missing from Doc)
Doc shows basic `tauri.conf.json` but doesn't mention `Info.plist`.

**Reality:** `apps/tauri-shell/src-tauri/Info.plist` exists with:
- ✅ `com.apple.security.files.user-selected.read-only`
- ✅ `com.apple.security.network.client` / `.server`
- ✅ `com.apple.security.device.camera`
- ✅ `com.apple.security.device.microphone`
- ✅ `com.apple.security.automation.apple-events`

### Missing Window Config - Sessions 19, 23, 34

Doc shows basic window config, but reality includes:
- ✅ `fileDropEnabled: false` (Session 33 - drag-drop fix)
- ✅ `transparent: true` (Session 23 - macOS transparency)
- ✅ Window positioning logic
- ✅ Pin button / always-on-top (Session 26)

### Missing IPC Details - Session 29

**Doc shows:** Simple `agent_process.rs` with basic stdout reading

**Reality:** `agent_ipc.rs` with:
- ✅ EPIPE error handling (Session 29)
- ✅ Explicit EOF detection
- ✅ Continue-on-error pattern (not exit-on-error)
- ✅ Improved logging

### Recommended Action:
**Add sections** for:
1. Image picker commands + implementation
2. Info.plist entitlements configuration
3. Interrupt command
4. Updated agent_ipc.rs patterns (EPIPE handling)

---

## 📄 08-sdk-migration-plan.md - OBSOLETE

### Status: ⚠️ MIGRATION IS **DONE**, DOC SAYS "PLANNING PHASE"

### Doc Header Says:
```markdown
**Status:** Planning Phase
**Estimated Effort:** 2-3 sessions
**Risk Level:** Medium
```

### Reality:
- ✅ **Migration: COMPLETE** (you're on `feature/sdk-migration` branch)
- ✅ **SDK integrated:** `@anthropic-ai/claude-agent-sdk@0.1.50` installed
- ✅ **Phases 1-5: DONE** (setup, adapter, tools, integration, testing)
- ⚠️ **Phase 6: PARTIAL** (persistence works, but no SDK hooks yet)
- ❌ **Phase 7: NOT STARTED** (SDK hooks, MCP servers)

### What Was Actually Done (vs Plan):

| Phase | Plan | Reality | Status |
|-------|------|---------|--------|
| 1: Setup | Install SDK, create branch | ✅ Done | Complete |
| 2: SDK Adapter | Create `sdk-adapter.ts` | ✅ Done | Complete |
| 3: Tools | Convert to SDK format | ✅ Done | Complete |
| 4: Integration | Wire SDK into index.ts | ✅ Done | Complete |
| 5: Testing | End-to-end validation | ✅ Done | Complete |
| 6: Persistence | Integrate with SDK hooks | ⚠️ Partial | Persistence works, but no hooks |
| 7: Advanced | MCP servers, custom tools | ❌ Not started | Pending |
| 8: Cleanup | Remove backups, update docs | ❌ Not done | **THIS IS THE GAP** |

### Missing from Reality (Not Implemented Yet):

1. **SDK Hooks (Phase 7)** - Planned but not implemented:
   - ❌ PostToolUse hook for logging
   - ❌ SessionEnd hook for persistence
   - ❌ PreToolUse hook for permissions

2. **Conversation Resumption** - Planned but not implemented:
   - ❌ `resume: sessionId` option in query()
   - ❌ Session continuity across restarts

3. **MCP Server Integration** - Planned but not implemented:
   - ❌ `createSdkMcpServer()` usage
   - ❌ Custom tool loader via MCP

### Recommended Action:
**Rename** to `docs/08-sdk-implementation.md` and:
1. Mark Phases 1-5 as ✅ Complete
2. Document what was actually built
3. Add "Lessons Learned" section with:
   - AsyncIterable image handling (Session 32)
   - EPIPE fixes (Session 28-29)
   - Type guard patterns
4. Keep Phases 6-7 as "Next Steps" section

---

## 📄 04-tool-layer.md - PARTIALLY OUTDATED

### Status: ⚠️ SHOWS OLD TOOL INTERFACE

### What Doc Shows:
```typescript
// Lines 18-29: Old custom tool interface
export interface Tool {
  name: string;
  description: string;
  input_schema: { ... };
  execute: (input: any) => Promise<any>;
}
```

### Reality (SDK Format):
```typescript
// apps/agent-runtime/src/sdk-tools.ts
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const readFileTool = tool(
  'read_file',
  'Read a file from disk',
  { path: z.string().describe('File path') },
  async (args) => { /* implementation */ }
);
```

### Missing from Doc:
1. **SDK tool() helper** - Not mentioned
2. **Zod schemas** - Not mentioned (doc shows plain JSON schema)
3. **Return format** - SDK tools return `{ content: SDKContent[] }`
4. **Tool registration** - Different with SDK (array of tool instances, not objects)

### Sections Needing Update:
- Lines 14-29: Tool interface (add SDK format)
- Lines 31-56: Tool registry (show SDK tool loading)
- Lines 59-204: Filesystem tools (add SDK examples alongside custom)
- Lines 206-303: System tools (add SDK examples)
- Lines 381-429: Custom tool template (add SDK version)

### Recommended Action:
**Add section** showing both formats:
- Custom Tool Interface (legacy/compatibility)
- SDK Tool Format (current standard)
- Migration guide between formats

---

## 📄 Missing Documentation

### 1. **docs/09-conversation-persistence.md** - DOESN'T EXIST

**Should cover:**
- SQLite schema (conversations table, messages table)
- Database initialization (`apps/agent-runtime/src/persistence/database.ts`)
- CRUD operations for conversations
- Message storage format
- Session management
- Integration with SDK (or lack thereof currently)

**Why it matters:** Persistence is a core feature but completely undocumented.

### 2. **docs/10-ui-components.md** - DOESN'T EXIST

**Should cover:**
- Component hierarchy (App.tsx → Conversations, Navigation, etc.)
- shadcn/ui integration guide
- Tailwind CSS configuration
- react-markdown setup
- State management patterns (useState, not Zustand)
- Image preview components
- Loading states
- Compact mode UI logic

**Why it matters:** UI is complex but undocumented beyond basic 05-web-ui.md.

---

## Priority Matrix

### 🔴 Critical (Do First)

| Doc | Issue | Impact | Effort |
|-----|-------|--------|--------|
| 03-agent-runtime.md | Describes deleted code | High - misleading | 2-3 hours |
| 08-sdk-migration-plan.md | Says "planning" but done | Medium - confusing | 1 hour |

### 🟡 High Priority

| Doc | Issue | Impact | Effort |
|-----|-------|--------|--------|
| 05-web-ui.md | Missing 6 features | High - incomplete | 2-3 hours |
| 02-tauri-shell.md | Missing 4 commands | Medium - gaps | 1-2 hours |
| 09-conversation-persistence.md | Doesn't exist | Medium - gap | 2 hours |

### 🟢 Medium Priority

| Doc | Issue | Impact | Effort |
|-----|-------|--------|--------|
| 04-tool-layer.md | No SDK format | Low - still works | 1 hour |
| 10-ui-components.md | Doesn't exist | Low - nice to have | 2-3 hours |

---

## Recommended Update Order

### Session 1: Critical Fixes (3-4 hours)
1. ✅ **03-agent-runtime.md** - Complete rewrite with SDK adapter
2. ✅ **08-sdk-migration-plan.md** - Rename and update status

### Session 2: High-Value Updates (4-5 hours)
3. ✅ **05-web-ui.md** - Add 6 missing features
4. ✅ **02-tauri-shell.md** - Add missing commands and entitlements

### Session 3: Fill Gaps (3-4 hours)
5. ✅ **09-conversation-persistence.md** - Create new doc
6. ✅ **04-tool-layer.md** - Add SDK tool format section

### Session 4: Nice-to-Have (2-3 hours)
7. ✅ **10-ui-components.md** - Create new doc
8. ✅ **claude.md** - Update tech stack if needed

---

## Verification Checklist

After updating docs, verify:
- [ ] All code examples compile and run
- [ ] File paths match actual structure
- [ ] No references to deleted files (agent.ts, AgentOrchestrator)
- [ ] All features from Sessions 21-35 documented
- [ ] Architecture diagrams match reality
- [ ] Tech stack list is accurate

---

## Next Steps

1. Review this comparison with user
2. Decide on update priorities
3. Start with critical docs (03, 08)
4. Create new missing docs (09, 10)
5. Update STATUS.md when complete
