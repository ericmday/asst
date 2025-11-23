import { useState, useRef, useEffect } from 'react'
import { useAgent } from './useAgent'

function App() {
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, toolCalls, isAgentReady, isLoading, sendMessage, clearHistory } = useAgent()

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue)
      setInputValue('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="app">
      <div className="header">
        <h1>Desktop Assistant</h1>
        <div className="header-actions">
          <span className={`status ${isAgentReady ? 'ready' : 'loading'}`}>
            {isAgentReady ? '● Ready' : '○ Starting...'}
          </span>
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
            <p>Ask me anything...</p>
            <p className="hint">Press Cmd+Shift+Space to toggle window</p>
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
                      {msg.content}
                      {msg.isStreaming && <span className="cursor">▊</span>}
                    </div>
                    {/* Show tool calls for this message */}
                    {toolCalls.filter(tc => tc.id.includes(msg.id)).map(tc => (
                      <div key={tc.id} className="tool-call">
                        <div className="tool-name">🔧 {tc.name}</div>
                        <div className="tool-input">
                          {JSON.stringify(tc.input, null, 2)}
                        </div>
                        {tc.result && (
                          <div className="tool-result">
                            → {JSON.stringify(tc.result, null, 2)}
                          </div>
                        )}
                      </div>
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
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isAgentReady ? "Type a message..." : "Starting agent..."}
          disabled={!isAgentReady || isLoading}
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
