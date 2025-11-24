import { createInterface } from 'readline';
import { SDKAdapter, type ImageAttachment } from './sdk-adapter.js';
import { loadConfig } from './config.js';
import { createSDKTools } from './sdk-tools.js';

/**
 * Request interface matching the IPC protocol from Tauri shell
 */
interface AgentRequest {
  id: string;
  kind: 'user_message' | 'clear_history' | 'load_conversation' | 'new_conversation' | 'list_conversations' | 'delete_conversation';
  message?: string;
  conversation_id?: string;
  images?: string; // JSON string of image attachments
  attachments?: Array<{ path: string; mime: string }>;
  metadata?: Record<string, unknown>;
}

async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    // Create SDK MCP server with all tools
    const mcpServer = createSDKTools(config);
    console.error('[INFO] SDK MCP server created with 11 tools');

    // Create SDK adapter
    const adapter = new SDKAdapter(config, mcpServer);
    console.error('[INFO] SDK adapter initialized');

    // Setup stdio IPC
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Handle incoming messages
    rl.on('line', async (line: string) => {
      try {
        const request: AgentRequest = JSON.parse(line);

        // Handle different request types
        switch (request.kind) {
          case 'user_message':
            if (request.message) {
              // Parse image attachments if provided
              let images: ImageAttachment[] = [];
              if (request.images) {
                try {
                  images = JSON.parse(request.images);
                } catch (e) {
                  console.error('[ERROR] Failed to parse image attachments:', e);
                }
              }

              // Process message through SDK
              await adapter.processUserMessage(request.message, request.id, images);
            }
            break;

          case 'clear_history':
            // Clear session to reset conversation
            adapter.clearSession();
            console.log(JSON.stringify({
              type: 'done',
              id: request.id,
              timestamp: Date.now()
            }));
            break;

          case 'new_conversation':
            // Create a new conversation
            const newConv = adapter.createConversation();
            console.log(JSON.stringify({
              type: 'done',
              id: request.id,
              data: { conversation: newConv },
              timestamp: Date.now()
            }));
            break;

          case 'load_conversation':
            // Load an existing conversation
            if (request.conversation_id) {
              const conversation = adapter.loadConversation(request.conversation_id);
              if (conversation) {
                console.log(JSON.stringify({
                  type: 'done',
                  id: request.id,
                  data: { conversation },
                  timestamp: Date.now()
                }));
              } else {
                console.log(JSON.stringify({
                  type: 'error',
                  id: request.id,
                  error: 'Conversation not found',
                  timestamp: Date.now()
                }));
              }
            } else {
              console.log(JSON.stringify({
                type: 'error',
                id: request.id,
                error: 'Missing conversation_id',
                timestamp: Date.now()
              }));
            }
            break;

          case 'list_conversations':
            // Get all conversations
            const conversations = adapter.getAllConversations();
            console.log(JSON.stringify({
              type: 'done',
              id: request.id,
              data: { conversations },
              timestamp: Date.now()
            }));
            break;

          case 'delete_conversation':
            // Delete a conversation
            if (request.conversation_id) {
              adapter.deleteConversation(request.conversation_id);
              console.log(JSON.stringify({
                type: 'done',
                id: request.id,
                timestamp: Date.now()
              }));
            } else {
              console.log(JSON.stringify({
                type: 'error',
                id: request.id,
                error: 'Missing conversation_id',
                timestamp: Date.now()
              }));
            }
            break;

          default:
            throw new Error(`Unknown request kind: ${(request as any).kind}`);
        }
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
