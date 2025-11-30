# 03 - Agent Runtime (Claude Agent SDK)

## Overview

The agent runtime is a long-lived Node.js process powered by the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`). It manages conversations, executes tools via MCP servers, and communicates with the Tauri shell through stdio.

**Key Responsibilities:**
- Wrap SDK `query()` generator for stdio IPC compatibility
- Manage conversation persistence via SQLite
- Register tools as an MCP server (`createSdkMcpServer`)
- Support session resumption for conversation continuity
- Handle image attachments (AsyncIterable<SDKUserMessage>)
- Provide interrupt capability for long-running queries
- Support slash commands and @agent mentions

**Architecture Philosophy:**
- ✅ **SDK-First:** Leverage SDK's built-in conversation management, tool execution, and streaming
- ✅ **MCP Integration:** Register all tools as an MCP server for proper SDK integration
- ✅ **Extensible:** Designed to accommodate future enhancements (hooks, memory, vector DB)
- ✅ **IPC Bridge:** Maintain backward compatibility with existing Tauri shell protocol

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Agent Runtime (Node.js)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │            IPC Handler (index.ts)                  │    │
│  │  - Readline stdio listener                         │    │
│  │  - Request routing (user_message, load_convo, etc) │    │
│  │  - JSON request parsing                            │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     │                                        │
│  ┌─────────────────▼────────────────────────────────────┐  │
│  │         SDK Adapter (sdk-adapter.ts)                 │  │
│  │                                                       │  │
│  │  - Wraps SDK query() AsyncGenerator                  │  │
│  │  - Converts SDKMessage → IPC AgentResponse           │  │
│  │  - Manages session resumption (currentSessionId)     │  │
│  │  - Handles image attachments (AsyncIterable)         │  │
│  │  - Provides interrupt() capability                   │  │
│  │  - Slash command handling (/reset, /help, etc)      │  │
│  │  - @agent mention routing                           │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│  ┌─────────────────▼────────────────────────────────────┐  │
│  │      Claude Agent SDK (@anthropic-ai/claude-*)       │  │
│  │                                                       │  │
│  │  query({                                             │  │
│  │    prompt: string | AsyncIterable<SDKUserMessage>,  │  │
│  │    options: {                                        │  │
│  │      model: 'claude-sonnet-4-5-20250929',           │  │
│  │      resume: sessionId,    ← Conversation continuity│  │
│  │      mcpServers: { ... },  ← Tool registration      │  │
│  │      agents: { ... },      ← SDK subagents          │  │
│  │      maxTurns: 10          ← Agentic loop limit     │  │
│  │    }                                                 │  │
│  │  })                                                  │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│       ┌─────────────┴─────────────┐                         │
│       │                           │                          │
│  ┌────▼─────────┐         ┌──────▼──────────┐              │
│  │ MCP Server   │         │  Persistence    │              │
│  │ (sdk-tools)  │         │  (SQLite)       │              │
│  │              │         │                 │              │
│  │ - 11 tools   │         │ - Conversations │              │
│  │ - Filesystem │         │ - Messages      │              │
│  │ - System     │         │ - Session IDs   │              │
│  │ - Clipboard  │         │                 │              │
│  │ - Vision     │         │                 │              │
│  └──────────────┘         └─────────────────┘              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Future Enhancements (Planned):**
```
┌─────────────────────────────────────────────────────────────┐
│  🔮 FUTURE: Enhanced Architecture with Memory System        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              SDK Hooks Layer (NEW)                 │    │
│  │                                                     │    │
│  │  hooks: {                                          │    │
│  │    PreToolUse: [permissionCheck, rateLimit],      │    │
│  │    PostToolUse: [logToVectorDB, updateMemory],    │    │
│  │    SessionEnd: [persistToSQLite, indexMemory]     │    │
│  │  }                                                 │    │
│  └────────────────────┬───────────────────────────────┘    │
│                       │                                      │
│  ┌────────────────────▼──────────────────────────────┐     │
│  │         Memory System (NEW)                       │     │
│  │                                                    │     │
│  │  - Vector DB (LanceDB or Chroma)                 │     │
│  │  - Semantic search over conversation history     │     │
│  │  - Contextual retrieval for long-term memory     │     │
│  │  - Embeddings via Ollama or Voyage AI           │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Entry Point (index.ts)

