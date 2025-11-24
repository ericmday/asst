import { query, type SDKMessage, type SDKAssistantMessage, type SDKPartialAssistantMessage, type SDKResultMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig } from './config.js';
import type { Tool } from './tools/index.js';

/**
 * IPC Response types that match the protocol expected by Tauri shell
 */
export interface AgentResponse {
  type: 'token' | 'tool_use' | 'tool_result' | 'done' | 'error';
  id: string;
  data?: unknown;
  token?: string;
  error?: string;
  timestamp: number;
}

export interface ImageAttachment {
  data: string; // base64
  mime_type: string;
  name?: string;
}

/**
 * SDKAdapter bridges the Claude Agent SDK with our stdio IPC protocol.
 *
 * Responsibilities:
 * - Wraps SDK query() AsyncGenerator for stdio compatibility
 * - Converts SDKMessage types to IPC AgentResponse format
 * - Simulates streaming word-by-word for better UX
 * - Maintains compatibility with existing Tauri shell and React UI
 */
export class SDKAdapter {
  private config: AppConfig;
  private tools: Tool[];
  private currentRequestId: string = '';

  constructor(config: AppConfig, tools: Tool[]) {
    this.config = config;
    this.tools = tools;
  }

  /**
   * Process a user message through the SDK and emit IPC responses
   *
   * @param message - User's text message
   * @param requestId - Unique request ID for this interaction
   * @param images - Optional image attachments
   */
  async processUserMessage(
    message: string,
    requestId: string,
    images?: ImageAttachment[]
  ): Promise<void> {
    this.currentRequestId = requestId;

    try {
      // Build prompt with text and images
      let prompt = message;

      // TODO: Handle image attachments when SDK supports them
      // For now, images will be handled separately through vision tools

      // Create SDK query with configuration
      const q = query({
        prompt,
        options: {
          model: this.config.modelId || 'claude-sonnet-4-5-20250929',
          // tools: this.convertToolsToSDKFormat(), // Phase 3: Tool conversion
          // maxTurns: 10, // Limit agentic loop iterations
        }
      });

      // Stream SDK messages and convert to IPC format
      for await (const sdkMessage of q) {
        await this.handleSDKMessage(sdkMessage);
      }

    } catch (error) {
      this.sendError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle individual SDK message and convert to IPC format
   */
  private async handleSDKMessage(sdkMessage: SDKMessage): Promise<void> {
    switch (sdkMessage.type) {
      case 'assistant':
        await this.handleAssistantMessage(sdkMessage);
        break;

      case 'stream_event':
        await this.handleStreamEvent(sdkMessage);
        break;

      case 'result':
        await this.handleResultMessage(sdkMessage);
        break;

      case 'user':
        // SDK echoes user messages back - we can ignore these
        // since the UI already displays user input
        break;

      case 'system':
        // System messages (init, compact_boundary, status) can be logged but not sent to UI
        if (sdkMessage.subtype === 'status') {
          this.log('info', `SDK status: ${sdkMessage.status}`);
        } else {
          this.log('info', `SDK system message: ${sdkMessage.subtype}`);
        }
        break;

      case 'tool_progress':
        // Tool progress updates - could be used for UI feedback in future
        this.log('info', `Tool progress: ${sdkMessage.tool_name} - ${sdkMessage.elapsed_time_seconds}s`);
        break;

      default:
        this.log('warn', `Unknown SDK message type: ${(sdkMessage as any).type}`);
    }
  }

  /**
   * Handle complete assistant message (non-streaming mode)
   */
  private async handleAssistantMessage(message: SDKAssistantMessage): Promise<void> {
    if (message.error) {
      this.sendError(`Assistant error: ${message.error}`);
      return;
    }

    // Extract text content from the API message
    const apiMessage = message.message;
    let textContent = '';

    for (const block of apiMessage.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        // Emit tool use event
        this.sendResponse({
          type: 'tool_use',
          id: this.currentRequestId,
          data: {
            tool_use_id: block.id,
            tool_name: block.name,
            tool_input: block.input,
          },
          timestamp: Date.now(),
        });
      }
    }

    // Simulate streaming for text content
    if (textContent) {
      await this.emitTextChunked(textContent);
    }
  }

  /**
   * Handle streaming events (when SDK provides token-by-token updates)
   */
  private async handleStreamEvent(message: SDKPartialAssistantMessage): Promise<void> {
    const event = message.event;

    // Handle different stream event types
    if (event.type === 'content_block_start') {
      // New content block starting
      if (event.content_block?.type === 'tool_use') {
        this.sendResponse({
          type: 'tool_use',
          id: this.currentRequestId,
          data: {
            tool_use_id: event.content_block.id,
            tool_name: event.content_block.name,
            tool_input: {}, // Will be populated by deltas
          },
          timestamp: Date.now(),
        });
      }
    } else if (event.type === 'content_block_delta') {
      // Token or tool input update
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        // Send text token directly (already streaming from SDK)
        this.sendResponse({
          type: 'token',
          id: this.currentRequestId,
          token: event.delta.text,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Handle result message (conversation complete)
   */
  private async handleResultMessage(message: SDKResultMessage): Promise<void> {
    if (message.is_error) {
      const errorMsg = 'errors' in message ? message.errors.join(', ') : 'Unknown error';
      this.sendError(errorMsg);
      return;
    }

    // Send done message with usage stats
    this.sendResponse({
      type: 'done',
      id: this.currentRequestId,
      data: {
        num_turns: message.num_turns,
        total_cost_usd: message.total_cost_usd,
        usage: message.usage,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate streaming by emitting text in chunks with small delays.
   * This provides better UX while preserving the non-streaming API benefits.
   *
   * @param text - Full text to emit
   */
  private async emitTextChunked(text: string): Promise<void> {
    // Split text into words while preserving whitespace
    const words = text.split(/(\s+)/);

    for (const word of words) {
      if (word.length > 0) {
        this.sendResponse({
          type: 'token',
          id: this.currentRequestId,
          token: word,
          timestamp: Date.now(),
        });

        // Small delay between chunks (20ms = ~50 words/sec)
        // Only delay on non-whitespace to maintain natural rhythm
        if (word.trim().length > 0) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
    }
  }

  /**
   * Send an IPC response to the Tauri shell via stdout
   */
  private sendResponse(response: AgentResponse): void {
    console.log(JSON.stringify(response));
  }

  /**
   * Send an error response
   */
  private sendError(error: string): void {
    this.sendResponse({
      type: 'error',
      id: this.currentRequestId,
      error,
      timestamp: Date.now(),
    });
  }

  /**
   * Log message to stderr (won't interfere with IPC protocol on stdout)
   */
  private log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
    console.error(`[${level.toUpperCase()}]`, ...args);
  }
}
