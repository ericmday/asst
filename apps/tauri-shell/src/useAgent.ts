import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import type { AgentResponse, Message, ToolCall, ImageAttachment } from './types';

export function useAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize agent on mount
  useEffect(() => {
    const initAgent = async () => {
      try {
        await invoke('spawn_agent');
        console.log('Agent spawned successfully');
      } catch (error) {
        console.error('Failed to spawn agent:', error);
      }
    };

    initAgent();
  }, []);

  // Listen to agent responses
  useEffect(() => {
    const unlisten = listen<AgentResponse>('agent_response', (event) => {
      const response = event.payload;
      console.log('Received agent response:', response);

      if (response.type === 'ready') {
        setIsAgentReady(true);
        return;
      }

      if (response.type === 'token') {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];

          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id === response.id) {
            // Append to existing assistant message
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                content: lastMsg.content + response.token,
                isStreaming: true,
              },
            ];
          } else {
            // Create new assistant message
            return [
              ...prev,
              {
                id: response.id,
                role: 'assistant',
                content: response.token,
                timestamp: response.timestamp,
                isStreaming: true,
              },
            ];
          }
        });
        return;
      }

      if (response.type === 'tool_use') {
        setToolCalls((prev) => [
          ...prev,
          {
            id: response.data.tool_use_id,
            name: response.data.tool_name,
            input: response.data.tool_input,
            timestamp: response.timestamp,
          },
        ]);
        return;
      }

      if (response.type === 'tool_result') {
        setToolCalls((prev) =>
          prev.map((call) =>
            call.id === response.data.tool_use_id
              ? { ...call, result: response.data.result || response.data.error }
              : call
          )
        );
        return;
      }

      if (response.type === 'done') {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.id === response.id) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                isStreaming: false,
              },
            ];
          }
          return prev;
        });
        setIsLoading(false);
        return;
      }

      if (response.type === 'error') {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.id === response.id) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                error: response.error,
                isStreaming: false,
              },
            ];
          }
          return [
            ...prev,
            {
              id: response.id,
              role: 'assistant',
              content: '',
              error: response.error,
              timestamp: response.timestamp,
            },
          ];
        });
        setIsLoading(false);
        return;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const sendMessage = useCallback(async (message: string, images?: ImageAttachment[]) => {
    if ((!message.trim() && (!images || images.length === 0)) || isLoading) return;

    const id = `msg-${Date.now()}`;
    setIsLoading(true);

    // Add user message to UI
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: 'user',
        content: message,
        timestamp: Date.now(),
        images: images && images.length > 0 ? images : undefined,
      },
    ]);

    try {
      // Convert images to the format expected by the backend
      const attachments = images?.map(img => ({
        data: img.data,
        mime_type: img.mimeType,
        name: img.name,
      }));

      await invoke('send_message', {
        id,
        message,
        images: attachments && attachments.length > 0 ? JSON.stringify(attachments) : undefined,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: '',
          error: String(error),
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearHistory = useCallback(async () => {
    try {
      await invoke('clear_history');
      setMessages([]);
      setToolCalls([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }, []);

  return {
    messages,
    toolCalls,
    isAgentReady,
    isLoading,
    sendMessage,
    clearHistory,
  };
}