The agent runtime entry point sets up the SDK adapter and handles IPC requests.

**Key Components:**
1. **Readline Interface:** Reads line-delimited JSON from stdin (Tauri shell → Node)
2. **SDK Adapter:** Wraps Claude Agent SDK for stdio compatibility
3. **MCP Server:** Created via `createSDKTools()` with 11 tools
4. **Request Router:** Handles 7 request types (user_message, load_conversation, etc.)

**apps/agent-runtime/src/index.ts:**

```typescript
import { createInterface } from 'readline';
import { SDKAdapter, type ImageAttachment } from './sdk-adapter.js';
import { loadConfig } from './config.js';
import { createSDKTools } from './sdk-tools.js';

interface AgentRequest {
  id: string;
  kind: 'user_message' | 'clear_history' | 'load_conversation' |
        'new_conversation' | 'list_conversations' | 'delete_conversation' |
        'interrupt';
  message?: string;
  conversation_id?: string;
  images?: string; // JSON string of ImageAttachment[]
}

async function main() {
  // Load configuration (API key, model, allowed directories, etc.)
  const config = loadConfig();

  // Create MCP server with all 11 tools (filesystem, system, clipboard, vision)
  const mcpServer = createSDKTools(config);
  console.error('[INFO] SDK MCP server created with 11 tools');

  // Create SDK adapter (bridges SDK query() with stdio IPC)
  const adapter = new SDKAdapter(config, mcpServer);
  console.error('[INFO] SDK adapter initialized');

  // Setup stdio IPC
  // IMPORTANT: Do NOT set output to process.stdout - conflicts with IPC protocol
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  // Handle incoming messages
  rl.on('line', async (line: string) => {
    try {
      const request: AgentRequest = JSON.parse(line);

      switch (request.kind) {
        case 'user_message':
          // Parse image attachments if provided
          let images: ImageAttachment[] = [];
          if (request.images) {
            images = JSON.parse(request.images);
          }

          // Process via SDK
          await adapter.processUserMessage(request.message!, request.id, images);
          break;

        case 'clear_history':
          adapter.clearSession();
          console.log(JSON.stringify({ type: 'done', id: request.id, timestamp: Date.now() }));
          break;

        case 'new_conversation':
          const newConv = adapter.createConversation();
          console.log(JSON.stringify({
            type: 'done',
            id: request.id,
            data: { conversation: newConv },
            timestamp: Date.now()
          }));
          break;

        case 'load_conversation':
          const result = adapter.loadConversation(request.conversation_id!);
          console.log(JSON.stringify({
            type: 'done',
            id: request.id,
            data: result,
            timestamp: Date.now()
          }));
          break;

        case 'interrupt':
          await adapter.interrupt();
          console.log(JSON.stringify({ type: 'done', id: request.id, timestamp: Date.now() }));
          break;

        // ... other request handlers
      }
    } catch (error) {
      console.log(JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      }));
    }
  });

  // Send ready signal to Tauri shell
  console.log(JSON.stringify({ type: 'ready', timestamp: Date.now() }));
}

// Handle EPIPE errors gracefully (broken pipe when parent closes)
process.on('uncaughtException', (error) => {
  if ((error as any).code === 'EPIPE') {
    console.error('EPIPE error - parent process closed pipe');
    process.exit(0);
  }
  throw error;
});

main();
```

