import { query, type SDKMessage, type SDKAssistantMessage, type SDKPartialAssistantMessage, type SDKResultMessage, type SDKUserMessage, type McpSdkServerConfigWithInstance, type Query, type AgentDefinition, type PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig } from './config.js';
import { ConversationDatabase, type Conversation, type Message } from './persistence/database.js';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { loadAgentDefinitions, getAgentMetadata, type AgentConfig } from './agents/loader.js';

/**
 * IPC Response types that match the protocol expected by Tauri shell
 */
export interface AgentResponse {
  type: 'token' | 'tool_use' | 'tool_result' | 'tool_progress' | 'done' | 'error';
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
 * - Maintains conversation history via session resumption
 * - Supports slash commands for special operations
 * - Maintains compatibility with existing Tauri shell and React UI
 */
export class SDKAdapter {
  private config: AppConfig;
  private mcpServer: McpSdkServerConfigWithInstance;
  private currentRequestId: string = '';
  private currentAssistantMessageId: string = '';  // Unique ID for assistant's response
  private currentSessionId?: string;  // SDK session for conversation continuity
  private currentConversationId?: string;  // Database conversation ID
  private db: ConversationDatabase;
  private currentAssistantMessage: string = '';  // Accumulate assistant response
  private anthropic: Anthropic;  // Direct API client for title generation
  private currentQuery?: Query;  // Reference to running query for interrupt support
  private agents: Record<string, AgentDefinition> = {};  // SDK subagents
  private pendingPermissions: Map<string, { resolve: (result: PermissionResult) => void; reject: (error: Error) => void }> = new Map();  // Track pending permission requests

  constructor(config: AppConfig, mcpServer: McpSdkServerConfigWithInstance) {
    this.config = config;
    this.mcpServer = mcpServer;
    this.db = new ConversationDatabase();
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

    // Load agents asynchronously
    this.initializeAgents();
  }

  /**
   * Initialize agents from loader
   */
  private async initializeAgents(): Promise<void> {
    try {
      this.agents = await loadAgentDefinitions();
      this.log('info', `Initialized ${Object.keys(this.agents).length} agents`);
    } catch (error) {
      this.log('error', 'Failed to initialize agents:', error);
      this.agents = {};  // Fallback to no agents
    }
  }

  /**
   * Create a new conversation
   */
  createConversation(title: string = 'New Chat'): Conversation {
    const id = randomUUID();
    const conversation = this.db.createConversation(id, title);
    this.currentConversationId = id;
    this.currentSessionId = undefined;  // Clear SDK session
    this.log('info', `Created new conversation: ${id}`);
    return conversation;
  }

  /**
   * Load an existing conversation with its messages
   */
  loadConversation(conversationId: string): { conversation: Conversation; messages: Message[] } | null {
    const conversation = this.db.getConversation(conversationId);
    if (conversation) {
      const messages = this.db.getMessages(conversationId);
      this.currentConversationId = conversationId;
      this.currentSessionId = undefined;  // Clear SDK session - will be rebuilt from history
      this.log('info', `Loaded conversation: ${conversationId} with ${messages.length} messages`);
      return { conversation, messages };
    }
    return null;
  }

  /**
   * Get all conversations
   */
  getAllConversations(): Conversation[] {
    return this.db.getAllConversations();
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): void {
    this.db.deleteConversation(conversationId);
    if (this.currentConversationId === conversationId) {
      this.currentConversationId = undefined;
      this.currentSessionId = undefined;
    }
    this.log('info', `Deleted conversation: ${conversationId}`);
  }

  /**
   * Clear the current session (reset conversation)
   */
  clearSession(): void {
    this.currentSessionId = undefined;
    this.currentConversationId = undefined;
    this.log('info', 'Session cleared - starting fresh conversation');
  }

