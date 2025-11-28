import { createInterface } from 'readline';
import { SDKAdapter, type ImageAttachment } from './sdk-adapter.js';
import { loadConfig } from './config.js';
import { createSDKTools } from './sdk-tools.js';

/**
 * Request interface matching the IPC protocol from Tauri shell
 */
interface AgentRequest {
  id: string;
  kind: 'user_message' | 'clear_history' | 'load_conversation' | 'new_conversation' | 'list_conversations' | 'delete_conversation' | 'interrupt';
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
    // IMPORTANT: Do NOT set output to process.stdout - it conflicts with our IPC protocol
    // which uses console.log() to write JSON responses to stdout.
    // Readline only needs stdin for reading incoming requests.
    const rl = createInterface({
      input: process.stdin,
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
                  console.log(`[RUNTIME] Received ${images.length} image(s) from frontend`);

                  images.forEach((img, i) => {
                    // Calculate decoded size (base64 is ~33% larger than binary)
                    const base64Length = img.data?.length || 0;
                    const decodedSizeBytes = (base64Length * 3) / 4;
                    const decodedSizeMB = decodedSizeBytes / 1024 / 1024;

                    console.log(`[RUNTIME] ===== Image ${i + 1} Analysis =====`);
                    console.log(`[RUNTIME]   Name: ${img.name}`);
                    console.log(`[RUNTIME]   MIME Type: ${img.mime_type}`);
                    console.log(`[RUNTIME]   Base64 length: ${base64Length.toLocaleString()} chars`);
                    console.log(`[RUNTIME]   Decoded size: ${decodedSizeMB.toFixed(2)} MB`);
                    console.log(`[RUNTIME]   Has data prefix: ${img.data?.startsWith('data:')}`);
                    console.log(`[RUNTIME]   First 30 chars: ${img.data?.substring(0, 30)}...`);
                    console.log(`[RUNTIME]   Last 30 chars: ...${img.data?.substring(base64Length - 30)}`);

                    // Claude API has 5MB limit per image
                    if (decodedSizeMB > 5) {
                      console.warn(`[RUNTIME] ⚠️  WARNING: Image ${i + 1} exceeds Claude API 5MB limit (${decodedSizeMB.toFixed(2)} MB)`);
                    }

                    // Validate base64 format
                    if (img.data?.startsWith('data:')) {
                      console.error(`[RUNTIME] ❌ ERROR: Image ${i + 1} has data URL prefix - should be raw base64!`);
                    }
                  });

                  console.log(`[RUNTIME] ===== End Image Analysis =====`);
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
            // Load an existing conversation with its messages
            if (request.conversation_id) {
              const result = adapter.loadConversation(request.conversation_id);
              if (result) {
                console.log(JSON.stringify({
                  type: 'done',
                  id: request.id,
                  data: {
                    conversation: result.conversation,
                    messages: result.messages
                  },
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

          case 'interrupt':
            // Interrupt the currently running query
            await adapter.interrupt();
            console.log(JSON.stringify({
              type: 'done',
              id: request.id,
              timestamp: Date.now()
            }));
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

// Handle EPIPE errors gracefully (broken pipe when parent process closes)
process.on('uncaughtException', (error) => {
  if ((error as any).code === 'EPIPE') {
    console.error('EPIPE error caught - parent process likely closed the pipe');
    process.exit(0);
  } else {
    console.error('Uncaught exception:', error);
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
  console.error('Promise:', promise);
  // Don't exit on unhandled rejections, just log them
});

main();
