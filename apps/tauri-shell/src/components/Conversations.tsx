import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Trash2, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Message } from '../types'

interface Conversation {
  id: string
  title: string
  created_at: number
  updated_at: number
}

interface BackendMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string  // JSON string
  timestamp: number
}

interface ConversationsProps {
  isOpen: boolean
  onClose: () => void
  currentConversationId?: string
  onConversationSelect: (id: string) => void
  onNewConversation: () => void
  onLoadMessages: (messages: Message[]) => void
  embedded?: boolean // Whether this is embedded in navigation drawer
}

export function Conversations({
  isOpen,
  onClose,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onLoadMessages,
  embedded = false
}: ConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  // Load conversations when component mounts or sidebar opens
  useEffect(() => {
    if (isOpen || embedded) {
      loadConversations()
    }
  }, [isOpen, embedded])

  // Listen for agent responses with conversation data
  useEffect(() => {
    const unlisten = listen<any>('agent_response', (event) => {
      const response = event.payload
      console.log('[Conversations] Received event:', response.type, response.data)

      // Handle list_conversations response
      if (response.type === 'done' && response.data?.conversations) {
        console.log('[Conversations] Setting conversations:', response.data.conversations)
        setConversations(response.data.conversations)
        setLoading(false)
      }

      // Handle load_conversation response
      if (response.type === 'done' && response.data?.messages) {
        console.log('[Conversations] Loaded conversation messages:', response.data.messages)
        const backendMessages = response.data.messages as BackendMessage[]

        // Convert backend message format to frontend Message format
        const uiMessages: Message[] = backendMessages.map(msg => {
          // Content is JSON-encoded, so parse it
          let content = msg.content
          try {
            // If content is a JSON string, parse it
            if (content.startsWith('"') && content.endsWith('"')) {
              content = JSON.parse(content)
            }
          } catch (e) {
            // If parsing fails, use as-is
            console.warn('[Conversations] Failed to parse message content:', e)
          }

          return {
            id: msg.id,
            role: msg.role,
            content,
            timestamp: msg.timestamp,
            isStreaming: false
          }
        })

        console.log('[Conversations] Converted messages:', uiMessages)
        onLoadMessages(uiMessages)
      }
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const loadConversations = async () => {
    try {
      setLoading(true)
      // The actual data will come through the agent_response event listener above
      await invoke('list_conversations')
    } catch (error) {
      console.error('Failed to load conversations:', error)
      setLoading(false)
    }
  }

  const handleNewConversation = async () => {
    try {
      await invoke('new_conversation')
      onNewConversation()
      onClose()
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const handleSelectConversation = async (id: string) => {
    try {
      await invoke('load_conversation', { conversationId: id })
      onConversationSelect(id)
      onClose()
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm('Delete this conversation?')) {
      return
    }

    try {
      await invoke('delete_conversation', { conversationId: id })
      setConversations(prev => prev.filter(c => c.id !== id))
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return 'Today'
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return `${days} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  if (!isOpen && !embedded) {
    return null
  }

  // If embedded, render without backdrop and sidebar wrapper
  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        {/* New conversation button */}
        <div className="p-3 border-b">
          <Button
            onClick={handleNewConversation}
            className="w-full"
            aria-label="Start new conversation"
          >
            <Plus size={16} className="mr-2" />
            New Conversation
          </Button>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-8 text-muted-foreground">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare size={48} className="opacity-30 mb-4" />
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start chatting to create your first conversation
                </p>
              </div>
            ) : (
              conversations.map(conv => (
                <Card
                  key={conv.id}
                  className={cn(
                    "group cursor-pointer transition-all hover:shadow-md",
                    conv.id === currentConversationId && "ring-2 ring-primary"
                  )}
                  onClick={() => handleSelectConversation(conv.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Conversation: ${conv.title}`}
                  aria-selected={conv.id === currentConversationId}
                >
                  <div className="flex items-center justify-between p-3 gap-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <MessageSquare
                        size={16}
                        className={cn(
                          "shrink-0 mt-0.5",
                          conv.id === currentConversationId ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium line-clamp-2">{conv.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(conv.updated_at)}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity shrink-0"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  // NOT REACHABLE - embedded mode returns above

  // Standalone mode with backdrop and sidebar
  return (
    <>
      {/* Backdrop */}
      <div className="conversations-backdrop" onClick={onClose} />

      {/* Sidebar */}
      <div className="conversations-sidebar">
        <div className="conversations-header">
          <h2>History</h2>
          <div className="conversations-header-actions">
            <button
              onClick={handleNewConversation}
              className="conversations-new-btn"
              title="New conversation"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={onClose}
              className="conversations-close-btn"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="conversations-list">
          {loading ? (
            <div className="conversations-loading">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="conversations-empty">
              <MessageSquare size={48} opacity={0.3} />
              <p>No conversations yet</p>
              <p className="conversations-empty-hint">
                Start chatting to create your first conversation
              </p>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === currentConversationId ? 'active' : ''}`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <div className="conversation-item-main">
                  <MessageSquare size={16} />
                  <div className="conversation-item-content">
                    <div className="conversation-item-title">{conv.title}</div>
                    <div className="conversation-item-date">{formatDate(conv.updated_at)}</div>
                  </div>
                </div>
                <button
                  className="conversation-item-delete"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
