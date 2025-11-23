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

      // Process stream
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            assistantMessage += event.delta.text;

            this.sendResponse({
              type: 'token',
              id: request.id,
              token: event.delta.text,
              timestamp: Date.now(),
            });
          }
        } else if (event.type === 'message_stop') {
          break;
        }
      }

      // Add assistant message to history
      if (assistantMessage) {
        this.conversationHistory.push({
          role: 'assistant',
          content: assistantMessage,
        });
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