  /**
   * Handle permission requests from SDK (canUseTool callback)
   */
  private async canUseToolCallback(
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      suggestions?: any[];
      blockedPath?: string;
      decisionReason?: string;
      toolUseID: string;
      agentID?: string;
    }
  ): Promise<PermissionResult> {
    this.log('info', `Permission requested: ${toolName} - AUTO-ALLOWING`);

    // TODO: Replace this with proper permission dialog
    // For now, automatically allow all tool permissions
    return Promise.resolve({
      behavior: 'allow',
      updatedInput: input
    });
  }

  /**
   * Handle permission response from user (via IPC)
   */
  handlePermissionResponse(permissionId: string, allowed: boolean, message?: string): void {
    const pending = this.pendingPermissions.get(permissionId);
    if (!pending) {
      this.log('warn', `No pending permission found for ID: ${permissionId}`);
      return;
    }

    this.pendingPermissions.delete(permissionId);

    if (allowed) {
      pending.resolve({
        behavior: 'allow',
        updatedInput: {}  // Could be extended to allow input modification
      });
      this.log('info', `Permission ${permissionId} granted`);
    } else {
      pending.resolve({
        behavior: 'deny',
        message: message || 'User denied permission',
        interrupt: true
      });
      this.log('info', `Permission ${permissionId} denied`);
    }
  }

  /**
   * Interrupt the currently running query
   * This allows the user to stop Claude mid-execution
   */
  async interrupt(): Promise<void> {
    if (this.currentQuery) {
      this.log('info', 'Interrupting current query...');
      await this.currentQuery.interrupt();
      this.currentQuery = undefined;
      this.log('info', 'Query interrupted successfully');
    } else {
      this.log('warn', 'No active query to interrupt');
    }
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
    this.currentAssistantMessageId = randomUUID();  // Generate unique ID for assistant's response
    this.currentAssistantMessage = '';  // Reset assistant message accumulator

    try {
      // Check for slash commands
      if (message.trim().startsWith('/')) {
        const handled = await this.handleSlashCommand(message.trim(), requestId);
        if (handled) return;
        // If not handled, continue processing as normal message
      }

      // Check for @mention syntax to invoke specific agents
      // Format: @agentname rest of the prompt
      const agentMention = message.trim().match(/^@(\w+)\s+(.+)/);
      if (agentMention) {
        const [, agentName, agentPrompt] = agentMention;

        if (agentName in this.agents) {
          this.log('info', `Agent mention detected: @${agentName}`);
          // SDK will auto-route to the mentioned agent based on the prompt
          // We could add agent name as prefix or metadata but SDK handles it
        } else {
          // Invalid agent name - inform user
          this.sendResponse({
            type: 'token',
            id: requestId,
            token: `Unknown agent '@${agentName}'. Available agents: ${Object.keys(this.agents).join(', ')}`,
            timestamp: Date.now()
          });
          this.sendResponse({
            type: 'done',
            id: requestId,
            timestamp: Date.now()
          });
          return;
        }
      }

      // Ensure we have a conversation
      if (!this.currentConversationId) {
        this.createConversation();
      }

      // Save user message to database (with requestId as the message ID)
      if (this.currentConversationId) {
        this.db.addMessage(this.currentConversationId, 'user', message, requestId);
      }

      // Build prompt with text and images
      // The SDK query() accepts: string | AsyncIterable<SDKUserMessage>
      // SDKUserMessage contains an APIUserMessage (MessageParam from Anthropic SDK)
      // MessageParam.content can be: string | Array<TextBlockParam | ImageBlockParam>

      let promptToSend: string | AsyncIterable<SDKUserMessage>;

      // If we have images, we need to build a proper content array
      if (images && images.length > 0) {
        console.log(`[SDK-ADAPTER] Processing ${images.length} image(s) for SDK`);

        // Build content array with text and images using proper Anthropic API types
        const contentParts: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> = [];

        // Add text content first
        if (message.trim()) {
          contentParts.push({
            type: 'text',
            text: message
          });
          console.log('[SDK-ADAPTER] Added text content to content array');
        }

        // Add image content blocks
        for (const img of images) {
          console.log(`[SDK-ADAPTER] Image: ${img.mime_type}, Base64 length: ${img.data?.length || 0}`);
          contentParts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: img.data
            }
          });
        }

