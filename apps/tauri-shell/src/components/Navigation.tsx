import { useState } from 'react'
import { Moon, Sun, X, Settings, Wrench, MessageSquare } from 'lucide-react'
import { Conversations } from './Conversations'

interface NavigationProps {
  isOpen: boolean
  onClose: () => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  currentConversationId?: string
  onConversationSelect: (id: string) => void
  onNewConversation: () => void
}

type Tab = 'history' | 'tools' | 'settings'

export function Navigation({
  isOpen,
  onClose,
  theme,
  onThemeToggle,
  currentConversationId,
  onConversationSelect,
  onNewConversation
}: NavigationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('history')

  if (!isOpen) {
    return null
  }

  return (
    <>
      {/* Backdrop */}
      <div className="nav-backdrop" onClick={onClose} />

      {/* Navigation Drawer */}
      <div className="nav-drawer">
        <div className="nav-header">
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <MessageSquare size={18} />
              History
            </button>
            <button
              className={`nav-tab ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              <Wrench size={18} />
              Tools
            </button>
            <button
              className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} />
              Settings
            </button>
          </div>
          <button onClick={onClose} className="nav-close-btn" title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="nav-content">
          {/* History Tab - Show Conversations */}
          {activeTab === 'history' && (
            <div className="nav-tab-content">
              <Conversations
                isOpen={true}
                onClose={onClose}
                currentConversationId={currentConversationId}
                onConversationSelect={onConversationSelect}
                onNewConversation={onNewConversation}
                embedded={true}
              />
            </div>
          )}

          {/* Tools Tab */}
          {activeTab === 'tools' && (
            <div className="nav-tab-content">
              <div className="nav-section">
                <h3>Available Tools</h3>
                <p className="nav-section-description">
                  Tools available for the assistant to use
                </p>

                <div className="tool-list">
                  <div className="tool-item">
                    <div className="tool-icon">📁</div>
                    <div className="tool-info">
                      <div className="tool-name">Filesystem</div>
                      <div className="tool-desc">Read, write, and search files</div>
                    </div>
                  </div>

                  <div className="tool-item">
                    <div className="tool-icon">💻</div>
                    <div className="tool-info">
                      <div className="tool-name">System</div>
                      <div className="tool-desc">Run commands and get system info</div>
                    </div>
                  </div>

                  <div className="tool-item">
                    <div className="tool-icon">📋</div>
                    <div className="tool-info">
                      <div className="tool-name">Clipboard</div>
                      <div className="tool-desc">Read and write clipboard</div>
                    </div>
                  </div>

                  <div className="tool-item">
                    <div className="tool-icon">📸</div>
                    <div className="tool-info">
                      <div className="tool-name">Vision</div>
                      <div className="tool-desc">Screenshot and image analysis</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="nav-tab-content">
              <div className="nav-section">
                <h3>Appearance</h3>

                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-name">Theme</div>
                    <div className="setting-desc">
                      {theme === 'light' ? 'Light mode' : 'Dark mode'}
                    </div>
                  </div>
                  <button onClick={onThemeToggle} className="theme-toggle-btn">
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                  </button>
                </div>
              </div>

              <div className="nav-section">
                <h3>About</h3>
                <div className="about-info">
                  <p><strong>Desktop Assistant</strong></p>
                  <p className="about-version">Version 0.1.0</p>
                  <p className="about-model">Model: Claude Sonnet 4.5</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
