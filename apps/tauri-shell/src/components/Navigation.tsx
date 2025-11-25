import { useState } from 'react'
import { Moon, Sun, Settings, Wrench, MessageSquare } from 'lucide-react'
import { Conversations } from './Conversations'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { Message } from '../types'

interface NavigationProps {
  isOpen: boolean
  onClose: () => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  currentConversationId?: string
  onConversationSelect: (id: string) => void
  onNewConversation: () => void
  onLoadMessages: (messages: Message[], preventAutoCompact?: () => void) => void
  conversationVersionRef?: React.MutableRefObject<number>
  preventAutoCompact?: () => void
}

type Tab = 'history' | 'tools' | 'settings'

export function Navigation({
  isOpen,
  onClose,
  theme,
  onThemeToggle,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onLoadMessages,
  conversationVersionRef,
  preventAutoCompact
}: NavigationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('history')

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-80 p-0">
        <div className="flex flex-col h-full">
          {/* Tabs Header */}
          <div className="border-b p-3">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="history" className="flex items-center gap-1.5">
                  <MessageSquare size={16} />
                  <span className="text-sm">History</span>
                </TabsTrigger>
                <TabsTrigger value="tools" className="flex items-center gap-1.5">
                  <Wrench size={16} />
                  <span className="text-sm">Tools</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-1.5">
                  <Settings size={16} />
                  <span className="text-sm">Settings</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="h-full">
                <Conversations
                  isOpen={true}
                  onClose={onClose}
                  currentConversationId={currentConversationId}
                  onConversationSelect={onConversationSelect}
                  onNewConversation={onNewConversation}
                  onLoadMessages={onLoadMessages}
                  conversationVersionRef={conversationVersionRef}
                  embedded={true}
                  preventAutoCompact={preventAutoCompact}
                />
              </div>
            )}

            {/* Tools Tab */}
            {activeTab === 'tools' && (
              <div className="h-full overflow-auto p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Available Tools</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Tools available for the assistant to use
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                      <span className="text-sm">📁</span>
                      <div>
                        <div className="font-medium text-sm">Filesystem</div>
                        <div className="text-sm text-muted-foreground">Read, write, and search files</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                      <span className="text-sm">💻</span>
                      <div>
                        <div className="font-medium text-sm">System</div>
                        <div className="text-sm text-muted-foreground">Run commands and get system info</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                      <span className="text-sm">📋</span>
                      <div>
                        <div className="font-medium text-sm">Clipboard</div>
                        <div className="text-sm text-muted-foreground">Read and write clipboard</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                      <span className="text-sm">📸</span>
                      <div>
                        <div className="font-medium text-sm">Vision</div>
                        <div className="text-sm text-muted-foreground">Screenshot and image analysis</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="h-full overflow-auto p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-3">Appearance</h3>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div>
                        <div className="font-medium text-sm">Theme</div>
                        <div className="text-sm text-muted-foreground">
                          {theme === 'light' ? 'Light mode' : 'Dark mode'}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={onThemeToggle}
                        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                      >
                        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-3">About</h3>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Desktop Assistant</p>
                      <p className="text-muted-foreground">Version 0.1.0</p>
                      <p className="text-muted-foreground">Model: Claude Sonnet 4.5</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
