// IPC Protocol Types

export type AgentResponse =
  | ReadyResponse
  | TokenResponse
  | ToolUseResponse
  | ToolResultResponse
  | DoneResponse
  | ErrorResponse;

export interface ReadyResponse {
  type: 'ready';
  timestamp: number;
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

// UI Message Types

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  result?: any;
  timestamp: number;
}
