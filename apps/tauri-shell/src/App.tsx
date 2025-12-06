import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Trash2, Menu, Pin, StopCircle, Paperclip, Loader2, ChevronDown, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { appWindow, LogicalSize } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/tauri'
import { useAgent } from './useAgent'
import { useAgentLogs } from './useAgentLogs'
import { useAgents } from './hooks/useAgents'
import { ToolResult } from './components/ToolResult'
import { Markdown } from './components/Markdown'
import { Navigation } from './components/Navigation'
import { AgentAutocomplete } from './components/AgentAutocomplete'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ImageAttachment } from './types'

// Assistant icon component (inline SVG from app icon)
const AssistantIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    fill="none"
    stroke="currentColor"
    strokeWidth="26"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M269.65,178.37l26.61,47.44"/>
    <path d="M354.4,250.9c-53.36,54.34-140.66,55.14-195,1.79-.6-.59-1.2-1.18-1.79-1.79"/>
    <path d="M380.1,375l-29.78-52.95"/>
    <path d="M131.9,375l110.59-196.63"/>
    <circle cx="256" cy="154.37" r="27.58"/>
  </svg>
)

// Window sizes
const COMPACT_HEIGHT = 60  // Compact - minimal height for input only
const EXPANDED_HEIGHT = 600
const WINDOW_WIDTH = 365
const INACTIVITY_TIMEOUT = 5 * 60 * 1000  // 5 minutes in milliseconds
const ANIMATION_DURATION = 200  // Animation duration in milliseconds

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

// Image size limit (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

