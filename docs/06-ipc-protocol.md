# 06 - IPC Protocol

## Overview

The IPC (Inter-Process Communication) protocol defines how the Tauri shell and agent runtime communicate via stdio. Messages are line-delimited JSON objects.

**Transport:** Stdin/Stdout
**Format:** Newline-delimited JSON
**Encoding:** UTF-8

## Message Flow

```
┌─────────────┐              ┌──────────────┐
│ Tauri Shell │              │Agent Runtime │
└──────┬──────┘              └──────┬───────┘
       │                            │
       │ 1. AgentRequest           │
       │ ─────────────────────────>│
       │                            │
       │                            │ 2. Process
       │                            │    & Stream
       │                            │
       │ 3. AgentResponse (stream) │
       │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
       │ 4. AgentResponse (stream) │
       │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
       │ 5. AgentResponse (done)   │
       │<──────────────────────────│
       │                            │
```

## Request Messages (Tauri → Agent)

### User Message Request

Sent when the user submits a message.

```typescript
{
  "id": "req-uuid-123",
  "kind": "user_message",
  "message": "Hello, can you help me?",
  "attachments": [
    {
      "path": "/path/to/file.txt",
      "mime": "text/plain"
    }
  ],
  "metadata": {
    "conversationId": "conv-456",
    "userId": "user-789"
  }
}
```

**Fields:**
- `id` (string, required): Unique request identifier
- `kind` (string, required): Request type (`"user_message"`)
- `message` (string, required): User's message text
- `attachments` (array, optional): File attachments
- `metadata` (object, optional): Additional context

### Clear History Request

Clears the conversation history.

```typescript
{
  "id": "req-uuid-124",
  "kind": "clear_history"
}
```

### Get Status Request

Requests agent status.

```typescript
{
  "id": "req-uuid-125",
  "kind": "get_status"
}
```

## Response Messages (Agent → Tauri)

All responses include:
- `type`: Response type
- `id`: Original request ID
- `timestamp`: Unix timestamp (milliseconds)

### Ready Signal

Sent once when agent runtime starts.

```typescript
{
  "type": "ready",
  "timestamp": 1234567890000
}
```

### Token Response (Streaming)

Sent for each token during response generation.

```typescript
{
  "type": "token",
  "id": "req-uuid-123",
  "token": "Hello",
  "timestamp": 1234567890001
}
```

**Fields:**
- `token` (string): The text token

### Tool Use Response

Sent when the agent decides to use a tool.

```typescript
{
  "type": "tool_use",
  "id": "req-uuid-123",
  "data": {
    "toolId": "tool-call-abc",
    "toolName": "list_files",
    "input": {
      "path": "src"
    }
  },
  "timestamp": 1234567890002
}
```

**Fields:**
- `data.toolId` (string): Unique tool invocation ID
- `data.toolName` (string): Name of the tool being called
- `data.input` (object): Tool input parameters

### Tool Result Response

Sent when a tool execution completes.

```typescript
{
  "type": "tool_result",
  "id": "req-uuid-123",
  "data": {
    "toolId": "tool-call-abc",
    "toolName": "list_files",
    "result": {
      "files": ["index.ts", "app.tsx"]
    }
  },
  "timestamp": 1234567890003
}
```

**Fields:**
- `data.toolId` (string): Matches the tool_use toolId
- `data.toolName` (string): Tool name
- `data.result` (any): Tool execution result

### Done Response

Sent when request processing is complete.

```typescript
{
  "type": "done",
  "id": "req-uuid-123",
  "timestamp": 1234567890004
}
```

### Error Response

Sent when an error occurs.

```typescript
{
  "type": "error",
  "id": "req-uuid-123",
  "error": "Failed to process request: API rate limit exceeded",
  "timestamp": 1234567890005
}
```

**Fields:**
- `error` (string): Human-readable error message

### Status Response

Response to get_status request.

```typescript
{
  "type": "status",
  "id": "req-uuid-125",
  "data": {
    "state": "idle",
    "conversationLength": 10,
    "uptime": 3600000
  },
  "timestamp": 1234567890006
}
```

## Protocol Rules

### 1. Message Framing

- Each message is a single line
- Terminated with `\n`
- No newlines within JSON payload
- UTF-8 encoding

**Example:**

```
{"id":"req-1","kind":"user_message","message":"Hello"}\n
{"type":"token","id":"req-1","token":"Hi","timestamp":123}\n
{"type":"done","id":"req-1","timestamp":124}\n
```

### 2. Request-Response Correlation

- Every response includes the original request `id`
- Responses may arrive out of order (use `id` to correlate)
- A single request may produce multiple responses (streaming)

### 3. Streaming Behavior

For a user message:
1. Multiple `token` responses (streaming text)
2. Zero or more `tool_use` responses
3. Zero or more `tool_result` responses
4. One `done` response (success) OR one `error` response (failure)

### 4. Error Handling

- Malformed JSON → log error, continue listening
- Unknown request type → send error response
- Tool execution failure → send error response, don't crash

### 5. Timeouts

