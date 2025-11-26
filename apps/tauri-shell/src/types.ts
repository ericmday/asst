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
    tool_use_id: string;
    tool_name: string;
    tool_input: any;
  };
  timestamp: number;
}

export interface ToolResultResponse {
  type: 'tool_result';
  id: string;
  data: {
    tool_use_id: string;
    tool_name: string;
    result?: any;
    error?: string;
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

export interface ImageAttachment {
  data: string; // base64 encoded image
  mimeType: string; // e.g., 'image/png', 'image/jpeg'
  name?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
  images?: ImageAttachment[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  result?: any;
  timestamp: number;
}

// Agent Log Types

export interface AgentLog {
  source: 'stdout' | 'stderr';
  message: string;
  timestamp: number;
}