// Helper function to read file as base64 using FileReader with proper error handling
const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      // Remove data URL prefix to get just base64
      const base64Data = base64.split(',')[1]
      resolve(base64Data)
    }
    reader.onerror = (error) => {
      reject(new Error(`Failed to read file: ${error}`))
    }
    reader.readAsDataURL(file)
  })
}

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
  const [isExpanded, setIsExpanded] = useState(false)
  const [shouldAutoCompact, setShouldAutoCompact] = useState(true)
  const [isPinned, setIsPinned] = useState(false)
  const [isPickingFile, setIsPickingFile] = useState(false)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const clearInProgressRef = useRef(false)

  // Agent autocomplete state
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [agentFilter, setAgentFilter] = useState('')
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0)

  // Thinking section expansion state (keyed by message ID)
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())

  // Timer tick state to force re-renders for elapsed time updates
  const [timerTick, setTimerTick] = useState(0)

  const { messages, toolCalls, isAgentReady, isLoading, sendMessage, clearHistory, loadMessages, interruptQuery, conversationVersionRef } = useAgent()
  const { logs, clearLogs } = useAgentLogs()
  const { agents } = useAgents()

  // Redirect console logs to backend (visible in terminal for debugging)
  useEffect(() => {
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    console.log = (...args) => {
      originalLog(...args)
      invoke('log_to_backend', { level: 'info', message: args.join(' ') }).catch(() => {})
    }

    console.error = (...args) => {
      originalError(...args)
      invoke('log_to_backend', { level: 'error', message: args.join(' ') }).catch(() => {})
    }

    console.warn = (...args) => {
      originalWarn(...args)
      invoke('log_to_backend', { level: 'warn', message: args.join(' ') }).catch(() => {})
    }

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  // Filter agents based on @mention input
  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(agentFilter.toLowerCase())
  )

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

  // Client-side timer for smooth elapsed time updates
  // Forces re-render every second when tools are running
  useEffect(() => {
    // Check for both pending and running tools (matches the UI filter logic)
    const activeTools = toolCalls.filter(tc =>
      (tc.status === 'pending' || tc.status === 'running') && tc.startTime
    )

    if (activeTools.length === 0) {
      return // No timer needed when no tools are active
    }

    // Update every second to show smooth elapsed time
    const intervalId = setInterval(() => {
      // Increment tick to force re-render
      setTimerTick(prev => prev + 1)
    }, 1000)

    return () => clearInterval(intervalId)
  }, [toolCalls]) // Re-run when toolCalls changes (tools start/stop/update)

  // Set initial compact size ONLY on first mount (not on HMR remount)
  useEffect(() => {
    const setInitialSize = async () => {
      // Only set to compact if window is not already larger
      // This preserves expanded state during HMR while still initializing properly on app start
      const currentSize = await appWindow.innerSize()
      if (currentSize.height <= COMPACT_HEIGHT + 10) { // +10px tolerance
        await appWindow.setSize(new LogicalSize(WINDOW_WIDTH, COMPACT_HEIGHT))
      } else {
        // Window is already expanded, preserve that state
        setIsExpanded(true)
      }
    }
    setInitialSize()
  }, [])

  // Define functions before useEffects that use them
  const expandWindow = async () => {
    // Animate window expansion with smooth slide-up effect
    const startHeight = COMPACT_HEIGHT
    const endHeight = EXPANDED_HEIGHT
    const startTime = Date.now()

    const animate = async () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1)

      // Ease-out cubic function for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3)

      const currentHeight = startHeight + (endHeight - startHeight) * easeProgress
      await appWindow.setSize(new LogicalSize(WINDOW_WIDTH, Math.round(currentHeight)))

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setIsExpanded(true)
      }
    }

    await animate()
  }

  const compactWindow = async () => {
    await appWindow.setSize(new LogicalSize(WINDOW_WIDTH, COMPACT_HEIGHT))
    setIsExpanded(false)
  }

  const resetInactivityTimer = useCallback(() => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }

    // Only set timer if window is expanded
    if (isExpanded) {
      inactivityTimerRef.current = setTimeout(async () => {
        // Only auto-compact if not currently loading
        if (!isLoading && isExpanded) {
          setShouldAutoCompact(true)
          await compactWindow()
        }
      }, INACTIVITY_TIMEOUT)
    }
  }, [isExpanded, isLoading])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
    resetInactivityTimer()
  }

  // Auto-expand when messages are loaded (e.g., from conversation history)
  // Only auto-compact when shouldAutoCompact flag is true (initial state or timeout)
  useEffect(() => {
    // Guard: never auto-compact if clear operation is in progress
    if (clearInProgressRef.current) {
      return
    }

    if (messages.length > 0 && !isExpanded) {
      expandWindow().then(() => {
        // Only set after expansion completes to avoid race conditions
        setShouldAutoCompact(prev => prev ? false : prev)
      })
    } else if (messages.length === 0 && isExpanded && shouldAutoCompact) {
      compactWindow()
    }
  }, [messages.length, isExpanded, shouldAutoCompact])

  // Start inactivity timer when window becomes expanded
  useEffect(() => {
    if (isExpanded) {
      resetInactivityTimer()
    }
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
    }
  }, [isExpanded, resetInactivityTimer])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
    }
  }, [])

  const handleSend = async () => {
    if ((inputValue.trim() || pastedImages.length > 0) && !isLoading && !isLoadingImages) {
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
      // Reset inactivity timer on user interaction
      resetInactivityTimer()
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }

    if (imageFiles.length === 0) return

    setIsLoadingImages(true)
    try {
      const newImages: ImageAttachment[] = []

      for (const file of imageFiles) {
        // Validate file size
        if (file.size > MAX_IMAGE_SIZE) {
          console.error(`Image too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size: 10MB`)
          alert(`Image "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`)
          continue
        }

        try {
          const base64Data = await readFileAsBase64(file)
          const imageData = {
            data: base64Data,
            mimeType: file.type,
            name: `pasted-image-${Date.now()}.${file.type.split('/')[1]}`
          }

          // DETAILED LOGGING - PASTE METHOD
          console.log('[PASTE] Image captured:', {
            method: 'PASTE',
            name: imageData.name,
            mimeType: imageData.mimeType,
            fileSize: file.size,
            fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
            base64Length: base64Data.length,
            base64Sample: base64Data.substring(0, 50) + '...',
            hasDataPrefix: base64Data.startsWith('data:'),
            firstChars: base64Data.substring(0, 20)
          })

          newImages.push(imageData)
        } catch (error) {
          console.error('Failed to read pasted image:', error)
          alert(`Failed to read image: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      if (newImages.length > 0) {
        setPastedImages(prev => [...prev, ...newImages])
      }
    } finally {
      setIsLoadingImages(false)
      resetInactivityTimer()
    }
  }

  const removeImage = (index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index))
    resetInactivityTimer()
  }

  const handleFilePicker = async () => {
    try {
      setIsPickingFile(true)
      const filePath = await invoke<string | null>('open_image_picker')
      if (!filePath) return

      const imageData = await invoke<{ data: string; mime_type: string; name: string }>(
        'read_image_as_base64',
        { path: filePath }
      )

      // DETAILED LOGGING - FILE PICKER METHOD
      console.log('[FILE PICKER] Image captured:', {
        method: 'FILE_PICKER',
        name: imageData.name,
        mimeType: imageData.mime_type,
        base64Length: imageData.data.length,
        base64Sample: imageData.data.substring(0, 50) + '...',
        hasDataPrefix: imageData.data.startsWith('data:'),
        firstChars: imageData.data.substring(0, 20)
      })

      setPastedImages(prev => [
        ...prev,
        {
          data: imageData.data,
          mimeType: imageData.mime_type,
          name: imageData.name,
        },
      ])

      resetInactivityTimer()
    } catch (error) {
      console.error('Failed to pick image:', error)
    } finally {
      setIsPickingFile(false)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set isDragging to false if leaving the actual drop zone, not child elements
    if (e.currentTarget === e.target) {
      setIsDragging(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return

    setIsLoadingImages(true)
    try {
      const newImages: ImageAttachment[] = []

      for (const file of files) {
        // Validate file size
        if (file.size > MAX_IMAGE_SIZE) {
          console.error(`Image too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size: 10MB`)
          alert(`Image "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`)
          continue
        }

        try {
          const base64Data = await readFileAsBase64(file)
          const imageData = {
            data: base64Data,
            mimeType: file.type,
            name: file.name,
          }

          // DETAILED LOGGING - DROP METHOD
          console.log('[DROP] Image captured:', {
            method: 'DROP',
            name: imageData.name,
            mimeType: imageData.mimeType,
            fileSize: file.size,
            fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
            base64Length: base64Data.length,
            base64Sample: base64Data.substring(0, 50) + '...',
            hasDataPrefix: base64Data.startsWith('data:'),
            firstChars: base64Data.substring(0, 20)
          })

          newImages.push(imageData)
        } catch (error) {
          console.error('Failed to read dropped image:', error)
          alert(`Failed to read image: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      if (newImages.length > 0) {
        setPastedImages(prev => [...prev, ...newImages])
      }
    } finally {
      setIsLoadingImages(false)
      resetInactivityTimer()
    }
  }

  // Handle command selection
  const selectCommand = (command: string) => {
    setInputValue(command + ' ')
    setShowSlashMenu(false)
    setSelectedCommandIndex(0)
    textareaRef.current?.focus()
    resetInactivityTimer()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle agent autocomplete navigation
    if (showAgentMenu && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedAgentIndex(prev =>
          prev < filteredAgents.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedAgentIndex(prev =>
          prev > 0 ? prev - 1 : filteredAgents.length - 1
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selectedAgent = filteredAgents[selectedAgentIndex]
        if (selectedAgent) {
          const newValue = inputValue.replace(/@\w*$/, `@${selectedAgent.name} `)
          setInputValue(newValue)
          setShowAgentMenu(false)
          setTimeout(() => {
            e.currentTarget.focus()
            e.currentTarget.setSelectionRange(newValue.length, newValue.length)
          }, 0)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowAgentMenu(false)
        return
      }
    }

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

    // Check for @mention syntax (only at end of input)
    const atMatch = value.match(/@(\w*)$/)
    if (atMatch) {
      setAgentFilter(atMatch[1])
      setShowAgentMenu(true)
      setSelectedAgentIndex(0)
    } else {
      setShowAgentMenu(false)
    }

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
    const newHeight = Math.min(textarea.scrollHeight, 120)
    textarea.style.height = `${newHeight}px`

    // Adjust window height in compact mode to accommodate multi-line text
    if (!isExpanded) {
      // Add padding for the input container (p-2 = 8px * 2 = 16px)
      const windowHeight = Math.max(COMPACT_HEIGHT, newHeight + 20)
      appWindow.setSize(new LogicalSize(WINDOW_WIDTH, windowHeight))
    }

    // Reset inactivity timer on user interaction
    resetInactivityTimer()
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    // console.log('[APP DEBUG] Messages updated:', messages.length, 'messages');
    // messages.forEach((msg, i) => {
    //   console.log(`[APP DEBUG] Message ${i}:`, {
    //     id: msg.id,
    //     role: msg.role,
    //     contentLength: msg.content.length,
    //     contentPreview: msg.content.substring(0, 50),
    //     isStreaming: msg.isStreaming
    //   });
    // });
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to interrupt query when loading, or close window if not loading
      if (e.key === 'Escape') {
        e.preventDefault()
        if (isLoading) {
          interruptQuery()
          resetInactivityTimer()
        } else {
          // Close/hide the window
          appWindow.hide()
        }
        return
      }

      // Cmd+N (Mac) or Ctrl+N (Windows/Linux) to clear chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        if (messages.length > 0) {
          clearInProgressRef.current = true
          clearHistory()
          setTimeout(() => {
            clearInProgressRef.current = false
          }, 100)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [messages.length, clearHistory, isLoading, interruptQuery, resetInactivityTimer])

  const handleConversationSelect = (id: string) => {
    // Clear messages immediately to avoid showing stale data
    clearInProgressRef.current = true
    setCurrentConversationId(id)
    // Clear the current messages to show a clean slate while loading
    // The actual messages will be loaded by Conversations component via loadMessages callback
    loadMessages([])
    resetInactivityTimer()
    // Reset guard after React's state updates settle
    setTimeout(() => {
      clearInProgressRef.current = false
    }, 100)
  }

  const handleNewConversation = () => {
    clearInProgressRef.current = true
    setCurrentConversationId(undefined)
    setShouldAutoCompact(false)
    clearHistory()
    resetInactivityTimer()
    // Reset guard after React's state updates settle
    setTimeout(() => {
      clearInProgressRef.current = false
    }, 100)
  }

  return (
    <div
      className={cn(
        "flex flex-col h-screen text-foreground overflow-hidden",
        isExpanded && "bg-background rounded-sm",
        isDragging && "ring-4 ring-primary ring-inset"
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Navigation
        isOpen={showNavigation}
        onClose={() => {
          console.log('[DEBUG] Navigation closing')
          setShowNavigation(false)
          resetInactivityTimer()
          // Restore focus to textarea after closing sidebar
          setTimeout(() => {
            textareaRef.current?.focus()
          }, 100)
        }}
        theme={theme}
        onThemeToggle={toggleTheme}
        currentConversationId={currentConversationId}
        onConversationSelect={handleConversationSelect}
        onNewConversation={handleNewConversation}
        onLoadMessages={loadMessages}
        conversationVersionRef={conversationVersionRef}
        preventAutoCompact={() => setShouldAutoCompact(false)}
        logs={logs}
        onClearLogs={clearLogs}
      />

      {isExpanded && (
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background" data-tauri-drag-region>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              console.log('[DEBUG] Opening navigation, current inputValue:', inputValue.substring(0, 50))
              setShowNavigation(true)
              resetInactivityTimer()
            }}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                isPinned && "text-primary"
              )}
              onClick={async () => {
                const newPinnedState = !isPinned
                await appWindow.setAlwaysOnTop(newPinnedState)
                setIsPinned(newPinnedState)
                resetInactivityTimer()
              }}
              aria-label={isPinned ? "Unpin window" : "Pin window on top"}
              title={isPinned ? "Unpin window" : "Pin window on top"}
            >
              <Pin size={16} className={cn(isPinned && "fill-current")} />
            </Button>
            <span className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              isAgentReady ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            )}>
              {isAgentReady ? '●' : '○'} {isAgentReady ? 'Ready' : 'Starting...'}
            </span>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearInProgressRef.current = true
                  setShouldAutoCompact(false)
                  clearHistory()
                  resetInactivityTimer()
                  // Reset guard after React's state updates settle
                  setTimeout(() => {
                    clearInProgressRef.current = false
                  }, 100)
                }}
                aria-label="Clear conversation history"
              >
                <Trash2 size={16} className="mr-1.5" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      <ScrollArea
        className="flex-1 px-4"
        style={{ display: isExpanded ? 'block' : 'none' }}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <h2 className="text-sm font-semibold mb-4">What can I help you with?</h2>
            <div className="text-muted-foreground space-y-2 mb-6">
              <p>I can help you:</p>
              <ul className="text-sm space-y-1">
                <li>List, read, and write files</li>
                <li>Search for files</li>
                <li>Run shell commands</li>
                <li>Get system information</li>
                <li>And more!</li>
              </ul>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Enter to send • Shift+Enter for new line</p>
              <p>Cmd+Shift+Space to toggle • Cmd+N to clear</p>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex animate-fadeIn",
                  msg.role === 'user' && "justify-end",
                  msg.role === 'assistant' && "justify-start"
                )}
              >
                {msg.role === 'assistant' ? (
                  // Assistant messages: No card wrapper, just content
                  <div
                    className="max-w-[85%] text-sm"
                    role="article"
                    aria-label="Assistant message"
                  >
                    {msg.error ? (
                      <div className="flex items-start gap-2 p-2 bg-destructive/10 text-destructive rounded border-l-4 border-destructive">
                        <strong className="font-semibold">Error:</strong>
                        <span>{msg.error}</span>
                      </div>
                    ) : (
                      <>
                        {/* For messages WITH tools: show split content */}
                        {msg.hasTools ? (
                          <>
                            {/* 1. Show content BEFORE tools */}
                            {msg.contentBeforeTools && (
                              <div className="break-words mb-3">
                                <Markdown content={msg.contentBeforeTools} />
                              </div>
                            )}

                            {/* 2. Show expandable "Thinking" section for tool usage */}
                        {(() => {
                          const messageTools = toolCalls.filter(tc => tc.messageId === msg.id);
                          if (messageTools.length === 0) return null;

                          const isExpanded = expandedThinking.has(msg.id);
                          const runningTools = messageTools.filter(tc => tc.status === 'pending' || tc.status === 'running');
                          const completedTools = messageTools.filter(tc => tc.status === 'completed');

                          // Debug: Log tool status for troubleshooting
                          if (messageTools.length > 0 && runningTools.length > 0) {
                            console.log('[Thinking] Running tools:', runningTools.map(t => ({ name: t.name, status: t.status, input: t.input })));
                          }

                          return (
                            <Collapsible
                              open={isExpanded}
                              onOpenChange={(open) => {
                                setExpandedThinking(prev => {
                                  const next = new Set(prev);
                                  if (open) {
                                    next.add(msg.id);
                                  } else {
                                    next.delete(msg.id);
                                  }
                                  return next;
                                });
                              }}
                              className="mb-3"
                            >
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                                >
                                  <AssistantIcon
                                    size={16}
                                    className={cn(runningTools.length > 0 && "animate-pulse")}
                                  />
                                  {/* Current tool description and elapsed time */}
                                  <span className="text-xs flex-1 text-left max-w-[264px] truncate">
                                    {runningTools.length > 0 ? (
                                      <>
                                        {(() => {
                                          // Get the most recently started running tool (last in array)
                                          const currentTool = runningTools[runningTools.length - 1];
                                          // Generate description for current running tool
                                          if (currentTool.input?.description) {
                                            return currentTool.input.description;
                                          }
                                          switch (currentTool.name) {
                                            case 'Bash':
                                              return currentTool.input?.description || `Running command: ${currentTool.input?.command || 'unknown'}`;
                                            case 'Read':
                                              return `Reading ${currentTool.input?.file_path || 'file'}`;
                                            case 'Write':
                                              return `Writing to ${currentTool.input?.file_path || 'file'}`;
                                            case 'Edit':
                                              return `Editing ${currentTool.input?.file_path || 'file'}`;
                                            case 'Glob':
                                              return `Finding files matching "${currentTool.input?.pattern || '*'}"`;
                                            case 'Grep':
                                              return `Searching for "${currentTool.input?.pattern || 'text'}"`;
                                            case 'WebSearch':
                                              return `Searching for "${currentTool.input?.query || 'information'}"`;
                                            case 'WebFetch':
                                              return `Fetching ${currentTool.input?.url || 'webpage'}`;
                                            default:
                                              return `Using ${currentTool.name}`;
                                          }
                                        })()}
                                        {(() => {
                                          const currentTool = runningTools[runningTools.length - 1];
                                          // Calculate elapsed time from startTime if available, otherwise use backend value
                                          const elapsedSeconds = currentTool.startTime
                                            ? Math.floor((Date.now() - currentTool.startTime) / 1000)
                                            : currentTool.elapsedSeconds;

                                          if (elapsedSeconds !== undefined) {
                                            return <> • {elapsedSeconds}s</>;
                                          }
                                          return null;
                                        })()}
                                      </>
                                    ) : (
                                      <>Completed</>
                                    )}
                                  </span>
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 transition-transform",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-1 max-h-[300px] overflow-y-auto overflow-x-hidden">
                                {/* Tool steps in natural language */}
                                {messageTools.map(tc => {
                                  const isRunning = tc.status === 'pending' || tc.status === 'running';
                                  // Generate natural language description
                                  const getDescription = () => {
                                    // If tool input has a description field, use it
                                    if (tc.input?.description) {
                                      return tc.input.description;
                                    }
                                    // Otherwise generate based on tool name and input
                                    switch (tc.name) {
                                      case 'Bash':
                                        return tc.input?.description || `Running command: ${tc.input?.command || 'unknown'}`;
                                      case 'Read':
                                        return `Reading ${tc.input?.file_path || 'file'}`;
                                      case 'Write':
                                        return `Writing to ${tc.input?.file_path || 'file'}`;
                                      case 'Edit':
                                        return `Editing ${tc.input?.file_path || 'file'}`;
                                      case 'Glob':
                                        return `Finding files matching "${tc.input?.pattern || '*'}"`;
                                      case 'Grep':
                                        return `Searching for "${tc.input?.pattern || 'text'}"`;
                                      case 'WebSearch':
                                        return `Searching for "${tc.input?.query || 'information'}"`;
                                      case 'WebFetch':
                                        return `Fetching ${tc.input?.url || 'webpage'}`;
                                      default:
                                        return `Using ${tc.name}`;
                                    }
                                  };

                                  return (
                                    <div key={tc.id} className="flex items-start gap-2 text-sm py-1">
                                      {/* State icon */}
                                      {isRunning ? (
                                        <Clock size={14} className="text-muted-foreground mt-0.5 flex-shrink-0 animate-pulse" />
                                      ) : tc.result && !tc.result.error ? (
                                        <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <XCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                                      )}
                                      <span className={cn(
                                        "flex-1",
                                        isRunning ? "text-muted-foreground" : "text-foreground"
                                      )}>
                                        {getDescription()}
                                      </span>
                                      {isRunning && (() => {
                                        // Calculate elapsed time from startTime if available, otherwise use backend value
                                        const elapsedSeconds = tc.startTime
                                          ? (Date.now() - tc.startTime) / 1000
                                          : tc.elapsedSeconds;

                                        if (elapsedSeconds !== undefined) {
                                          return (
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                              {elapsedSeconds.toFixed(1)}s
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  );
                                })}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })()}

                            {/* 3. Show content AFTER tools */}
                            {msg.contentAfterTools && (
                              <div className="break-words">
                                <Markdown content={msg.contentAfterTools} />
                                {msg.isStreaming && <span className="animate-blink ml-0.5" aria-label="Streaming">▊</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          /* For messages WITHOUT tools: show full content */
                          <div className="break-words">
                            <Markdown content={msg.content} />
                            {msg.isStreaming && <span className="animate-blink ml-0.5" aria-label="Streaming">▊</span>}
                          </div>
                        )}
                        {/* Show images if present */}
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {msg.images.map((img, idx) => (
                              <img
                                key={idx}
                                src={`data:${img.mimeType};base64,${img.data}`}
                                alt={img.name || `Image ${idx + 1}`}
                                className="max-w-full rounded border"
                                title={img.name || `Image ${idx + 1}`}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  // User messages: Keep the card bubble
                  <Card
                    className="max-w-[85%] p-3 text-sm bg-primary text-primary-foreground"
                    role="article"
                    aria-label="Your message"
                  >
                    {msg.error ? (
                      <div className="flex items-start gap-2 p-2 bg-destructive/10 text-destructive rounded border-l-4 border-destructive">
                        <strong className="font-semibold">Error:</strong>
                        <span>{msg.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className="break-words whitespace-pre-wrap">{msg.content}</div>
                        {/* Show images if present */}
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {msg.images.map((img, idx) => (
                              <img
                                key={idx}
                                src={`data:${img.mimeType};base64,${img.data}`}
                                alt={img.name || `Image ${idx + 1}`}
                                className="max-w-full rounded border"
                                title={img.name || `Image ${idx + 1}`}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                )}
              </div>
            ))}
            {/* Show animated Assistant icon when loading and no assistant response yet */}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="flex items-center justify-start">
                <AssistantIcon size={32} className="animate-pulse text-muted-foreground" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className="relative flex flex-col">
        {(pastedImages.length > 0 || isLoadingImages) && (
          <Card className="m-2 py-2">
            <div className="flex gap-2 flex-wrap items-center">
              {pastedImages.map((img, index) => (
                <div key={index} className="relative group">
                  <img
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt={img.name || 'Pasted image'}
                    className="w-20 h-20 object-cover rounded border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 opacity-100 transition-opacity"
                    onClick={() => removeImage(index)}
                    aria-label="Remove image"
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
              {isLoadingImages && (
                <div className="flex items-center justify-center w-20 h-20 border rounded bg-muted">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </Card>
        )}
        {/* @mention agent autocomplete menu */}
        {showAgentMenu && filteredAgents.length > 0 && (
          <AgentAutocomplete
            agents={filteredAgents}
            selectedIndex={selectedAgentIndex}
            onSelect={(agent) => {
              const newValue = inputValue.replace(/@\w*$/, `@${agent.name} `)
              setInputValue(newValue)
              setShowAgentMenu(false)
              const textarea = document.querySelector('textarea')
              if (textarea) {
                textarea.focus()
                textarea.setSelectionRange(newValue.length, newValue.length)
              }
            }}
            position="top"
          />
        )}
        {/* Slash command autocomplete menu */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <Card className="absolute bottom-full left-3 right-3 mb-1 z-50 max-h-64 overflow-auto" ref={slashMenuRef}>
            <div className="p-1">
              {filteredCommands.map((cmd, index) => (
                <div
                  key={cmd.command}
                  className={cn(
                    "flex flex-col items-start gap-1 px-3 py-2 rounded cursor-pointer transition-colors",
                    index === selectedCommandIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  )}
                  onClick={() => selectCommand(cmd.command)}
                  onMouseEnter={() => setSelectedCommandIndex(index)}
                >
                  <div className="font-semibold font-mono text-sm">{cmd.command}</div>
                  <div className="text-sm text-muted-foreground">{cmd.description}</div>
                  {cmd.example && (
                    <div className="text-sm font-mono text-muted-foreground italic mt-0.5">
                      {cmd.example}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
        <div
          className={cn(
            isExpanded ? "p-3" : "p-2",
            "relative flex items-center gap-2"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFilePicker}
            disabled={!isAgentReady || isLoading || isPickingFile || isLoadingImages}
            aria-label="Attach image"
            className="absolute left-5 top-1/2 -translate-y-1/2 h-8 w-8 z-10 hover:bg-transparent active:bg-transparent"
          >
            <Paperclip size={16} />
          </Button>
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isExpanded ? (isLoadingImages ? "Loading images..." : isAgentReady ? "Type a message or paste an image..." : "Starting agent...") : "Assistant"}
            disabled={!isAgentReady || isLoading || isLoadingImages}
            className={cn(
              "min-h-[42px] max-h-[120px] resize-none overflow-y-auto",
              "rounded-[21px] px-4 flex-1",
              isLoading && "pr-12",
              "pl-10"  // Add padding for the paperclip icon
            )}
            rows={1}
            aria-label="Message input"
          />
          {isLoading && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-5 top-1/2 -translate-y-1/2 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                interruptQuery()
                resetInactivityTimer()
              }}
              aria-label="Stop generating"
              title="Stop (Esc)"
            >
              <StopCircle size={20} />
            </Button>
          )}
        </div>
    </div>
  </div>
  )
}

export default App
