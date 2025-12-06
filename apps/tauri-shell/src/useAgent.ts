import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import type { AgentResponse, Message, ToolCall, ImageAttachment } from './types';

export function useAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const conversationVersionRef = useRef(0);
  // Track which message IDs have seen tool_use events
  const messagesWithToolsRef = useRef<Set<string>>(new Set());

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
      const currentVersion = conversationVersionRef.current; // Capture version at start
      const response = event.payload;

      // DEBUG: Log ALL events temporarily
      // if (response.type === 'token') {
      //   console.log('[TOKEN DEBUG]', {
      //     type: response.type,
      //     id: response.id,
      //     token: response.token?.substring(0, 20),
      //     currentVersion,
      //     refVersion: conversationVersionRef.current,
      //     willProcess: currentVersion === conversationVersionRef.current
      //   });
      // } else {
      //   console.log('Received agent response:', response);
      // }

      if (response.type === 'ready') {
        setIsAgentReady(true);
        return;
      }

      if (response.type === 'token') {
        if (currentVersion !== conversationVersionRef.current) {
          // console.error('[TOKEN REJECTED] Version mismatch!', {
          //   currentVersion,
          //   refVersion: conversationVersionRef.current
          // });
          return; // Guard against stale responses
        }

        // console.log('[TOKEN PROCESSING] Adding to messages...');
        const hasSeenTools = messagesWithToolsRef.current.has(response.id);

        setMessages((prev) => {
          // Find existing assistant message with this ID anywhere in the array
          const existingMsgIndex = prev.findIndex(
            msg => msg.role === 'assistant' && msg.id === response.id
          );

          // console.log('[TOKEN PROCESSING] Existing msg index:', existingMsgIndex, 'Current messages:', prev.length, 'hasSeenTools:', hasSeenTools);

          if (existingMsgIndex !== -1) {
            // Update existing message in place
            const updated = [...prev];
            const msg = updated[existingMsgIndex];

            // Route token to appropriate field based on whether tools have been used
            if (hasSeenTools) {
              // Append to contentAfterTools
              updated[existingMsgIndex] = {
                ...msg,
                content: msg.content + response.token,
                contentAfterTools: (msg.contentAfterTools || '') + response.token,
                isStreaming: true,
              };
            } else {
              // Append to contentBeforeTools
              updated[existingMsgIndex] = {
                ...msg,
                content: msg.content + response.token,
                contentBeforeTools: (msg.contentBeforeTools || '') + response.token,
                isStreaming: true,
              };
            }
            // console.log('[TOKEN PROCESSING] Updated message', existingMsgIndex, 'new length:', updated[existingMsgIndex].content.length);
            return updated;
          } else {
            // Create new assistant message
            const newMsg = {
              id: response.id,
              role: 'assistant' as const,
              content: response.token,
              contentBeforeTools: response.token,
              timestamp: response.timestamp,
              isStreaming: true,
            };
            // console.log('[TOKEN PROCESSING] Created new message:', newMsg);
            return [
              ...prev,
              newMsg,
            ];
          }
        });
        return;
      }

      if (response.type === 'tool_use') {
        if (currentVersion !== conversationVersionRef.current) return; // Guard against stale responses

        // Mark that this message has tools
        messagesWithToolsRef.current.add(response.id);

        // Set hasTools flag on the message (create placeholder if needed)
        setMessages((prev) => {
          const msgIndex = prev.findIndex(
            msg => msg.role === 'assistant' && msg.id === response.id
          );
          if (msgIndex !== -1) {
            // Update existing message
            const updated = [...prev];
            updated[msgIndex] = {
              ...updated[msgIndex],
              hasTools: true,
            };
            return updated;
          } else {
            // Create placeholder assistant message if it doesn't exist
            // This happens when tools are used before any text tokens are sent
            return [
              ...prev,
              {
                id: response.id,
                role: 'assistant' as const,
                content: '',
                contentBeforeTools: '',
                hasTools: true,
                timestamp: response.timestamp,
                isStreaming: true,
              },
            ];
          }
        });

        setToolCalls((prev) => [
          ...prev,
          {
            id: response.data.tool_use_id,
            name: response.data.tool_name,
            input: response.data.tool_input,
            timestamp: response.timestamp,
            messageId: response.id, // Associate tool call with assistant message
            status: 'pending',
            startTime: Date.now(), // Set startTime immediately for smooth elapsed time tracking
          },
        ]);
        return;
      }

      if (response.type === 'tool_result') {
        if (currentVersion !== conversationVersionRef.current) return; // Guard against stale responses
        setToolCalls((prev) =>
          prev.map((call) =>
            call.id === response.data.tool_use_id
              ? { ...call, result: response.data.result || response.data.error, status: 'completed' }
              : call
          )
        );
        return;
      }

      if (response.type === 'tool_progress') {
        if (currentVersion !== conversationVersionRef.current) return;
        setToolCalls((prev) =>
          prev.map((call) =>
            call.id === response.data.tool_use_id
              ? {
                  ...call,
                  elapsedSeconds: response.data.elapsed_time_seconds,
                  status: 'running',
                  // Keep existing startTime (set when tool was created), or calculate from backend elapsed time
                  startTime: call.startTime || Date.now() - (response.data.elapsed_time_seconds * 1000)
                }
              : call
          )
        );
        return;
      }

      if (response.type === 'done') {
        if (currentVersion !== conversationVersionRef.current) return; // Guard against stale responses
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
        if (currentVersion !== conversationVersionRef.current) return; // Guard against stale responses
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

    const id = crypto.randomUUID();
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

      if (attachments && attachments.length > 0) {
        console.log(`[UI] Sending ${attachments.length} image(s) to backend`);
        attachments.forEach((att, i) => {
          console.log(`[UI] Image ${i + 1}: ${att.mime_type}, Base64 sent: ${att.data.substring(0, 20)}...`);
        });
      }

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
          id: crypto.randomUUID(),
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
      conversationVersionRef.current++; // Invalidate old responses
      messagesWithToolsRef.current.clear(); // Clear tool tracking
      setMessages([]);
      setToolCalls([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }, []); // No dependencies - function is now stable

  const loadMessages = useCallback((loadedMessages: Message[], preventAutoCompact?: () => void) => {
    conversationVersionRef.current++; // Invalidate old responses
    messagesWithToolsRef.current.clear(); // Clear tool tracking

    // Rebuild tool tracking for loaded messages
    loadedMessages.forEach(msg => {
      if (msg.hasTools) {
        messagesWithToolsRef.current.add(msg.id);
      }
    });

    setMessages(loadedMessages);
    setToolCalls([]);
    // Prevent auto-compact when loading historical messages
    preventAutoCompact?.();
  }, []);

  const interruptQuery = useCallback(async () => {
    try {
      await invoke('send_interrupt');
      setIsLoading(false);
      console.log('Query interrupted');
    } catch (error) {
      console.error('Failed to interrupt query:', error);
    }
  }, []);

  return {
    messages,
    toolCalls,
    isAgentReady,
    isLoading,
    sendMessage,
    clearHistory,
    loadMessages,
    interruptQuery,
    conversationVersionRef,
  };
}
