# Migration Plan: Claude Agent SDK Integration

**Status:** Planning Phase
**Created:** November 2025
**Estimated Effort:** 2-3 sessions
**Risk Level:** Medium (preserving existing functionality)

---

## Executive Summary

Migrate from custom agent orchestration (using `@anthropic-ai/sdk` directly) to the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) while preserving all existing functionality and the Tauri UI.

### Goals
- ✅ Leverage SDK's built-in conversation management
- ✅ Gain access to MCP server support
- ✅ Use SDK hooks system for tool events
- ✅ Maintain all existing features (UI, tools, persistence)
- ✅ Keep the Tauri shell and IPC protocol intact

### Non-Goals
- ❌ Rewriting the Tauri shell (Rust code)
- ❌ Redesigning the React UI
- ❌ Changing the IPC protocol fundamentally
- ❌ Removing custom tools (they'll be adapted)

---

## Architecture Comparison

### Current (Custom Implementation)

```
┌─────────────────┐
│  Tauri Shell    │ (Rust: tray, hotkeys, window)
└────────┬────────┘
         │ stdio: line-delimited JSON
         │
┌────────▼────────────────────────────┐
│  Agent Runtime (Node.js)            │
│  ┌──────────────────────────────┐  │
│  │ AgentOrchestrator            │  │
│  │ - Manual conversation mgmt   │  │
│  │ - Custom agentic loop        │  │
│  │ - Direct Anthropic SDK calls │  │
│  │ - Manual tool execution      │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Custom Tools                 │  │
│  │ - filesystem.ts              │  │
│  │ - system.ts                  │  │
│  │ - clipboard.ts               │  │
│  │ - vision.ts                  │  │
│  │ - custom.ts (loader)         │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ ConversationDatabase         │  │
│  │ - SQLite persistence         │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Target (SDK Integration)

```
┌─────────────────┐
│  Tauri Shell    │ (UNCHANGED: Rust, tray, hotkeys)
└────────┬────────┘
         │ stdio: line-delimited JSON (UNCHANGED)
         │
┌────────▼────────────────────────────┐
│  Agent Runtime (Node.js)            │
│  ┌──────────────────────────────┐  │
│  │ SDK Adapter                  │  │ ← NEW
│  │ - Consumes SDK query()       │  │
│  │ - Converts SDKMessage → IPC  │  │
│  │ - Manages session lifecycle  │  │
│  └──────────────────────────────┘  │
│           │                         │
│           ▼                         │
│  ┌──────────────────────────────┐  │
│  │ @anthropic-ai/               │  │ ← NEW
│  │ claude-agent-sdk             │  │
│  │ - query() async generator    │  │
│  │ - Built-in conversation mgmt │  │
│  │ - Tool execution framework   │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ SDK-Compatible Tools         │  │ ← ADAPTED
│  │ - Use SDK tool() helper      │  │
│  │ - MCP server via SDK         │  │
│  │ - Hook into SDK events       │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Persistence Layer            │  │ ← ADAPTED
│  │ - Integrate with SDK hooks   │  │
│  │ - Save SDK message history   │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## What Stays vs What Changes

### ✅ Preserved (No Changes)

| Component | Location | Why It Stays |
|-----------|----------|--------------|
| Tauri Shell | `apps/tauri-shell/src-tauri/` | Window management, tray, hotkeys are custom |
| Rust IPC Bridge | `apps/tauri-shell/src-tauri/src/agent_ipc.rs` | stdio protocol works fine |
| React UI | `apps/tauri-shell/src/` | UI components, styling, state management |
| IPC Message Format | `apps/tauri-shell/src/types.ts` | Existing protocol is sufficient |
| Tool Implementations | Logic of custom tools | Functionality is sound, just needs wrapping |

### 🔄 Modified (Adapted)

| Component | Current | Target | Changes Needed |
|-----------|---------|--------|----------------|
| Agent Entry Point | `apps/agent-runtime/src/index.ts` | Same file | Call SDK instead of AgentOrchestrator |
| Tool Definitions | Custom Tool interface | SDK tool() format | Convert to SDK tool schema |
| Conversation State | Manual array management | SDK query() | Let SDK handle history |
| Tool Execution | Manual loop in agent.ts | SDK automatic | Use SDK tool hooks |
| Persistence | Direct DB writes | SDK hooks | Hook into SessionEnd, PostToolUse |

### ❌ Removed (Deleted)

| Component | Location | Reason for Removal |
|-----------|----------|-------------------|
| AgentOrchestrator | `apps/agent-runtime/src/agent.ts` | Replaced by SDK query() |
| Manual agentic loop | agent.ts:217-401 | SDK handles this |
| Manual tool execution | agent.ts:288-382 | SDK handles this |
| Manual streaming | agent.ts:123-143 | SDK provides streaming |

---

## Migration Phases

### Phase 1: Setup & Preparation (Session 1 - Part 1)

**Goal:** Install SDK and understand integration points

**Tasks:**
1. Install Claude Agent SDK
   ```bash
   cd apps/agent-runtime
   pnpm add @anthropic-ai/claude-agent-sdk
   ```

2. Read existing code for reference
   - Review current agent.ts (save patterns we need)
   - Document current IPC message flow
   - List all tool capabilities

3. Create migration branch
   ```bash
   git checkout -b feature/sdk-migration
   git add -A
   git commit -m "Pre-migration checkpoint: save current state"
   ```

4. Create backup of critical files
   ```bash
   cp src/agent.ts src/agent.ts.backup
   cp src/index.ts src/index.ts.backup
   ```

**Validation:**
- [ ] SDK package installed and version confirmed
- [ ] Git branch created with clean working state
- [ ] Backups created
- [ ] Documentation reviewed

---

### Phase 2: SDK Adapter Layer (Session 1 - Part 2)

**Goal:** Create bridge between SDK and existing IPC protocol

**Tasks:**
1. Create new file: `apps/agent-runtime/src/sdk-adapter.ts`
   - Define `SDKAdapter` class
   - Implement `processUserMessage(message: string, images?: ImageAttachment[])`
   - Convert SDK messages → IPC format
   - Handle streaming tokens
   - Handle tool use/result messages

2. Create message converter: `apps/agent-runtime/src/sdk-message-converter.ts`
   - `convertSDKMessageToIPC(sdkMsg: SDKMessage, requestId: string): AgentResponse`
   - Map SDKAssistantMessage → token events
   - Map tool events appropriately
   - Map SDKResultMessage → done/error events

3. Update `apps/agent-runtime/src/types.ts`
   - Import SDK types
   - Add SDK-related type definitions
   - Ensure compatibility with existing types

**Code Structure:**
```typescript
// apps/agent-runtime/src/sdk-adapter.ts
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentResponse, ImageAttachment } from './types.js';

export class SDKAdapter {
  private requestId: string;

  async processUserMessage(
    message: string,
    requestId: string,
    images?: ImageAttachment[]
  ): Promise<void> {
    this.requestId = requestId;

    // Create SDK query
    const q = query({
      prompt: message,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        // ... other options
      }
    });

    // Stream SDK messages
    for await (const sdkMessage of q) {
      const ipcMessage = this.convertToIPC(sdkMessage);
      this.sendResponse(ipcMessage);
    }
  }

  private convertToIPC(sdkMsg: SDKMessage): AgentResponse {
    // Conversion logic
  }

  private sendResponse(response: AgentResponse): void {
    console.log(JSON.stringify(response));
  }
}
```

**Validation:**
- [ ] SDK adapter compiles without errors
- [ ] Message converter handles all SDK message types
- [ ] Type definitions are compatible

---

### Phase 3: Tool Migration (Session 2 - Part 1)

**Goal:** Convert custom tools to SDK format

**Tasks:**
1. Create new file: `apps/agent-runtime/src/tools/sdk-tools.ts`
   - Import SDK `tool()` helper
   - Define Zod schemas for each tool
   - Wrap existing tool logic in SDK format

2. Convert filesystem tools
   - list_files → SDK tool definition
   - read_file → SDK tool definition
   - write_file → SDK tool definition
   - search_files → SDK tool definition

3. Convert system tools
   - get_system_info → SDK tool definition
   - run_shell_command → SDK tool definition
   - open_in_default_app → SDK tool definition

4. Convert extended tools
   - read_clipboard → SDK tool definition
   - write_clipboard → SDK tool definition
   - capture_screenshot → SDK tool definition
   - analyze_image → SDK tool definition

**Code Structure:**
```typescript
// apps/agent-runtime/src/tools/sdk-tools.ts
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as fs from 'fs/promises';

export const readFileTool = tool(
  'read_file',
  'Read contents of a text file',
  {
    path: z.string().describe('Absolute path to the file'),
  },
  async (args) => {
    const content = await fs.readFile(args.path, 'utf-8');
    return {
      content: [{
        type: 'text',
        text: content,
      }],
    };
  }
);

// ... more tools
```

**Validation:**
- [ ] All tools converted to SDK format
- [ ] Tool schemas defined with Zod
- [ ] Tool execution logic preserved
- [ ] No compilation errors

---

### Phase 4: SDK Integration (Session 2 - Part 2)

**Goal:** Wire SDK into the agent runtime

**Tasks:**
1. Update `apps/agent-runtime/src/index.ts`
   - Replace AgentOrchestrator with SDKAdapter
   - Initialize SDK tools
   - Handle request routing
   - Preserve clear_history, new_conversation, load_conversation handlers

2. Configure SDK options
   - Set model: `claude-sonnet-4-5-20250929`
   - Set working directory: appropriate path
   - Register all SDK tools
   - Configure any needed permissions

3. Remove deprecated code
   - Delete `apps/agent-runtime/src/agent.ts` (or rename to .backup)
   - Remove old tool registration from `tools/index.ts`

**Code Structure:**
```typescript
// apps/agent-runtime/src/index.ts
import { SDKAdapter } from './sdk-adapter.js';
import * as sdkTools from './tools/sdk-tools.js';

const adapter = new SDKAdapter({
  model: 'claude-sonnet-4-5-20250929',
  tools: Object.values(sdkTools),
  // ... other config
});

// Handle stdin messages
process.stdin.on('data', async (data) => {
  const request = JSON.parse(data.toString());

  if (request.kind === 'user_message') {
    await adapter.processUserMessage(
      request.message,
      request.id,
      request.images ? JSON.parse(request.images) : undefined
    );
  }
  // ... other handlers
});
```

**Validation:**
- [ ] Agent runtime starts without errors
- [ ] SDK properly initialized
- [ ] Tools registered
- [ ] IPC communication works

---

### Phase 5: Testing & Validation (Session 2 - Part 3)

**Goal:** Verify all functionality works end-to-end

**Test Cases:**
1. **Basic Chat**
   - [ ] Send simple text message
   - [ ] Receive streaming response
   - [ ] Verify UI updates in real-time

2. **Tool Execution**
   - [ ] Ask Claude to write a file
   - [ ] Verify tool_use event sent
   - [ ] Verify tool_result event sent
   - [ ] Verify file created on disk

3. **Multi-Turn Conversation**
   - [ ] Send multiple messages
   - [ ] Verify conversation history maintained
   - [ ] Test conversation context works

4. **Vision Capabilities**
   - [ ] Send message with image attachment
   - [ ] Verify image processed correctly
   - [ ] Test screenshot capture tool

5. **Clipboard Integration**
   - [ ] Test read_clipboard
   - [ ] Test write_clipboard

6. **Error Handling**
   - [ ] Test with invalid API key
   - [ ] Test with malformed tool input
   - [ ] Test network timeout
   - [ ] Verify error messages display in UI

7. **Conversation Management**
   - [ ] Test clear_history
   - [ ] Test new_conversation
   - [ ] Test load_conversation

**Validation:**
- [ ] All test cases pass
- [ ] No regressions in functionality
- [ ] Performance is acceptable
- [ ] Error handling is robust

---

### Phase 6: Persistence Integration (Session 3 - Part 1)

**Goal:** Integrate SDK with conversation persistence

**Tasks:**
1. Update `apps/agent-runtime/src/persistence/database.ts`
   - Add methods to save SDK messages
   - Convert SDK message format to storable format
   - Handle image content in messages

2. Implement SDK hooks
   - Use SessionStart hook to load conversation
   - Use PostToolUse hook to save tool results
   - Use SessionEnd hook to persist conversation

3. Update SDK adapter to use hooks
   ```typescript
   const q = query({
     prompt: message,
     options: {
       hooks: {
         PostToolUse: [
           {
             hooks: [async (input) => {
               // Save to database
               await db.addMessage(...);
               return { continue: true };
             }]
           }
         ]
       }
     }
   });
   ```

**Validation:**
- [ ] Messages persist to database
- [ ] Conversations load on restart
- [ ] Tool results saved correctly
- [ ] No data loss

---

### Phase 7: Advanced Features (Session 3 - Part 2)

**Goal:** Leverage SDK-specific capabilities

**Tasks:**
1. **MCP Server Setup (Optional)**
   - Create MCP server for custom tools
   - Use `createSdkMcpServer()` helper
   - Register with SDK

2. **Custom Tool Scripts via MCP**
   - Migrate custom tool loader to MCP server
   - Load tools from `~/.claude/tools/`
   - Register dynamically

3. **Enhanced Hooks**
   - Add PreToolUse hook for permission checks
   - Add Notification hook for system events
   - Add logging/audit trail

**Code Structure:**
```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

const customToolServer = createSdkMcpServer({
  name: 'custom-tools',
  tools: loadedCustomTools, // from ~/.claude/tools/
});

const q = query({
  prompt: message,
  options: {
    mcpServers: {
      'custom-tools': customToolServer,
    }
  }
});
```

**Validation:**
- [ ] MCP server works (if implemented)
- [ ] Custom tools load correctly
- [ ] Hooks execute as expected

---

### Phase 8: Cleanup & Documentation (Session 3 - Part 3)

**Goal:** Finalize migration and document changes

**Tasks:**
1. Code cleanup
   - Remove backup files
   - Remove old agent.ts
   - Remove unused imports
   - Format code consistently

2. Update documentation
   - Update `docs/03-agent-runtime.md` with SDK details
   - Update `CLAUDE.md` architecture diagram
   - Update `STATUS.md` with completion notes

3. Update dependencies
   - Remove `@anthropic-ai/sdk` if no longer needed
   - Update package.json scripts if needed

4. Git commit
   ```bash
   git add -A
   git commit -m "feat: migrate to Claude Agent SDK

   - Replace custom AgentOrchestrator with SDK query()
   - Convert tools to SDK format with tool() helper
   - Integrate SDK hooks for persistence
   - Maintain full feature parity with custom implementation
   - Preserve Tauri shell and React UI unchanged
   "
   ```

5. Merge to main
   ```bash
   git checkout main
   git merge feature/sdk-migration
   git push
   ```

**Validation:**
- [ ] All backups removed
- [ ] Documentation updated
- [ ] Code formatted and clean
- [ ] Git history is clean
- [ ] Changes pushed to remote

---

## Risk Analysis & Mitigation

### High Risk: Breaking Existing Functionality

**Risk:** Migration breaks working features

**Mitigation:**
- Create git branch before starting
- Test each phase incrementally
- Keep backups of critical files
- Run full test suite after each phase
- Have rollback plan ready

### Medium Risk: SDK Message Format Incompatibility

**Risk:** SDK messages don't map cleanly to IPC format

**Mitigation:**
- Design robust converter with fallbacks
- Handle all SDK message types explicitly
- Log unmapped messages for debugging
- Test with various message scenarios

### Medium Risk: Tool Execution Changes

**Risk:** SDK tool format requires significant rewrites

**Mitigation:**
- Wrap existing tool logic (don't rewrite)
- Use SDK tool() helper for schemas
- Preserve tool function signatures
- Test each tool individually

### Low Risk: Performance Regression

**Risk:** SDK adds overhead vs custom implementation

**Mitigation:**
- Benchmark before/after
- Use SDK streaming properly
- Monitor memory usage
- Profile if needed

### Low Risk: Persistence Format Changes

**Risk:** SDK messages don't match database schema

**Mitigation:**
- Serialize SDK messages to JSON
- Store in existing message content field
- Add migration if schema changes needed
- Test load/save cycle

---

## Rollback Plan

If migration fails or causes critical issues:

1. **Immediate Rollback**
   ```bash
   git checkout main
   git branch -D feature/sdk-migration
   ```

2. **Restore from Backup**
   ```bash
   cp src/agent.ts.backup src/agent.ts
   cp src/index.ts.backup src/index.ts
   ```

3. **Verify Restoration**
   - Run `pnpm dev:agent`
   - Test basic functionality
   - Confirm all features work

4. **Post-Mortem**
   - Document what went wrong
   - Assess if retry is worthwhile
   - Update migration plan with lessons learned

---

## Success Criteria

Migration is considered successful when:

- [ ] All existing features work unchanged from user perspective
- [ ] Chat interface responds to messages
- [ ] Streaming responses display correctly
- [ ] All tools execute successfully (filesystem, system, clipboard, vision)
- [ ] Conversation persistence works
- [ ] Images can be sent and analyzed
- [ ] Multi-turn conversations maintain context
- [ ] Clear history, new conversation, load conversation work
- [ ] Error handling is robust
- [ ] No performance regressions
- [ ] Code is cleaner and more maintainable
- [ ] Documentation is updated

## Bonus Success Criteria (SDK-Specific Benefits)

- [ ] MCP server integration working
- [ ] Custom tool loader using MCP
- [ ] SDK hooks provide better observability
- [ ] Permission system (if implemented)
- [ ] Session resumption (if needed)

---

## Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|---------------|--------------|
| Phase 1: Setup | 30 min | None |
| Phase 2: Adapter | 1-2 hours | Phase 1 |
| Phase 3: Tools | 2-3 hours | Phase 2 |
| Phase 4: Integration | 1-2 hours | Phase 3 |
| Phase 5: Testing | 1-2 hours | Phase 4 |
| Phase 6: Persistence | 1-2 hours | Phase 5 |
| Phase 7: Advanced | 1-2 hours | Phase 6 (optional) |
| Phase 8: Cleanup | 30 min | Phase 7 |
| **Total** | **8-14 hours** | **2-3 sessions** |

---

## References

- [Claude Agent SDK TypeScript Reference](./docs/claudeagentsdk.md)
- [Current Agent Implementation](../apps/agent-runtime/src/agent.ts)
- [Tool Architecture](./04-tool-layer.md)
- [IPC Protocol Spec](./06-ipc-protocol.md)

---

## Session Checklist

Before starting each session:
- [ ] Read this migration plan
- [ ] Check STATUS.md for current progress
- [ ] Review completed phases
- [ ] Verify working state (can rollback if needed)

After completing each session:
- [ ] Update STATUS.md with progress
- [ ] Commit work to git branch
- [ ] Test critical functionality
- [ ] Document any issues/learnings

---

## Notes & Learnings

_To be filled in during migration:_

### Session 1 Notes
- (To be added)

### Session 2 Notes
- (To be added)

### Session 3 Notes
- (To be added)

### Unexpected Challenges
- (To be added)

### Improvements Over Plan
- (To be added)
