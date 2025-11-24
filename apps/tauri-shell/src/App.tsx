import { useState, useRef, useEffect } from 'react'
import { useAgent } from './useAgent'
import { ToolResult } from './components/ToolResult'
import { Markdown } from './components/Markdown'

function App() {
  const [inputValue, setInputValue] = useState('')
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
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue)
      setInputValue('')
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
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
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isAgentReady ? "Type a message..." : "Starting agent..."}
          disabled={!isAgentReady || isLoading}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!isAgentReady || isLoading || !inputValue.trim()}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

export default App
