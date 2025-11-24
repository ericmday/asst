import { useState, useRef, useEffect } from 'react'
import { X, Send, Trash2, Menu } from 'lucide-react'
import { appWindow, LogicalSize } from '@tauri-apps/api/window'
import { useAgent } from './useAgent'
import { ToolResult } from './components/ToolResult'
import { Markdown } from './components/Markdown'
import { Navigation } from './components/Navigation'
import type { ImageAttachment } from './types'

// Window sizes
const COMPACT_HEIGHT = 90  // Compact - just input area (no header, no frame)
const EXPANDED_HEIGHT = 600
const WINDOW_WIDTH = 360

// Slash command definitions
interface SlashCommand {
  command: string
  description: string
  example?: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', description: 'Show available commands' },
  { command: '/reset', description: 'Reset conversation and start fresh' },
  { command: '/clear', description: 'Clear conversation history (alias for /reset)' },
  { command: '/session', description: 'Show current session information' },
  { command: '/ultrathink', description: 'Enable extended thinking mode', example: '/ultrathink [your prompt]' },
]

function App() {
  const [inputValue, setInputValue] = useState('')
  const [pastedImages, setPastedImages] = useState<ImageAttachment[]>([])
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [showNavigation, setShowNavigation] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Load theme from localStorage or default to light
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    return savedTheme || 'light'
  })
  const [isExpanded, setIsExpanded] = useState(() => {
    // Load expanded state from localStorage
    const savedExpanded = localStorage.getItem('windowExpanded')
    return savedExpanded === 'true'
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const { messages, toolCalls, isAgentReady, isLoading, sendMessage, clearHistory, loadMessages } = useAgent()

  // Filter slash commands based on input
  const filteredCommands = inputValue.startsWith('/')
    ? SLASH_COMMANDS.filter(cmd =>
        cmd.command.toLowerCase().startsWith(inputValue.toLowerCase().split(' ')[0])
      )
    : []

  // Apply theme to document and save to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Restore window size on mount based on expanded state
  useEffect(() => {
    const restoreWindowSize = async () => {
      const height = isExpanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT
      await appWindow.setSize(new LogicalSize(WINDOW_WIDTH, height))
    }
    restoreWindowSize()
  }, []) // Only run on mount

  // Save expanded state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('windowExpanded', String(isExpanded))
  }, [isExpanded])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const expandWindow = async () => {
    await appWindow.setSize(new LogicalSize(WINDOW_WIDTH, EXPANDED_HEIGHT))
    setIsExpanded(true)
  }

  const handleSend = async () => {
    if ((inputValue.trim() || pastedImages.length > 0) && !isLoading) {
      // Expand window on first message if not already expanded
      if (!isExpanded && messages.length === 0) {
        console.log('[DEBUG] Expanding window...', { isExpanded, messageCount: messages.length })
        await expandWindow()
        console.log('[DEBUG] Window expanded')
      }

      sendMessage(inputValue, pastedImages)
      setInputValue('')
      setPastedImages([])
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = event.target?.result as string
          // Remove data URL prefix to get just base64
          const base64Data = base64.split(',')[1]

          setPastedImages(prev => [...prev, {
            data: base64Data,
            mimeType: file.type,
            name: `pasted-image-${Date.now()}.${file.type.split('/')[1]}`
          }])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const removeImage = (index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index))
  }

  // Handle command selection
  const selectCommand = (command: string) => {
    setInputValue(command + ' ')
    setShowSlashMenu(false)
    setSelectedCommandIndex(0)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash menu navigation
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex(prev =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        )
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        selectCommand(filteredCommands[selectedCommandIndex].command)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSlashMenu(false)
        return
      }
    }

    // Enter without shift sends the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Shift+Enter adds a new line (default behavior)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)

    // Show slash menu when typing slash command
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowSlashMenu(true)
      setSelectedCommandIndex(0)
    } else {
      setShowSlashMenu(false)
    }

    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+N (Mac) or Ctrl+N (Windows/Linux) to clear chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        if (messages.length > 0) {
          clearHistory()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [messages.length, clearHistory])

  const handleConversationSelect = (id: string) => {
    setCurrentConversationId(id)
    // Messages will be loaded by Conversations component via loadMessages callback
  }

  const handleNewConversation = () => {
    setCurrentConversationId(undefined)
    clearHistory()
  }

  return (
    <div className="app">
      <Navigation
        isOpen={showNavigation}
        onClose={() => setShowNavigation(false)}
        theme={theme}
        onThemeToggle={toggleTheme}
        currentConversationId={currentConversationId}
        onConversationSelect={handleConversationSelect}
        onNewConversation={handleNewConversation}
        onLoadMessages={loadMessages}
      />

      {isExpanded && (
        <div className="header">
          <button onClick={() => setShowNavigation(true)} className="hamburger-btn" title="Menu">
            <Menu size={20} />
          </button>
          <div className="header-actions">
            <span className={`status ${isAgentReady ? 'ready' : 'loading'}`}>
              {isAgentReady ? '● Ready' : '○ Starting...'}
            </span>
            {messages.length > 0 && (
              <button onClick={clearHistory} className="clear-btn">
                <Trash2 size={16} />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="messages" style={{ display: isExpanded ? 'flex' : 'none' }}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>What can I help you with?</h2>
            <p>I can help you:</p>
            <ul>
              <li>List, read, and write files</li>
              <li>Search for files</li>
              <li>Run shell commands</li>
              <li>Get system information</li>
              <li>And more!</li>
            </ul>
            <div className="hints">
              <p className="hint">Enter to send • Shift+Enter for new line</p>
              <p className="hint">Cmd+Shift+Space to toggle • Cmd+N to clear</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.error ? (
                  <div className="error">
                    <strong>Error:</strong> {msg.error}
                  </div>
                ) : (
                  <>
                    <div className="message-content">
                      {msg.role === 'assistant' ? (
                        <>
                          <Markdown content={msg.content} />
                          {msg.isStreaming && <span className="cursor">▊</span>}
                        </>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {/* Show images if present */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="message-images">
                        {msg.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={`data:${img.mimeType};base64,${img.data}`}
                            alt={img.name || `Image ${idx + 1}`}
                            className="message-image"
                            title={img.name || `Image ${idx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                    {/* Show tool calls for this message */}
                    {toolCalls.filter(tc => tc.id.includes(msg.id)).map(tc => (
                      <ToolResult key={tc.id} toolCall={tc} />
                    ))}
                  </>
                )}
              </div>
            ))}
            {/* Show "Thinking..." indicator when loading and no assistant response yet */}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="message assistant thinking">
                <div className="message-content">
                  <span className="thinking-text">Thinking</span>
                  <span className="thinking-dots">
                    <span>.</span><span>.</span><span>.</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="input-area">
        {pastedImages.length > 0 && (
          <div className="image-preview-container">
            {pastedImages.map((img, index) => (
              <div key={index} className="image-preview">
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name || 'Pasted image'}
                />
                <button
                  className="remove-image"
                  onClick={() => removeImage(index)}
                  title="Remove image"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Slash command autocomplete menu */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            {filteredCommands.map((cmd, index) => (
              <div
                key={cmd.command}
                className={`slash-menu-item ${index === selectedCommandIndex ? 'selected' : ''}`}
                onClick={() => selectCommand(cmd.command)}
                onMouseEnter={() => setSelectedCommandIndex(index)}
              >
                <div className="slash-command-name">{cmd.command}</div>
                <div className="slash-command-desc">{cmd.description}</div>
                {cmd.example && (
                  <div className="slash-command-example">{cmd.example}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isExpanded ? (isAgentReady ? "Type a message or paste an image..." : "Starting agent...") : "Assistant"}
            disabled={!isAgentReady || isLoading}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!isAgentReady || isLoading || (!inputValue.trim() && pastedImages.length === 0)}
            className="send-btn"
          >
            <span className={`status-dot ${isAgentReady ? 'ready' : 'loading'}`}></span>
            {isLoading ? 'Sending...' : (
              <>
                <Send size={16} />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
