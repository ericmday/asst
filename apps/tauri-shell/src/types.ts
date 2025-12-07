// IPC Protocol Types

export interface PermissionRequestResponse {
  type: 'permission_request';
  id: string;
  permission_id: string;
  tool_name: string;
  tool_input: any;
  blocked_path?: string;
  decision_reason?: string;
  timestamp: number;
}

export type AgentResponse =
  | ReadyResponse
  | TokenResponse
  | ToolUseResponse
  | ToolResultResponse
  | ToolProgressResponse
  | ToolProgressDetailResponse
  | DoneResponse
  | ErrorResponse
  | AgentsListResponse
  | PermissionRequestResponse;

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

export interface ToolProgressResponse {
  type: 'tool_progress';
  id: string;
  data: {
    tool_use_id: string;
    tool_name: string;
    elapsed_time_seconds: number;
  };
  timestamp: number;
}

export interface ToolProgressDetailResponse {
  type: 'tool_progress_detail';
  id: string;
  data: {
    tool_use_id: string;
    tool_name: string;
    detail: string;
    step: number;
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
  content: string; // Full content (for backward compat)
  contentBeforeTools?: string; // Content that came before first tool_use
  contentAfterTools?: string; // Content that came after tools
  hasTools?: boolean; // Flag to indicate if this message has associated tools
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
  elapsedSeconds?: number;
  status: 'pending' | 'running' | 'completed';
  timestamp: number;
  messageId: string; // ID of the assistant message this tool call belongs to
  startTime?: number; // Client-side timestamp when tool started running (for smooth elapsed time calculation)
  progressDetails?: string[]; // Array of progress messages showing intermediate steps
}

// Agent Log Types

export interface AgentLog {
  source: 'stdout' | 'stderr';
  message: string;
  timestamp: number;
}

// Agent Configuration Types

export interface AgentMetadata {
  icon?: string;
  color?: string;
  author?: string;
  version?: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  metadata?: AgentMetadata;
}

// IPC Response for agent list
export interface AgentsListResponse {
  type: 'agents_list';
  id: string;
  agents: AgentConfig[];
  timestamp: number;
}
