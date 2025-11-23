# 03 - Agent Runtime

## Overview

The agent runtime is a long-lived Node.js process that manages the Claude agent instance, maintains conversation state, executes tools, and communicates with the Tauri shell via stdio.

**Key responsibilities:**
- Initialize and manage Claude SDK client
- Maintain conversation history
- Register and execute tools
- Stream responses back to UI
- Handle errors gracefully

## Core Architecture

```
┌─────────────────────────────────────┐
│         Agent Runtime (Node)        │
├─────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────┐ │
│  │ IPC Handler  │  │   Config    │ │
│  │  (stdio)     │  │  Loader     │ │
│  └──────┬───────┘  └─────────────┘ │
│         │                           │
│  ┌──────▼────────────────────────┐ │
│  │   Agent Orchestrator          │ │
│  │  - Conversation state         │ │
│  │  - Message handling           │ │
│  │  - Streaming coordination     │ │
│  └──────┬────────────────────────┘ │
│         │                           │
│  ┌──────▼────────┐  ┌────────────┐ │
│  │ Claude SDK    │  │ Tool Layer │ │
│  │ Client        │  │            │ │
│  └───────────────┘  └────────────┘ │
└─────────────────────────────────────┘
```

## Entry Point

**src/index.ts:**

```typescript
import { createInterface } from 'readline';
import { AgentOrchestrator } from './agent';
import { loadConfig } from './config';
import { setupTools } from './tools';

async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    // Setup tools
    const tools = setupTools(config);

    // Create agent orchestrator
    const orchestrator = new AgentOrchestrator(config, tools);
    await orchestrator.initialize();

    // Setup stdio IPC
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Handle incoming messages
    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line);
        await orchestrator.handleRequest(request);
      } catch (error) {
        const errorResponse = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        };
        console.log(JSON.stringify(errorResponse));
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });

    // Send ready signal
    console.log(JSON.stringify({ type: 'ready', timestamp: Date.now() }));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down...');
  process.exit(0);
});

main();
```

## Configuration

**src/config.ts:**

```typescript
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  // Claude API
  anthropicApiKey: string;
  modelId: string;
  maxTokens: number;

  // Tool configuration
  allowedRootDir: string;
  maxFileSizeMb: number;

  // Optional integrations
  comfyuiApiUrl?: string;
  firebaseProjectId?: string;

  // Runtime settings
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    modelId: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096', 10),

    allowedRootDir: process.env.ALLOWED_ROOT_DIR || path.join(process.env.HOME || '', 'workspace'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),

    comfyuiApiUrl: process.env.COMFYUI_API_URL,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,

    logLevel: (process.env.LOG_LEVEL as any) || 'info',
  };

  // Validate required fields
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  return config;
}
```

## Agent Orchestrator

**src/agent.ts:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig } from './config';
import type { Tool } from './tools';

export interface AgentRequest {
  id: string;
  kind: 'user_message' | 'clear_history';
  message?: string;
  attachments?: Array<{ path: string; mime: string }>;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  type: 'token' | 'tool_use' | 'tool_result' | 'done' | 'error';
  id: string;
  data?: unknown;
  token?: string;
  error?: string;
  timestamp: number;
}

export class AgentOrchestrator {
  private client: Anthropic;
  private config: AppConfig;
  private tools: Tool[];
  private conversationHistory: Anthropic.MessageParam[] = [];

  constructor(config: AppConfig, tools: Tool[]) {
    this.config = config;
    this.tools = tools;
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  async initialize(): Promise<void> {
    // Perform any async initialization
    this.log('info', 'Agent orchestrator initialized');
  }

  async handleRequest(request: AgentRequest): Promise<void> {
    if (request.kind === 'clear_history') {
      this.conversationHistory = [];
      this.sendResponse({
        type: 'done',
        id: request.id,
        timestamp: Date.now(),
      });
      return;
    }

    if (request.kind === 'user_message' && request.message) {
      await this.processUserMessage(request);
    }
  }

  private async processUserMessage(request: AgentRequest): Promise<void> {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: request.message!,
      });

