import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig } from './config.js';
import type { Tool } from './tools/index.js';
import { ConversationDatabase } from './persistence/database.js';

export interface AgentRequest {
  id: string;
  kind: 'user_message' | 'clear_history' | 'load_conversation' | 'new_conversation';
  message?: string;
  conversation_id?: string;
  images?: string; // JSON string of image attachments
  attachments?: Array<{ path: string; mime: string }>;
  metadata?: Record<string, unknown>;
}

export interface ImageAttachment {
  data: string; // base64
  mime_type: string;
  name?: string;
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
  private db: ConversationDatabase;
  private currentConversationId: string;

  constructor(config: AppConfig, tools: Tool[]) {
    this.config = config;
    this.tools = tools;
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.db = new ConversationDatabase();

    // Create or load default conversation
    this.currentConversationId = this.getOrCreateDefaultConversation();
    this.loadConversationHistory(this.currentConversationId);
  }

  async initialize(): Promise<void> {
    this.log('info', 'Agent orchestrator initialized');
    this.log('info', `Loaded conversation: ${this.currentConversationId}`);
  }

  private getOrCreateDefaultConversation(): string {
    const conversations = this.db.getAllConversations();
    if (conversations.length > 0) {
      // Return most recent conversation
      return conversations[0].id;
    } else {
      // Create new default conversation
      const conv = this.db.createConversation(`conv_${Date.now()}`, 'New Conversation');
      return conv.id;
    }
  }

  private loadConversationHistory(conversationId: string): void {
    const history = this.db.getMessageHistory(conversationId);
    this.conversationHistory = history;
    this.log('info', `Loaded ${history.length} messages from conversation ${conversationId}`);
  }

  async handleRequest(request: AgentRequest): Promise<void> {
    if (request.kind === 'clear_history') {
      this.conversationHistory = [];
      this.db.clearMessages(this.currentConversationId);
      this.sendResponse({
        type: 'done',
        id: request.id,
        timestamp: Date.now(),
      });
      return;
    }

    if (request.kind === 'new_conversation') {
      const title = request.metadata?.title as string || 'New Conversation';
      const conv = this.db.createConversation(`conv_${Date.now()}`, title);
      this.currentConversationId = conv.id;
      this.conversationHistory = [];
      this.log('info', `Created new conversation: ${conv.id}`);
      this.sendResponse({
        type: 'done',
        id: request.id,
        data: { conversation_id: conv.id },
        timestamp: Date.now(),
      });
      return;
    }

    if (request.kind === 'load_conversation' && request.conversation_id) {
      this.currentConversationId = request.conversation_id;
      this.loadConversationHistory(request.conversation_id);
      this.sendResponse({
        type: 'done',
        id: request.id,
        data: { conversation_id: request.conversation_id, message_count: this.conversationHistory.length },
        timestamp: Date.now(),
      });
      return;
    }

    if (request.kind === 'user_message' && request.message) {
      await this.processUserMessage(request);
    }
  }