- Tauri should timeout requests after ~60 seconds
- Agent should handle graceful shutdown (SIGTERM)

## Implementation Examples

### Sending from Tauri (Rust)

```rust
use serde_json::json;
use tokio::io::AsyncWriteExt;

async fn send_request(stdin: &mut ChildStdin, message: &str) -> Result<()> {
    let request = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "kind": "user_message",
        "message": message,
    });

    let json_str = serde_json::to_string(&request)?;
    stdin.write_all(json_str.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await?;

    Ok(())
}
```

### Receiving in Agent (Node)

```typescript
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line: string) => {
  try {
    const request = JSON.parse(line);
    await handleRequest(request);
  } catch (error) {
    console.error('Failed to parse request:', error);
    // Don't crash - continue listening
  }
});
```

### Sending from Agent (Node)

```typescript
function sendResponse(response: AgentResponse): void {
  const json = JSON.stringify(response);
  console.log(json); // stdout
}

// Example usage
sendResponse({
  type: 'token',
  id: 'req-123',
  token: 'Hello',
  timestamp: Date.now(),
});
```

### Receiving in Tauri (Rust)

```rust
use tokio::io::{BufReader, AsyncBufReadExt};

async fn read_responses(stdout: ChildStdout, app_handle: AppHandle) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        match serde_json::from_str::<AgentResponse>(&line) {
            Ok(response) => {
                // Emit to frontend
                app_handle.emit_all("agent_stream", response).ok();
            }
            Err(e) => {
                eprintln!("Failed to parse response: {}", e);
            }
        }
    }
}
```

## Protocol Versioning

Include version in initial handshake for future compatibility:

```typescript
// Agent runtime sends on startup
{
  "type": "ready",
  "version": "1.0.0",
  "capabilities": ["streaming", "tools", "attachments"],
  "timestamp": 1234567890000
}
```

## Testing the Protocol

### Manual Testing with Stdio

**Test agent runtime:**

```bash
# Start agent runtime
cd apps/agent-runtime
pnpm dev

# Send test message (paste and press enter)
{"id":"test-1","kind":"user_message","message":"Hello"}

# Observe streaming responses
```

### Automated Testing

```typescript
// Mock stdio for testing
import { Readable, Writable } from 'stream';

class MockStdin extends Readable {
  send(data: object) {
    this.push(JSON.stringify(data) + '\n');
  }
}

class MockStdout extends Writable {
  responses: any[] = [];

  _write(chunk: any, encoding: string, callback: Function) {
    this.responses.push(JSON.parse(chunk.toString()));
    callback();
  }
}
```

## Debug Logging

Enable protocol-level logging:

**Agent side (stderr):**

```typescript
function sendResponse(response: AgentResponse): void {
  console.error('[SEND]', response.type, response.id);
  console.log(JSON.stringify(response));
}
```

**Tauri side:**

```rust
eprintln!("[RECV] {:?}", response);
```

## Common Issues

**Messages not arriving:**
- Check for newline termination
- Verify UTF-8 encoding
- Ensure no buffering issues (flush after write)

**Response correlation failures:**
- Verify `id` field matches request
- Check for duplicate IDs

**Parse errors:**
- Validate JSON format
- Check for embedded newlines in strings
- Verify field types match schema

## Next Steps

- Implement security measures → [07-security-config.md](./07-security-config.md)
- Build the full system → [01-project-setup.md](./01-project-setup.md)

## Reference

Full TypeScript type definitions:

```typescript
// Request types
export type AgentRequest =
  | UserMessageRequest
  | ClearHistoryRequest
  | GetStatusRequest;

export interface UserMessageRequest {
  id: string;
  kind: 'user_message';
  message: string;
  attachments?: Array<{ path: string; mime: string }>;
  metadata?: Record<string, unknown>;
}

export interface ClearHistoryRequest {
  id: string;
  kind: 'clear_history';
}

export interface GetStatusRequest {
  id: string;
  kind: 'get_status';
}

// Response types
export type AgentResponse =
  | ReadyResponse
  | TokenResponse
  | ToolUseResponse
  | ToolResultResponse
  | DoneResponse
  | ErrorResponse
  | StatusResponse;

export interface ReadyResponse {
  type: 'ready';
  timestamp: number;
  version?: string;
  capabilities?: string[];
}

export interface TokenResponse {
  type: 'token';
  id: string;
  token: string;
  timestamp: number;
}

export interface ToolUseResponse {
  type: 'tool_use';
  id: string;
  data: {
    toolId: string;
    toolName: string;
    input: any;
  };
  timestamp: number;
}

export interface ToolResultResponse {
  type: 'tool_result';
  id: string;
  data: {
    toolId: string;
    toolName: string;
    result: any;
  };
  timestamp: number;
}

export interface DoneResponse {
  type: 'done';
  id: string;
  timestamp: number;
}

export interface ErrorResponse {
  type: 'error';
  id: string;
  error: string;
  timestamp: number;
}

export interface StatusResponse {
  type: 'status';
  id: string;
  data: {
    state: string;
    conversationLength: number;
    uptime: number;
  };
  timestamp: number;
}
```
