import { useState } from 'react'

function App() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  const handleSend = () => {
    if (message.trim()) {
      setMessages([...messages, message])
      setMessage('')
      // TODO: Send to agent via IPC
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Desktop Assistant</h1>
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>Ask me anything...</p>
            <p className="hint">Press Cmd+Shift+Space to toggle window</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className="message user">
              {msg}
            </div>
          ))
        )}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  )
}

export default App