  /**
   * Simulate streaming by emitting text in chunks with small delays
   * This provides a better UX while using the non-streaming API
   */
  private async emitTextChunked(text: string, requestId: string): Promise<void> {
    // Split text into words while preserving whitespace
    const words = text.split(/(\s+)/);

    for (const word of words) {
      if (word.length > 0) {
        this.sendResponse({
          type: 'token',
          id: requestId,
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

  private async processUserMessage(request: AgentRequest): Promise<void> {
    try {
      // Parse images if provided
      let imageAttachments: ImageAttachment[] = [];
      if (request.images) {
        try {
          imageAttachments = JSON.parse(request.images);
        } catch (e) {
          this.log('error', 'Failed to parse image attachments:', e);
        }
      }

      // Validate image sizes (max 5MB per image in base64)
      const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
      for (const img of imageAttachments) {
        const sizeInBytes = img.data.length * 0.75; // base64 is ~1.33x larger than binary
        if (sizeInBytes > MAX_IMAGE_SIZE) {
          this.sendResponse({
            type: 'error',
            id: request.id,
            error: `Image too large (${(sizeInBytes / 1024 / 1024).toFixed(1)}MB). Maximum size is 5MB. Please use a smaller image.`,
            timestamp: Date.now(),
          });
          return;
        }
      }

      // Build content array with text and images
      const contentBlocks: Anthropic.MessageParam['content'] = [];

      // Add text content if provided
      if (request.message && request.message.trim()) {
        contentBlocks.push({
          type: 'text',
          text: request.message,
        });
      }

      // Add image content blocks
      for (const img of imageAttachments) {
        // Extract media type from mime_type (e.g., 'image/png' -> 'png')
        const mediaType = img.mime_type.split('/')[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mime_type as any,
            data: img.data,
          },
        });
      }

      // Create user message with content blocks
      const userMessage: Anthropic.MessageParam = {
        role: 'user',
        content: contentBlocks.length === 1 && contentBlocks[0].type === 'text'
          ? (contentBlocks[0] as any).text // Single text block - use string format
          : contentBlocks, // Mixed content - use array format
      };
      this.conversationHistory.push(userMessage);

      // Save to database (serialize content for storage)
      this.db.addMessage(
        this.currentConversationId,
        'user',
        typeof userMessage.content === 'string'
          ? userMessage.content
          : JSON.stringify(userMessage.content)
      );

      // Agentic loop - continue until Claude doesn't request more tools
      let continueLoop = true;
      const maxIterations = 10; // Prevent infinite loops
      let iteration = 0;

      while (continueLoop && iteration < maxIterations) {
        iteration++;

        // Create message with streaming
        const toolSchemas = this.tools.length > 0 ? this.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })) : [];

        // Use non-streaming API due to streaming bug with claude-sonnet-4-5-20250929
        // Streaming API returns empty tool inputs, non-streaming works correctly

        // Create API call with timeout (2 minutes for vision API which can be slow)
        const apiCallPromise = this.client.messages.create({
          model: this.config.modelId,
          max_tokens: this.config.maxTokens,
          system: "You are a helpful AI assistant with access to tools. When you need to perform an action like reading or writing files, you MUST use the available tools by providing ALL required parameters. Always fill in the complete tool input parameters based on the user's request.",
          messages: this.conversationHistory,
          ...(toolSchemas.length > 0 && {
            tools: toolSchemas,
          }),
          timeout: 120000, // 2 minute timeout
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('API request timed out after 2 minutes')), 120000);
        });

        const finalMessage = await Promise.race([apiCallPromise, timeoutPromise]);

        this.log('debug', 'Received response from API');

        const toolUses: Array<{ id: string; name: string; input: any }> = [];

        // Send any text content as chunked tokens (simulating streaming)
        for (const content of finalMessage.content) {
          if (content.type === 'text') {
            // Emit text in chunks to simulate streaming for better UX
            await this.emitTextChunked(content.text, request.id);
          }
        }

        // Extract tool uses from the final message
        for (const content of finalMessage.content) {
          if (content.type === 'tool_use') {
            this.log('debug', 'Found tool use:', content.name);
            toolUses.push({
              id: content.id,
              name: content.name,
              input: content.input,
            });
          }
        }

        // Add assistant message to history
        const assistantMessage: Anthropic.MessageParam = {
          role: 'assistant',
          content: finalMessage.content,
        };
        this.conversationHistory.push(assistantMessage);

        // Save to database
        this.db.addMessage(this.currentConversationId, 'assistant', assistantMessage.content);

        // Check if we need to execute tools
        if (toolUses.length > 0) {
          this.log('info', `Executing ${toolUses.length} tool(s)`);

          // Execute all tools and collect results
          const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

          for (const toolUse of toolUses) {
            try {
              // Send tool_use event to frontend
              this.sendResponse({
                type: 'tool_use',
                id: request.id,
                data: {
                  tool_use_id: toolUse.id,
                  tool_name: toolUse.name,
                  tool_input: toolUse.input,
                },
                timestamp: Date.now(),
              });

              // Find and execute the tool
              const tool = this.tools.find(t => t.name === toolUse.name);
              if (!tool) {
                throw new Error(`Tool not found: ${toolUse.name}`);
              }

              this.log('debug', `Executing tool: ${toolUse.name}`, toolUse.input);
              const result = await tool.execute(toolUse.input);

              // Check if result contains an image (for vision tools)
              let toolResultContent: any;
              if (result && typeof result === 'object' && 'image' in result) {
                // Vision tool result - format as image content block
                const imageData = result as { image: string; format: string; [key: string]: any };
                toolResultContent = [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: `image/${imageData.format}`,
                      data: imageData.image,
                    },
                  },
                  {
                    type: 'text',
                    text: `Image captured (${imageData.format}, ${imageData.size} bytes)`,
                  },
                ];
              } else {
                // Regular tool result - convert to string
                toolResultContent = typeof result === 'string' ? result : JSON.stringify(result);
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: toolResultContent,
              });

              // Send tool_result event to frontend
              this.sendResponse({
                type: 'tool_result',
                id: request.id,
                data: {
                  tool_use_id: toolUse.id,
                  tool_name: toolUse.name,
                  result,
                },
                timestamp: Date.now(),
              });

              this.log('debug', `Tool executed successfully: ${toolUse.name}`);

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              this.log('error', `Tool execution failed: ${toolUse.name}`, errorMessage);

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Error: ${errorMessage}`,
              });

              // Send error to frontend
              this.sendResponse({
                type: 'tool_result',
                id: request.id,
                data: {
                  tool_use_id: toolUse.id,
                  tool_name: toolUse.name,
                  error: errorMessage,
                },
                timestamp: Date.now(),
              });
            }
          }

          // Add tool results to conversation history as user message
          const toolResultMessage: Anthropic.MessageParam = {
            role: 'user',
            content: toolResults,
          };
          this.conversationHistory.push(toolResultMessage);

          // Save to database
          this.db.addMessage(this.currentConversationId, 'user', toolResultMessage.content);

          // Continue the loop to let Claude process tool results
          continueLoop = true;

        } else {
          // No tools requested, exit loop
          continueLoop = false;
        }
      }

      if (iteration >= maxIterations) {
        this.log('warn', 'Max iterations reached in agentic loop');
      }

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

  private sendResponse(response: AgentResponse): void {
    console.log(JSON.stringify(response));
  }

  private log(level: string, message: string, data?: unknown): void {
    if (this.config.logLevel === 'debug' || level !== 'debug') {
      console.error(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  }
}
