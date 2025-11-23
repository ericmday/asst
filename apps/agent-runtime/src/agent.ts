import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig } from './config.js';
import type { Tool } from './tools/index.js';

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
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: request.message!,
      });

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
        const finalMessage = await this.client.messages.create({
          model: this.config.modelId,
          max_tokens: this.config.maxTokens,
          system: "You are a helpful AI assistant with access to tools. When you need to perform an action like reading or writing files, you MUST use the available tools by providing ALL required parameters. Always fill in the complete tool input parameters based on the user's request.",
          messages: this.conversationHistory,
          ...(toolSchemas.length > 0 && {
            tools: toolSchemas,
          }),
        });

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
        this.conversationHistory.push({
          role: 'assistant',
          content: finalMessage.content,
        });

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

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: typeof result === 'string' ? result : JSON.stringify(result),
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
          this.conversationHistory.push({
            role: 'user',
            content: toolResults,
          });

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