      // Create message with streaming
      const stream = await this.client.messages.create({
        model: this.config.modelId,
        max_tokens: this.config.maxTokens,
        messages: this.conversationHistory,
        tools: this.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
        stream: true,
      });

      let assistantMessage = '';
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      // Process stream
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            // Text block started
          } else if (event.content_block.type === 'tool_use') {
            toolUses.push({
              id: event.content_block.id,
              name: event.content_block.name,
              input: {},
            });

            this.sendResponse({
              type: 'tool_use',
              id: request.id,
              data: {
                toolId: event.content_block.id,
                toolName: event.content_block.name,
              },
              timestamp: Date.now(),
            });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            assistantMessage += event.delta.text;

            this.sendResponse({
              type: 'token',
              id: request.id,
              token: event.delta.text,
              timestamp: Date.now(),
            });
          } else if (event.delta.type === 'input_json_delta') {
            // Accumulate tool input
            const lastToolUse = toolUses[toolUses.length - 1];
            if (lastToolUse) {
              lastToolUse.input = {
                ...lastToolUse.input,
                ...JSON.parse(event.delta.partial_json),
              };
            }
          }
        } else if (event.type === 'message_stop') {
          // Message complete
          break;
        }
      }

      // Execute any tool uses
      if (toolUses.length > 0) {
        await this.executeTools(request.id, toolUses);
      }

      // Add assistant message to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      // Send done signal
      this.sendResponse({
        type: 'done',
        id: request.id,
        timestamp: Date.now(),
      });

    } catch (error) {
      this.sendResponse({
        type: 'error',
        id: request.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async executeTools(
    requestId: string,
    toolUses: Array<{ id: string; name: string; input: any }>
  ): Promise<void> {
    for (const toolUse of toolUses) {
      const tool = this.tools.find(t => t.name === toolUse.name);

      if (!tool) {
        this.sendResponse({
          type: 'error',
          id: requestId,
          error: `Tool not found: ${toolUse.name}`,
          timestamp: Date.now(),
        });
        continue;
      }

      try {
        const result = await tool.execute(toolUse.input);

        this.sendResponse({
          type: 'tool_result',
          id: requestId,
          data: {
            toolId: toolUse.id,
            toolName: toolUse.name,
            result,
          },
          timestamp: Date.now(),
        });

        // Add tool result to conversation
        this.conversationHistory.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            },
          ],
        });

      } catch (error) {
        this.sendResponse({
          type: 'error',
          id: requestId,
          error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        });
      }
    }
  }

  private sendResponse(response: AgentResponse): void {
    console.log(JSON.stringify(response));
  }

  private log(level: string, message: string, data?: unknown): void {
    if (this.config.logLevel === 'debug' || level !== 'debug') {
      console.error(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  }
}
```

## Type Definitions

**src/types.ts:**

```typescript
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: any) => Promise<any>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
```

## Error Handling

Best practices:
1. **Always catch errors** in request handlers
2. **Send error responses** via stdio (don't crash)
3. **Log to stderr** for debugging
4. **Validate inputs** before tool execution
5. **Handle API rate limits** with retries

## Testing

**src/__tests__/agent.test.ts:**

```typescript
import { AgentOrchestrator } from '../agent';
import { loadConfig } from '../config';

describe('AgentOrchestrator', () => {
  it('should initialize without errors', async () => {
    const config = loadConfig();
    const orchestrator = new AgentOrchestrator(config, []);
    await orchestrator.initialize();
  });

  // Add more tests
});
```

## Next Steps

- Implement tool layer → [04-tool-layer.md](./04-tool-layer.md)
- Define IPC protocol → [06-ipc-protocol.md](./06-ipc-protocol.md)
- Connect to UI → [05-web-ui.md](./05-web-ui.md)

## Troubleshooting

**Agent not responding:**
- Check API key is valid
- Verify stdio connection
- Review stderr logs

**Tool execution fails:**
- Validate tool input schemas
- Check tool permissions
- Review error messages in logs
