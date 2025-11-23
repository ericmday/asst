# 05 - Web UI

## Overview

The web UI provides the chat interface rendered in Tauri's webview. Built with React, it handles user input, displays streaming responses, and renders tool execution results.

**Key features:**
- Real-time message streaming
- Tool result visualization
- File attachments
- Keyboard shortcuts
- Theme support (dark/light)

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management
- **Tailwind CSS** - Styling (optional)
- **Tauri API** - IPC bridge

## Project Structure

```
src/
├─ main.tsx              # Entry point
├─ App.tsx               # Root component
├─ components/
│  ├─ ChatWindow.tsx     # Main chat container
│  ├─ MessageList.tsx    # Scrollable message list
│  ├─ Message.tsx        # Individual message component
│  ├─ InputBar.tsx       # Message input area
│  ├─ ToolResult.tsx     # Tool execution display
│  └─ Header.tsx         # Window header/controls
├─ lib/
│  ├─ api.ts            # Tauri IPC wrappers
│  ├─ store.ts          # Zustand state
│  └─ types.ts          # TypeScript types
└─ styles/
   └─ globals.css        # Global styles
```

## State Management

**src/lib/store.ts:**

```typescript
import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolUse?: {
    toolName: string;
    toolId: string;
    result?: any;
  };
}

interface ChatState {
  messages: Message[];
  isProcessing: boolean;
  agentStatus: 'ready' | 'processing' | 'error';

  // Actions
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToLastMessage: (text: string) => void;
  clearMessages: () => void;
  setProcessing: (processing: boolean) => void;
  setAgentStatus: (status: ChatState['agentStatus']) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  agentStatus: 'ready',

  addMessage: (message) => {
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: [...state.messages, newMessage],
    }));
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }));
  },

  appendToLastMessage: (text) => {
    set((state) => {
      const messages = [...state.messages];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.content += text;
      }
      return { messages };
    });
  },

  clearMessages: () => set({ messages: [] }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setAgentStatus: (status) => set({ agentStatus: status }),
}));
```

## Tauri API Integration

**src/lib/api.ts:**

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface SendMessagePayload {
  message: string;
  attachments?: string[];
}

export interface AgentStreamEvent {
  type: 'token' | 'tool_use' | 'tool_result' | 'done' | 'error';
  id: string;
  data?: any;
  token?: string;
  error?: string;
  timestamp: number;
}

export async function sendToAgent(payload: SendMessagePayload): Promise<void> {
  await invoke('send_to_agent', { payload });
}

export async function getAgentStatus(): Promise<string> {
  return await invoke('get_agent_status');
}

export async function restartAgent(): Promise<void> {
  await invoke('restart_agent');
}

export function subscribeToAgentStream(
  callback: (event: AgentStreamEvent) => void
): Promise<UnlistenFn> {
  return listen<AgentStreamEvent>('agent_stream', (event) => {
    callback(event.payload);
  });
}
```

## Main App Component

**src/App.tsx:**

```typescript
import { useEffect } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { Header } from './components/Header';
import { subscribeToAgentStream } from './lib/api';
import { useChatStore } from './lib/store';

export default function App() {
  const { addMessage, appendToLastMessage, updateMessage, setProcessing } = useChatStore();

  useEffect(() => {
    // Subscribe to agent stream
    let unlisten: (() => void) | null = null;

    subscribeToAgentStream((event) => {
      switch (event.type) {
        case 'token':
          if (event.token) {
            appendToLastMessage(event.token);
          }
          break;

        case 'tool_use':
          addMessage({
            role: 'assistant',
            content: `Using tool: ${event.data?.toolName}`,
            toolUse: {
              toolName: event.data?.toolName,
              toolId: event.data?.toolId,
            },
          });
          break;

        case 'tool_result':
          // Find message with matching toolId and update
          const messages = useChatStore.getState().messages;
          const toolMessage = messages.find(
            (m) => m.toolUse?.toolId === event.data?.toolId
          );
          if (toolMessage) {
            updateMessage(toolMessage.id, {
              toolUse: {
                ...toolMessage.toolUse!,
                result: event.data?.result,
              },
            });
          }
          break;

        case 'done':
          setProcessing(false);
          break;

        case 'error':
          addMessage({
            role: 'system',
            content: `Error: ${event.error}`,
          });
          setProcessing(false);
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="app">
      <Header />
      <ChatWindow />
    </div>
  );
}
```

## Chat Components

**src/components/ChatWindow.tsx:**

```typescript
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

export function ChatWindow() {
  return (
    <div className="flex flex-col h-screen">
      <MessageList />
      <InputBar />
    </div>
  );
}
```

**src/components/MessageList.tsx:**

```typescript
import { useEffect, useRef } from 'react';
import { useChatStore } from '../lib/store';
import { Message } from './Message';

export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

**src/components/Message.tsx:**

```typescript
import { Message as MessageType } from '../lib/store';
import { ToolResult } from './ToolResult';

interface MessageProps {
  message: MessageType;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>

        {message.toolUse && (
          <ToolResult
            toolName={message.toolUse.toolName}
            result={message.toolUse.result}
          />
        )}

        <div className="text-xs opacity-50 mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
```

**src/components/InputBar.tsx:**

```typescript
import { useState, KeyboardEvent } from 'react';
import { useChatStore } from '../lib/store';
import { sendToAgent } from '../lib/api';

export function InputBar() {
  const [input, setInput] = useState('');
  const { addMessage, setProcessing, isProcessing } = useChatStore();

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    // Add user message
    addMessage({
      role: 'user',
      content: input,
    });

    // Add placeholder assistant message
    addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    setProcessing(true);

    // Send to agent
    await sendToAgent({ message: input });

    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t p-4">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 resize-none rounded-lg border p-2 focus:outline-none focus:ring-2"
          rows={3}
          disabled={isProcessing}
        />
        <button
          onClick={handleSend}
          disabled={isProcessing || !input.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

**src/components/ToolResult.tsx:**

```typescript
interface ToolResultProps {
  toolName: string;
  result?: any;
}

export function ToolResult({ toolName, result }: ToolResultProps) {
  if (!result) {
    return (
      <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm">
        <div className="font-mono text-xs opacity-70">
          Running: {toolName}...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm">
      <div className="font-mono text-xs opacity-70 mb-1">
        Tool: {toolName}
      </div>
      <pre className="overflow-x-auto text-xs">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
```

## Keyboard Shortcuts

Add global keyboard shortcuts for better UX:

```typescript
useEffect(() => {
  const handleKeyboard = (e: KeyboardEvent) => {
    // Cmd/Ctrl + K - Clear chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      useChatStore.getState().clearMessages();
    }

    // Escape - Hide window
    if (e.key === 'Escape') {
      window.__TAURI__?.window.getCurrent().hide();
    }
  };

  window.addEventListener('keydown', handleKeyboard);
  return () => window.removeEventListener('keydown', handleKeyboard);
}, []);
```

## Styling

Basic CSS setup with dark mode support:

**src/styles/globals.css:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: #1a1a1a;
    color: #ffffff;
  }
}
```

## Performance Optimization

1. **Virtual scrolling** for long message lists
2. **Memoization** for expensive components
3. **Lazy loading** for tool result renderers
4. **Debounce** input handlers

## Next Steps

- Define IPC protocol → [06-ipc-protocol.md](./06-ipc-protocol.md)
- Configure security → [07-security-config.md](./07-security-config.md)

## Troubleshooting

**Messages not appearing:**
- Check agent stream subscription
- Verify event payload format
- Review browser console for errors

**Tauri invoke fails:**
- Ensure command registered in Rust
- Check payload types match
- Review Rust console output
