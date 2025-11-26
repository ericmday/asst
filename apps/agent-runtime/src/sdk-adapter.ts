import { query, type SDKMessage, type SDKAssistantMessage, type SDKPartialAssistantMessage, type SDKResultMessage, type SDKUserMessage, type McpSdkServerConfigWithInstance, type Query, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig } from './config.js';
import { ConversationDatabase, type Conversation, type Message } from './persistence/database.js';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { loadAgentDefinitions, getAgentMetadata, type AgentConfig } from './agents/loader.js';

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
 * - Maintains conversation history via session resumption
 * - Supports slash commands for special operations
 * - Maintains compatibility with existing Tauri shell and React UI
 */
export class SDKAdapter {
  private config: AppConfig;
  private mcpServer: McpSdkServerConfigWithInstance;
  private currentRequestId: string = '';
  private currentSessionId?: string;  // SDK session for conversation continuity
  private currentConversationId?: string;  // Database conversation ID
  private db: ConversationDatabase;
  private currentAssistantMessage: string = '';  // Accumulate assistant response
  private anthropic: Anthropic;  // Direct API client for title generation
  private currentQuery?: Query;  // Reference to running query for interrupt support
  private agents: Record<string, AgentDefinition> = {};  // SDK subagents

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
          this.emit({
            type: 'token',
            id: requestId,
            token: `Unknown agent '@${agentName}'. Available agents: ${Object.keys(this.agents).join(', ')}`,
            timestamp: Date.now()
          });
          this.emit({
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

      // Save user message to database
      if (this.currentConversationId) {
        this.db.addMessage(this.currentConversationId, 'user', message);
      }

      // Build prompt with text and images
      let prompt = message;

      // TODO: Handle image attachments when SDK supports them
      // For now, images will be handled separately through vision tools

      // Create SDK query with configuration
      const q = query({
        prompt,
        options: {
          model: this.config.modelId || 'claude-sonnet-4-5-20250929',
          resume: this.currentSessionId,  // Resume previous conversation if available
          mcpServers: {
            'desktop-assistant-tools': this.mcpServer  // Register MCP server with tools
          },
          maxTurns: 10, // Limit agentic loop iterations
          agents: this.agents  // Register SDK subagents
        }
      });

      // Store reference to current query for interrupt support
      this.currentQuery = q;

      // Stream SDK messages and convert to IPC format
      for await (const sdkMessage of q) {
        // Capture session ID from first message for conversation continuity
        if (!this.currentSessionId && 'session_id' in sdkMessage) {
          this.currentSessionId = sdkMessage.session_id;
          this.log('info', `Session started: ${this.currentSessionId}`);
        }

        await this.handleSDKMessage(sdkMessage);
      }

      // Save assistant's complete response to database
      if (this.currentConversationId && this.currentAssistantMessage) {
        this.db.addMessage(this.currentConversationId, 'assistant', this.currentAssistantMessage);

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
        // Accumulate text for database storage
        this.currentAssistantMessage += event.delta.text;

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
    // Accumulate text for database storage
    this.currentAssistantMessage += text;

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
