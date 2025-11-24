import { useState, useRef, useEffect } from 'react'
import { useAgent } from './useAgent'
import { ToolResult } from './components/ToolResult'
import { Markdown } from './components/Markdown'
import type { ImageAttachment } from './types'

function App() {
  const [inputValue, setInputValue] = useState('')
  const [pastedImages, setPastedImages] = useState<ImageAttachment[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Load theme from localStorage or default to light
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    return savedTheme || 'light'
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { messages, toolCalls, isAgentReady, isLoading, sendMessage, clearHistory } = useAgent()

  // Apply theme to document and save to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const handleSend = () => {
    if ((inputValue.trim() || pastedImages.length > 0) && !isLoading) {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without shift sends the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Shift+Enter adds a new line (default behavior)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)

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

  return (
    <div className="app">
      <div className="header">
        <h1>Desktop Assistant</h1>
        <div className="header-actions">
          <span className={`status ${isAgentReady ? 'ready' : 'loading'}`}>
            {isAgentReady ? '● Ready' : '○ Starting...'}
          </span>
          <button onClick={toggleTheme} className="theme-toggle" title="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {messages.length > 0 && (
            <button onClick={clearHistory} className="clear-btn">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="messages">
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
                  ×
                </button>
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
            placeholder={isAgentReady ? "Type a message or paste an image..." : "Starting agent..."}
            disabled={!isAgentReady || isLoading}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!isAgentReady || isLoading || (!inputValue.trim() && pastedImages.length === 0)}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
