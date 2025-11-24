import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Trash2, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/tauri'

interface Conversation {
  id: string
  title: string
  created_at: number
  updated_at: number
}

interface ConversationsProps {
  isOpen: boolean
  onClose: () => void
  currentConversationId?: string
  onConversationSelect: (id: string) => void
  onNewConversation: () => void
  embedded?: boolean // Whether this is embedded in navigation drawer
}

export function Conversations({
  isOpen,
  onClose,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  embedded = false
}: ConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  // Load conversations when sidebar opens
  useEffect(() => {
    if (isOpen) {
      loadConversations()
    }
  }, [isOpen])

  const loadConversations = async () => {
    try {
      setLoading(true)
      // Note: The actual data will come through the agent_response event
      // This is just to trigger the request
      await invoke('list_conversations')

      // For now, we'll use a timeout to wait for the response
      // In a production app, you'd handle this via events
      setTimeout(() => {
        setLoading(false)
      }, 500)
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
      <>
        <div className="conversations-header-embedded">
          <button
            onClick={handleNewConversation}
            className="conversations-new-btn"
            title="New conversation"
          >
            <Plus size={18} />
            New Chat
          </button>
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
      </>
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