        console.log(`[SDK-ADAPTER] Created content array with ${contentParts.length} parts`);
        this.log('info', `Sending ${images.length} image(s) to Claude`);

        // Create an async iterable that yields a single SDKUserMessage
        // This wraps the content array in the proper SDK message format
        promptToSend = (async function* () {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: contentParts
            },
            parent_tool_use_id: null
          } as SDKUserMessage;
        })();

        console.log('[SDK-ADAPTER] Created AsyncIterable<SDKUserMessage> with multimodal content');
      } else {
        // For text-only messages, pass as simple string
        promptToSend = message;
        console.log('[SDK-ADAPTER] Using simple string prompt (text-only)');
      }

      // Create SDK query - wrap in try-catch for better error handling
      let q: Query;
      try {
        console.log('[SDK-ADAPTER] Creating SDK query...');
        // Only log length for string prompts, not AsyncIterables
        if (typeof promptToSend === 'string') {
          console.log('[SDK-ADAPTER] Prompt length:', promptToSend.length);
        } else {
          console.log('[SDK-ADAPTER] Prompt type: AsyncIterable (with images)');
        }
        console.log('[SDK-ADAPTER] Image count:', images?.length || 0);

        q = query({
          prompt: promptToSend,
          options: {
            model: this.config.modelId || 'claude-sonnet-4-5',
            resume: this.currentSessionId,  // Resume previous conversation if available
            mcpServers: {
              'desktop-assistant-tools': this.mcpServer  // Register MCP server with tools
            },
            maxTurns: 10, // Limit agentic loop iterations
            agents: this.agents,  // Register SDK subagents
            canUseTool: this.canUseToolCallback.bind(this)  // Handle permission requests
          }
        });
        console.log('[SDK-ADAPTER] ✅ SDK query created successfully');
      } catch (error) {
        this.log('error', 'Failed to create SDK query:', error);
        throw new Error(`SDK query creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Store reference to current query for interrupt support
      this.currentQuery = q;

      // Stream SDK messages and convert to IPC format
      // Wrap in try-catch to catch any streaming errors
      try {
        console.log('[SDK-ADAPTER] Starting SDK message stream...');
        let messageCount = 0;
        let lastMessageTime = Date.now();

        // Set up timeout monitor (log every 5 seconds if no messages received)
        const timeoutMonitor = setInterval(() => {
          const timeSinceLastMessage = (Date.now() - lastMessageTime) / 1000;
          if (timeSinceLastMessage > 5) {
            console.warn(`[SDK-ADAPTER] ⚠️  No SDK messages received for ${timeSinceLastMessage.toFixed(1)}s (received ${messageCount} messages so far)`);
          }
        }, 5000);

        for await (const sdkMessage of q) {
          messageCount++;
          lastMessageTime = Date.now();
          console.log(`[SDK-ADAPTER] Received SDK message #${messageCount}:`, sdkMessage.type || 'unknown type');

          // Capture session ID from first message for conversation continuity
          if (!this.currentSessionId && 'session_id' in sdkMessage) {
            this.currentSessionId = sdkMessage.session_id;
            this.log('info', `Session started: ${this.currentSessionId}`);
          }

          await this.handleSDKMessage(sdkMessage);
        }

        clearInterval(timeoutMonitor);
        console.log(`[SDK-ADAPTER] ✅ SDK stream complete. Received ${messageCount} messages total.`);
      } catch (streamError) {
        this.log('error', 'SDK streaming error:', streamError);
        // Clear query reference
        this.currentQuery = undefined;
        throw new Error(`SDK streaming failed: ${streamError instanceof Error ? streamError.message : 'Unknown streaming error'}`);
      }

      // Save assistant's complete response to database (with currentAssistantMessageId)
      if (this.currentConversationId && this.currentAssistantMessage) {
        this.db.addMessage(this.currentConversationId, 'assistant', this.currentAssistantMessage, this.currentAssistantMessageId);

        // Auto-generate title from first user message if still "New Chat"
        const conversation = this.db.getConversation(this.currentConversationId);
        if (conversation && conversation.title === 'New Chat') {
          // First set a quick fallback title
          const fallbackTitle = this.generateTitle(message);
          this.db.updateConversationTitle(this.currentConversationId, fallbackTitle);

          // Then generate a better title with Claude in the background
          // Fire-and-forget - don't await to avoid blocking the response
          this.generateDynamicTitle(message, this.currentAssistantMessage).catch(err => {
            this.log('error', 'Background title generation failed:', err);
          });
        }
      }

      // Clear query reference when streaming completes
      this.currentQuery = undefined;

    } catch (error) {
      // Clear query reference on error
      this.currentQuery = undefined;
      this.sendError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle slash commands like /reset, /help, /ultrathink, etc.
   *
   * @returns true if the command was handled, false to continue normal processing
   */
  private async handleSlashCommand(message: string, requestId: string): Promise<boolean> {
    const parts = message.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case '/reset':
      case '/clear':
        this.clearSession();
        this.sendResponse({
          type: 'token',
          id: requestId,
          token: '✅ Conversation reset. Starting fresh!',
          timestamp: Date.now(),
        });
        this.sendResponse({
          type: 'done',
          id: requestId,
          timestamp: Date.now(),
        });
        return true;

      case '/help':
        const helpText = `
**Available Commands:**

• \`/reset\` or \`/clear\` - Reset conversation and start fresh
• \`/help\` - Show this help message
• \`/session\` - Show current session info
• \`/ultrathink\` - Enable extended thinking mode (pass to SDK)

**Tip:** Regular slash commands like \`/ultrathink\` are passed directly to the Claude SDK.
        `.trim();

        this.sendResponse({
          type: 'token',
          id: requestId,
          token: helpText,
          timestamp: Date.now(),
        });
        this.sendResponse({
          type: 'done',
          id: requestId,
          timestamp: Date.now(),
        });
        return true;

      case '/session':
        const sessionInfo = this.currentSessionId
          ? `📋 **Current Session:** \`${this.currentSessionId}\`\n\nConversation history is being maintained.`
          : `📋 **No Active Session**\n\nNext message will start a new conversation.`;

        this.sendResponse({
          type: 'token',
          id: requestId,
          token: sessionInfo,
          timestamp: Date.now(),
        });
        this.sendResponse({
          type: 'done',
          id: requestId,
          timestamp: Date.now(),
        });
        return true;

      default:
        // Unknown slash command - pass through to SDK
        // Commands like /ultrathink will be handled by the SDK
        this.log('info', `Passing slash command to SDK: ${command}`);
        return false;
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
        // Forward tool progress to UI for real-time feedback
        this.sendResponse({
          type: 'tool_progress',
          id: this.currentAssistantMessageId,  // Use assistant message ID for proper association
          data: {
            tool_use_id: sdkMessage.tool_use_id || sdkMessage.tool_name,
            tool_name: sdkMessage.tool_name,
            elapsed_time_seconds: sdkMessage.elapsed_time_seconds
          },
          timestamp: Date.now()
        });
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
    console.log('[SDK-ADAPTER] handleAssistantMessage called');

    if (message.error) {
      console.error('[SDK-ADAPTER] Assistant error:', message.error);
      this.sendError(`Assistant error: ${message.error}`);
      return;
    }

    // Extract text content from the API message
    const apiMessage = message.message;
    console.log('[SDK-ADAPTER] API message content blocks:', apiMessage.content.length);
    let textContent = '';
    const toolsUsed: Array<{ id: string; name: string }> = [];

    for (const block of apiMessage.content) {
      console.log('[SDK-ADAPTER] Processing content block:', block.type);
      if (block.type === 'text') {
        textContent += block.text;
        console.log('[SDK-ADAPTER] Added text block, total length:', textContent.length);
      } else if (block.type === 'tool_use') {
        console.log('[SDK-ADAPTER] Emitting tool use:', block.name);
        // Track this tool for later result emission
        toolsUsed.push({ id: block.id, name: block.name });

        // Emit tool use event
        this.sendResponse({
          type: 'tool_use',
          id: this.currentAssistantMessageId,  // Use assistant message ID for proper association
          data: {
            tool_use_id: block.id,
            tool_name: block.name,
            tool_input: block.input,
          },
          timestamp: Date.now(),
        });
      }
    }

    // Emit tool_progress and tool_result events for all tools that were executed
    // The SDK has already executed these tools internally via MCP,
    // so we simulate sequential execution with progress updates for better UX
    for (const tool of toolsUsed) {
      console.log('[SDK-ADAPTER] Simulating tool execution for:', tool.name);

      // Emit progress events every 1 second to show tool is "running"
      // This gives the UI time to display elapsed time and tool descriptions
      const progressUpdates = 4; // Show progress for 4 seconds
      for (let elapsed = 1; elapsed <= progressUpdates; elapsed++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

        this.sendResponse({
          type: 'tool_progress',
          id: this.currentAssistantMessageId,
          data: {
            tool_use_id: tool.id,
            tool_name: tool.name,
            elapsed_time_seconds: elapsed,
          },
          timestamp: Date.now(),
        });
      }

      // Finally emit tool_result after progress completes
      console.log('[SDK-ADAPTER] Emitting tool_result for:', tool.name);
      this.sendResponse({
        type: 'tool_result',
        id: this.currentAssistantMessageId,
        data: {
          tool_use_id: tool.id,
          tool_name: tool.name,
          result: 'completed', // The actual result is handled internally by SDK
        },
        timestamp: Date.now(),
      });

      // Add a small delay between tools
      if (toolsUsed.indexOf(tool) < toolsUsed.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Simulate streaming for text content
    console.log('[SDK-ADAPTER] Final text content length:', textContent.length);
    if (textContent) {
      console.log('[SDK-ADAPTER] Calling emitTextChunked with text preview:', textContent.substring(0, 100));
      await this.emitTextChunked(textContent);
      console.log('[SDK-ADAPTER] emitTextChunked completed');
    } else {
      console.warn('[SDK-ADAPTER] ⚠️  No text content to emit!');
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
          id: this.currentAssistantMessageId,  // Use assistant message ID for proper association
          data: {
            tool_use_id: event.content_block.id,
            tool_name: event.content_block.name,
            tool_input: {}, // Will be populated by deltas
          },
          timestamp: Date.now(),
        });
      }
    } else if (event.type === 'content_block_stop') {
      // Content block ending - emit tool_result if this was a tool_use block
      // The SDK doesn't provide the block details in the stop event,
      // but we can check the message snapshot if available
      if (message.message?.content?.[event.index]?.type === 'tool_use') {
        const toolBlock = message.message.content[event.index];
        if (toolBlock.type === 'tool_use') {
          console.log('[SDK-ADAPTER] Emitting tool_result for completed tool:', toolBlock.name);
          this.sendResponse({
            type: 'tool_result',
            id: this.currentAssistantMessageId,
            data: {
              tool_use_id: toolBlock.id,
              tool_name: toolBlock.name,
              result: 'completed', // The actual result is handled internally by SDK
            },
            timestamp: Date.now(),
          });
        }
      }
    } else if (event.type === 'content_block_delta') {
      // Token or tool input update
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        // Accumulate text for database storage
        this.currentAssistantMessage += event.delta.text;

        // Send text token directly (already streaming from SDK)
        this.sendResponse({
          type: 'token',
          id: this.currentAssistantMessageId,
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
      id: this.currentAssistantMessageId,
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
    console.log('[SDK-ADAPTER] emitTextChunked START - text length:', text.length);
    // Accumulate text for database storage
    this.currentAssistantMessage += text;

    // Split text into words while preserving whitespace
    const words = text.split(/(\s+)/);
    console.log('[SDK-ADAPTER] Split into', words.length, 'word chunks');

    for (const word of words) {
      if (word.length > 0) {
        this.sendResponse({
          type: 'token',
          id: this.currentAssistantMessageId,
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
    console.log('[SDK-ADAPTER] emitTextChunked END - emitted', words.length, 'chunks');
  }

  /**
   * Get list of available agents with metadata
   */
  async listAgents(): Promise<AgentConfig[]> {
    try {
      return await getAgentMetadata();
    } catch (error) {
      this.log('error', 'Failed to list agents:', error);
      return [];
    }
  }

  /**
   * Generate a conversation title from the user's first message (simple fallback)
   */
  private generateTitle(message: string): string {
    // Take first 50 characters, trim, and add ellipsis if needed
    const maxLength = 50;
    const trimmed = message.trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }
    return trimmed.substring(0, maxLength).trim() + '...';
  }

  /**
   * Generate a dynamic, intelligent title using Claude
   * This runs asynchronously in the background to avoid blocking the conversation
   */
  private async generateDynamicTitle(userMessage: string, assistantMessage: string): Promise<void> {
    if (!this.currentConversationId) return;

    try {
      this.log('info', 'Generating dynamic title with Claude...');

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022', // Use fast, cheap model for title generation
        max_tokens: 50,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: `Generate a concise, descriptive title (5-10 words max) for this conversation. Only respond with the title, nothing else.

User: ${userMessage}
Assistant: ${assistantMessage}

Title:`
        }]
      });

      // Extract title from response
      const titleContent = response.content[0];
      if (titleContent.type === 'text') {
        const title = titleContent.text.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present

        // Update the conversation title in the database
        this.db.updateConversationTitle(this.currentConversationId, title);
        this.log('info', `Dynamic title generated: "${title}"`);
      }
    } catch (error) {
      this.log('error', 'Failed to generate dynamic title:', error);
      // Silently fail - the simple truncated title will remain
    }
  }

  /**
   * Send an IPC response to the Tauri shell via stdout
   *
   * Handles large payloads and broken pipe errors gracefully
   */
  private sendResponse(response: AgentResponse): void {
    try {
      const json = JSON.stringify(response);

      // Log token responses at debug level (only first few chars to avoid spam)
      if (response.type === 'token') {
        const tokenPreview = response.token?.substring(0, 20) || '';
        console.log(`[SDK-ADAPTER] Sending token: "${tokenPreview}${response.token && response.token.length > 20 ? '...' : ''}"`);
      } else {
        console.log('[SDK-ADAPTER] Sending response:', response.type, 'id:', response.id);
      }

      // Check if stdout is writable before writing
      if (!process.stdout.writable) {
        this.log('error', 'stdout is not writable - pipe may be closed');
        return;
      }

      // Write to stdout with error handling
      const success = process.stdout.write(json + '\n');

      if (!success) {
        // Backpressure detected - stdout buffer is full
        // Wait for drain event before continuing
        this.log('warn', 'stdout buffer full - backpressure detected');
      }
    } catch (error) {
      // Handle EPIPE and other write errors gracefully
      if ((error as any).code === 'EPIPE') {
        this.log('error', 'Broken pipe - parent process may have closed stdout');
      } else {
        this.log('error', 'Failed to send response:', error);
      }
    }
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