**IPC Protocol:**
- **Input (stdin):** Line-delimited JSON requests from Tauri shell
- **Output (stdout):** Line-delimited JSON responses (token, tool_use, done, error)
- **Logging (stderr):** Debug logs, errors (won't interfere with IPC)

---

## SDK Adapter (sdk-adapter.ts)

The `SDKAdapter` class bridges the Claude Agent SDK with our stdio IPC protocol.

### Core Responsibilities

**apps/agent-runtime/src/sdk-adapter.ts:**

```typescript
import {
  query,
  type SDKMessage,
  type SDKUserMessage,
  type Query
} from '@anthropic-ai/claude-agent-sdk';

export class SDKAdapter {
  private config: AppConfig;
  private mcpServer: McpSdkServerConfigWithInstance;
  private currentSessionId?: string;  // For conversation continuity
  private currentConversationId?: string;  // Database ID
  private currentQuery?: Query;  // For interrupt support
  private db: ConversationDatabase;
  private agents: Record<string, AgentDefinition>;  // SDK subagents

  constructor(config: AppConfig, mcpServer: McpSdkServerConfigWithInstance) {
    this.config = config;
    this.mcpServer = mcpServer;
    this.db = new ConversationDatabase();
    this.initializeAgents();
  }

  /**
   * Process user message through SDK
   */
  async processUserMessage(
    message: string,
    requestId: string,
    images?: ImageAttachment[]
  ): Promise<void> {
    // 1. Handle slash commands (/reset, /help, /session)
    if (message.startsWith('/')) {
      const handled = await this.handleSlashCommand(message, requestId);
      if (handled) return;
    }

    // 2. Check for @agent mentions (@researcher, @coder, etc.)
    const agentMention = message.match(/^@(\w+)\s+(.+)/);
    if (agentMention && agentMention[1] in this.agents) {
      // SDK will auto-route based on agent name in prompt
    }

    // 3. Save user message to database
    this.db.addMessage(this.currentConversationId, 'user', message);

    // 4. Build prompt (string or AsyncIterable for images)
    let promptToSend: string | AsyncIterable<SDKUserMessage>;

    if (images && images.length > 0) {
      // For images, create AsyncIterable with multimodal content
      const contentParts = [
        { type: 'text', text: message },
        ...images.map(img => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mime_type,
            data: img.data
          }
        }))
      ];

      promptToSend = (async function* () {
        yield {
          type: 'user',
          message: { role: 'user', content: contentParts },
          parent_tool_use_id: null
        };
      })();
    } else {
      // Text-only: simple string
      promptToSend = message;
    }

    // 5. Create SDK query
    const q = query({
      prompt: promptToSend,
      options: {
        model: this.config.modelId || 'claude-sonnet-4-5-20250929',
        resume: this.currentSessionId,  // Resume previous conversation
        mcpServers: {
          'desktop-assistant-tools': this.mcpServer  // Register tools
        },
        agents: this.agents,  // SDK subagents
        maxTurns: 10
      }
    });

    this.currentQuery = q;  // Store for interrupt support

    // 6. Stream SDK messages and convert to IPC format
    for await (const sdkMessage of q) {
      // Capture session ID from first message
      if (!this.currentSessionId && 'session_id' in sdkMessage) {
        this.currentSessionId = sdkMessage.session_id;
      }

      await this.handleSDKMessage(sdkMessage);
    }

    // 7. Save assistant response to database
    this.db.addMessage(this.currentConversationId, 'assistant', this.currentAssistantMessage);

    this.currentQuery = undefined;  // Clear reference
  }

  /**
   * Interrupt currently running query
   */
  async interrupt(): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.interrupt();
      this.currentQuery = undefined;
    }
  }

  /**
   * Handle individual SDK message
   */
  private async handleSDKMessage(sdkMessage: SDKMessage): Promise<void> {
    switch (sdkMessage.type) {
      case 'assistant':
        // Complete assistant message (non-streaming)
        await this.handleAssistantMessage(sdkMessage);
        break;

      case 'stream_event':
        // Streaming token updates
        await this.handleStreamEvent(sdkMessage);
        break;

      case 'result':
        // Conversation complete
        await this.handleResultMessage(sdkMessage);
        break;

      case 'system':
        // System messages (status, init, compact_boundary)
        this.log('info', `SDK system: ${sdkMessage.subtype}`);
        break;

      case 'tool_progress':
        // Tool execution progress (future UI enhancement)
        this.log('info', `Tool ${sdkMessage.tool_name}: ${sdkMessage.elapsed_time_seconds}s`);
        break;
    }
  }
}
```

### Image Handling (AsyncIterable Pattern)

**Critical Detail:** When images are present, the prompt becomes an `AsyncIterable<SDKUserMessage>` instead of a simple string. This is a key SDK pattern.

**Why AsyncIterable?**
- SDK requires `MessageParam.content` to be an array of `TextBlockParam | ImageBlockParam`
- We wrap this in an async generator that yields a single `SDKUserMessage`
- **Bug Fix (Session 32):** Never call `.length` on `AsyncIterable` (no `.length` property exists)

**Type Guard Pattern:**
```typescript
// SAFE: Check type before accessing properties
if (typeof promptToSend === 'string') {
  console.log('Prompt length:', promptToSend.length);
} else {
  console.log('Prompt type: AsyncIterable (with images)');
}
```

---

## Session Resumption & Conversation Continuity

**SDK Feature:** `resume` option in `query()` maintains conversation history across multiple queries.

**How It Works:**
1. **First Query:** SDK generates a `session_id` and includes it in first message
2. **Subsequent Queries:** Pass `resume: session_id` to continue conversation
3. **Database Sync:** We also store messages in SQLite for persistence

**Benefits:**
- ✅ SDK manages conversation state internally
- ✅ No need to manually build `MessageParam[]` array
- ✅ Tool call history automatically maintained
- ✅ Conversation context preserved across app restarts (via database)

**Implementation:**
```typescript
// Capture session ID from first SDK message
if (!this.currentSessionId && 'session_id' in sdkMessage) {
  this.currentSessionId = sdkMessage.session_id;
  this.log('info', `Session started: ${this.currentSessionId}`);
}

// Resume conversation in next query
const q = query({
  prompt: message,
  options: {
    resume: this.currentSessionId,  // ← Continue conversation
    // ...
  }
});
```

**Database Integration:**
- User/assistant messages stored in SQLite
- On `loadConversation()`, retrieve messages from DB
- Session ID cleared (will rebuild from message history)

---

## MCP Server & Tool Integration

**SDK Requirement:** Tools must be registered as MCP servers, not passed directly.

**Our Approach:**
- Use `createSdkMcpServer()` helper from SDK
- Define tools with `tool()` helper and Zod schemas
- Register server via `mcpServers` option in `query()`

**apps/agent-runtime/src/sdk-tools.ts:**

```typescript
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export function createSDKTools(config: AppConfig) {
  // Define tools with SDK tool() helper
  const read_file = tool(
    'read_file',
    'Read contents of a text file',
    {
      path: z.string().describe('Relative path to file')
    },
    async (args: { path: string }) => {
      const content = await fs.readFile(args.path, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ path: args.path, content }, null, 2)
        }]
      };
    }
  );

  // ... 10 more tools (write_file, list_files, etc.)

  // Create MCP server with all tools
  return createSdkMcpServer({
    name: 'desktop-assistant-tools',
    version: '1.0.0',
    tools: [
      // Filesystem
      list_files, read_file, write_file, search_files,
      // System
      run_shell_command, get_system_info, open_in_default_app,
      // Clipboard
      read_clipboard, write_clipboard,
      // Vision
      capture_screenshot, analyze_image
    ]
  });
}
```

**Tool Categories (11 total):**
| Category | Tools | Description |
|----------|-------|-------------|
| Filesystem | `list_files`, `read_file`, `write_file`, `search_files` | File operations within allowed directory |
| System | `run_shell_command`, `get_system_info`, `open_in_default_app` | System utilities and shell access |
| Clipboard | `read_clipboard`, `write_clipboard` | System clipboard integration |
| Vision | `capture_screenshot`, `analyze_image` | Screenshot capture and image analysis |

**Security:**
- Path validation (no traversal outside `allowedRootDir`)
- Command whitelist for `run_shell_command`
- File size limits (10MB default)
- Timeout on shell commands (10s)

---

## Slash Commands & @Agent Mentions

**Slash Commands** (`/reset`, `/help`, `/session`):
- Handled before passing to SDK
- Built-in commands processed by adapter
- Unknown commands passed through to SDK (e.g., `/ultrathink`)

**@Agent Mentions** (`@researcher`, `@coder`, `@analyst`):
- Invokes SDK subagents
- Format: `@agentname rest of prompt`
- SDK auto-routes to appropriate agent
- Agents loaded from `~/.claude/agents/` directory

**Implementation:**
```typescript
// Check for slash commands
if (message.startsWith('/')) {
  const handled = await this.handleSlashCommand(message, requestId);
  if (handled) return;  // Command processed, done
}

// Check for @mentions
const agentMention = message.match(/^@(\w+)\s+(.+)/);
if (agentMention && agentMention[1] in this.agents) {
  // SDK will auto-route based on agent name
}
```

---

## Error Handling & EPIPE Recovery

**Critical Fixes (Sessions 28-29):**

### EPIPE Errors (Broken Pipe)
**Problem:** Rust stdout reader would silently exit on large payloads, causing Node.js to crash with EPIPE.

**Solution:**
1. **Rust Side (agent_ipc.rs):**
   - Changed from `while let Ok(Some(line))` to explicit `match` with error handling
   - Continue reading on transient errors (don't exit loop)
   - Only exit on true EOF

2. **Node Side (sdk-adapter.ts):**
   - Check `process.stdout.writable` before writing
   - Catch EPIPE errors gracefully
   - Global exception handler for uncaught EPIPE

**Implementation:**
```typescript
private sendResponse(response: AgentResponse): void {
  try {
    if (!process.stdout.writable) {
      this.log('error', 'stdout not writable - pipe may be closed');
      return;
    }

    const success = process.stdout.write(JSON.stringify(response) + '\n');

    if (!success) {
      this.log('warn', 'stdout buffer full - backpressure detected');
    }
  } catch (error) {
    if ((error as any).code === 'EPIPE') {
      this.log('error', 'Broken pipe - parent process closed stdout');
    }
  }
}
```

### Readline Stdout Conflict
**Problem:** Using `output: process.stdout` in readline conflicts with IPC protocol.

**Solution:** Only set `input`, not `output` (logging goes to stderr).

---

## Future Enhancements

### 1. SDK Hooks (Not Yet Implemented)

**Planned Integration Points:**

```typescript
const q = query({
  prompt: message,
  options: {
    hooks: {
      // Permission checks before tool execution
      PreToolUse: [
        {
          hooks: [async (input) => {
            // Check if tool is allowed for current context
            const allowed = await checkPermission(input.tool_name);
            return { continue: allowed };
          }]
        }
      ],

      // Log tool results, index to memory
      PostToolUse: [
        {
          hooks: [async (input) => {
            // Save to vector database for memory
            await indexToolResult(input.tool_name, input.result);

            // Persist to SQLite
            await db.logToolUse(input.tool_name, input.input, input.result);

            return { continue: true };
          }]
        }
      ],

      // Persist conversation on completion
      SessionEnd: [
        {
          hooks: [async (input) => {
            // Save session to database
            await db.saveSession(input.session_id, input.conversation);

            // Index conversation to vector DB
            await indexConversation(input.conversation);

            return { continue: true };
          }]
        }
      ]
    }
  }
});
```

**Use Cases:**
- ✅ Automatic conversation persistence
- ✅ Tool usage analytics
- ✅ Permission system
- ✅ Rate limiting
- ✅ Memory indexing

**Status:** Planned for future implementation (Phase 7 of SDK migration)

---

### 2. Memory System (Future Architecture)

**Goal:** Add long-term memory using vector database for semantic search.

**Planned Architecture:**

```
┌─────────────────────────────────────────────────┐
│           Memory System Architecture            │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌───────────────────────────────────────────┐ │
│  │  Vector Database (LanceDB or Chroma)      │ │
│  │                                            │ │
│  │  - Embeddings: Ollama (nomic-embed-text)  │ │
│  │  - Storage: ~/.claude/memory/             │ │
│  │  - Index: Conversation chunks (512 tokens)│ │
│  │  - Search: Semantic similarity (cosine)   │ │
│  └───────────────────────────────────────────┘ │
│                                                  │
│  ┌───────────────────────────────────────────┐ │
│  │  Memory Manager (NEW)                     │ │
│  │                                            │ │
│  │  async function retrieveMemory(query) {   │ │
│  │    // 1. Generate query embedding         │ │
│  │    const embedding = await embed(query);  │ │
│  │                                            │ │
│  │    // 2. Vector similarity search         │ │
│  │    const results = await vectorDB.search({│ │
│  │      vector: embedding,                   │ │
│  │      limit: 5                             │ │
│  │    });                                    │ │
│  │                                            │ │
│  │    // 3. Augment prompt with context     │ │
│  │    return results.map(r => r.text);      │ │
│  │  }                                        │ │
│  └───────────────────────────────────────────┘ │
│                                                  │
│  ┌───────────────────────────────────────────┐ │
│  │  Integration Point: PostToolUse Hook      │ │
│  │                                            │ │
│  │  PostToolUse: [async (input) => {         │ │
│  │    // Extract meaningful content          │ │
│  │    const content = extractContent(        │ │
│  │      input.tool_name,                     │ │
│  │      input.result                         │ │
│  │    );                                     │ │
│  │                                            │ │
│  │    // Generate embedding                  │ │
│  │    const embedding = await embed(content);│ │
│  │                                            │ │
│  │    // Index to vector DB                  │ │
│  │    await vectorDB.insert({                │ │
│  │      id: generateId(),                    │ │
│  │      text: content,                       │ │
│  │      vector: embedding,                   │ │
│  │      metadata: {                          │ │
│  │        tool: input.tool_name,             │ │
│  │        timestamp: Date.now(),             │ │
│  │        conversation_id: currentConversationId │
│  │      }                                    │ │
│  │    });                                    │ │
│  │                                            │ │
│  │    return { continue: true };             │ │
│  │  }]                                       │ │
│  └───────────────────────────────────────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Tech Stack (Planned):**
- **Vector DB:** LanceDB (file-based, no server) or Chroma
- **Embeddings:** Ollama with `nomic-embed-text` model
- **Chunking:** LangChain or custom (512 token chunks)
- **Storage:** `~/.claude/memory/` directory

**Integration Steps:**
1. Implement SDK `PostToolUse` hook
2. Extract meaningful content from tool results
3. Generate embeddings via Ollama
4. Index to vector database
5. Retrieve relevant memories on new queries
6. Augment prompt with retrieved context

**Status:** Planned, documented in `docs/assistant-upgrades/memory-system.md`

---

### 3. Additional MCP Servers (Future)

**Planned Extensions:**
- **Custom Tool Loader:** Dynamic tool loading from `~/.claude/tools/`
- **ComfyUI Integration:** Image generation workflows
- **Firebase/Firestore:** Cloud data persistence
- **Web Search MCP:** Brave API integration

**Pattern:**
```typescript
const customToolsServer = createSdkMcpServer({
  name: 'custom-tools',
  tools: loadedCustomTools  // From ~/.claude/tools/*.js
});

const q = query({
  prompt: message,
  options: {
    mcpServers: {
      'desktop-assistant-tools': mcpServer,
      'custom-tools': customToolsServer,  // ← Additional MCP server
      'comfyui': comfyuiServer
    }
  }
});
```

---

## Testing

**Unit Tests:**
```typescript
// apps/agent-runtime/src/__tests__/sdk-adapter.test.ts
import { SDKAdapter } from '../sdk-adapter';

describe('SDKAdapter', () => {
  it('should handle text-only messages', async () => {
    const adapter = new SDKAdapter(mockConfig, mockMcpServer);
    await adapter.processUserMessage('Hello', 'req-1');
    // Assert IPC responses
  });

  it('should handle image attachments', async () => {
    const images = [{ data: 'base64...', mime_type: 'image/png' }];
    await adapter.processUserMessage('Analyze this', 'req-2', images);
    // Assert AsyncIterable handling
  });

  it('should interrupt running query', async () => {
    const promise = adapter.processUserMessage('Long task', 'req-3');
    await adapter.interrupt();
    // Assert query interrupted
  });
});
```

**Integration Tests:**
```bash
# Test full SDK integration
node apps/agent-runtime/test-sdk-adapter.js
```

---

## Troubleshooting

**Agent not responding:**
- ✅ Check API key: `ANTHROPIC_API_KEY` in `.env`
- ✅ Verify stdio connection: Look for `ready` message
- ✅ Review stderr logs: `console.error()` output

**Tool execution fails:**
- ✅ Validate tool registered in MCP server
- ✅ Check Zod schema matches input
- ✅ Verify path permissions (filesystem tools)

**EPIPE errors:**
- ✅ Check Rust stdout reader (agent_ipc.rs)
- ✅ Verify Node error handlers in place
- ✅ Review large payload handling

**Image upload crashes:**
- ✅ Ensure AsyncIterable pattern used (not string)
- ✅ Check for `.length` access on AsyncIterable
- ✅ Validate base64 format (no data URL prefix)

**Session not resuming:**
- ✅ Verify session ID captured from first message
- ✅ Check `resume` option passed to `query()`
- ✅ Review database conversation loading

---

## Best Practices

### 1. Always Use SDK Types
```typescript
// ✅ Good: Import from SDK
import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// ❌ Bad: Define custom types
interface MyMessage { ... }
```

### 2. Handle AsyncIterable Properly
```typescript
// ✅ Good: Type guard before accessing properties
if (typeof prompt === 'string') {
  console.log(prompt.length);
}

// ❌ Bad: Assume type
console.log(prompt.length);  // Crashes if AsyncIterable
```

### 3. Register Tools as MCP Server
```typescript
// ✅ Good: Use createSdkMcpServer
const server = createSdkMcpServer({ name: 'tools', tools: [...] });

// ❌ Bad: Pass tools directly (doesn't work)
query({ options: { tools: [...] } });
```

### 4. Use SDK Hooks for Side Effects
```typescript
// ✅ Good: Use PostToolUse hook
PostToolUse: [{ hooks: [async (input) => { await log(input); }] }]

// ❌ Bad: Manual interception
const result = await executeTool(name, input);
await log(result);  // Easy to miss
```

### 5. Leverage Session Resumption
```typescript
// ✅ Good: Let SDK manage history
query({ options: { resume: sessionId } });

// ❌ Bad: Manually build message array
const history = buildHistory(messages);
query({ prompt: history });
```

---

## Next Steps

- Implement tool visualization → [05-web-ui.md](./05-web-ui.md)
- Define IPC protocol → [06-ipc-protocol.md](./06-ipc-protocol.md)
- Configure security → [07-security-config.md](./07-security-config.md)
- **Future:** Add SDK hooks → [08-sdk-implementation.md](./08-sdk-implementation.md)
- **Future:** Memory system → [10-memory-architecture.md](./10-memory-architecture.md)

---

## References

- [Claude Agent SDK Documentation](./claudeagentsdk.md)
- [Tool Layer Architecture](./04-tool-layer.md)
- [Conversation Persistence](./09-conversation-persistence.md)
- [Memory System Design](./assistant-upgrades/memory-system.md)
