# 05 - Web UI (React + Tauri + shadcn/ui)

## Overview

The web UI is a React 18 application rendered in Tauri's webview, providing a modern chat interface with image upload, markdown rendering, and conversation management. Built with TypeScript, Tailwind CSS, and shadcn/ui components.

**Key Features:**
- 📸 **Image Upload** - 3 methods: paste (Cmd+V), file picker (📎), drag-and-drop
- 📏 **Dynamic Compact Mode** - 60-140px adaptive height in compact view
- 📱 **Responsive Chat UI** - ChatGPT-style clean interface (no bubbles for AI)
- 🎨 **shadcn/ui Components** - Radix UI primitives with Tailwind
- 📝 **Markdown Rendering** - react-markdown with remark-gfm
- 💾 **Conversation Persistence** - SQLite-backed chat history
- ⌨️ **Keyboard Shortcuts** - ESC (interrupt/close), Cmd+N (clear), etc.
- 🎯 **Slash Commands** - `/help`, `/reset`, `/session` autocomplete

**Tech Stack:**
- **UI Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS 3.4
- **Components:** shadcn/ui (Radix UI + Tailwind)
- **Markdown:** react-markdown + remark-gfm
- **Icons:** lucide-react
- **State:** React useState (no Zustand)
- **IPC:** Tauri `invoke()` + `listen()` events
- **Window Management:** `@tauri-apps/api/window`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 React UI (Tauri WebView)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              App.tsx (Monolithic)                  │    │
│  │                                                     │    │
│  │  - State management (useState hooks)               │    │
│  │  - Window resizing (compact ↔ expanded)            │    │
│  │  - Image upload handlers (3 methods)               │    │
│  │  - Keyboard shortcuts (ESC, Cmd+N, etc.)           │    │
│  │  - Inactivity timer (5 min auto-compact)           │    │
│  └────────────────┬────────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼────────────────────────────────────┐   │
│  │         Custom Hooks                                │   │
│  │                                                      │   │
│  │  useAgent() - Message handling, tool calls, IPC    │   │
│  │  useAgentLogs() - Debug log collection             │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                          │
│  ┌────────────────▼────────────────────────────────────┐   │
│  │         Components                                  │   │
│  │                                                      │   │
│  │  Navigation.tsx - Sidebar (conversations, settings)│   │
│  │  Markdown.tsx - react-markdown wrapper             │   │
│  │  ToolResult.tsx - Tool execution display           │   │
│  │  ui/* - shadcn/ui primitives (Button, Card, etc.)  │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                          │
│  ┌────────────────▼────────────────────────────────────┐   │
│  │         Tauri IPC Bridge                            │   │
│  │                                                      │   │
│  │  invoke('send_to_agent', ...)                      │   │
│  │  invoke('send_interrupt')                          │   │
│  │  invoke('open_image_picker')                       │   │
│  │  listen('agent_response', ...)                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Future Enhancements (Planned):**
```
┌─────────────────────────────────────────────────────────────┐
│  🔮 FUTURE: Enhanced UI Features                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Real-time Conversation Title Updates                    │
│     - Dynamic titles from first message                     │
│     - Claude-generated titles (background)                  │
│                                                              │
│  2. Search & Filter                                          │
│     - Full-text search across conversations                 │
│     - Tag/label system                                       │
│     - Date range filters                                     │
│                                                              │
│  3. Voice Input/Output                                       │
│     - Groq Whisper for speech-to-text                       │
│     - ElevenLabs for text-to-speech                         │
│     - Waveform visualization                                │
│                                                              │
│  4. Terminal Sidebar                                         │
│     - Embedded terminal (xterm.js)                          │
│     - Command history                                        │
│     - Output streaming                                       │
│                                                              │
│  5. Memory Visualization                                     │
│     - Vector DB search results                              │
│     - Semantic similarity graph                             │
│     - Memory timeline                                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## File Structure

**Actual Structure (Monolithic Pattern):**

```
apps/tauri-shell/src/
├── App.tsx                  # Main app (900+ lines, all logic)
├── main.tsx                 # Entry point
├── types.ts                 # TypeScript interfaces
├── useAgent.ts              # Agent IPC hook
├── useAgentLogs.ts          # Debug logging hook
├── components/
│   ├── Conversations.tsx    # Sidebar conversation list
│   ├── Navigation.tsx       # Settings panel + theme toggle
│   ├── Markdown.tsx         # react-markdown wrapper
│   ├── ToolResult.tsx       # Tool call display
│   └── ui/                  # shadcn/ui components (15+)
│       ├── button.tsx
│       ├── card.tsx
│       ├── textarea.tsx
│       ├── scroll-area.tsx
│       └── ...
├── lib/
│   ├── utils.ts             # cn() helper, etc.
│   └── accessibility.ts     # ARIA utilities
└── styles.css               # Global Tailwind + custom animations
```

**Note:** Unlike typical React apps with many small components, this uses a **monolithic App.tsx** pattern. All state management, event handlers, and UI logic live in one file for:
- ✅ Simplicity (no prop drilling)
- ✅ Performance (fewer re-renders)
- ✅ Direct window API access
- ✅ Centralized state

---

## State Management (React Hooks, No Zustand)

**Pattern:** Local state with `useState`, no external store.

**apps/tauri-shell/src/App.tsx:**

```typescript
function App() {
  // Message & chat state
  const [inputValue, setInputValue] = useState('')
  const [pastedImages, setPastedImages] = useState<ImageAttachment[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>()

  // UI state
  const [isExpanded, setIsExpanded] = useState(false)
  const [showNavigation, setShowNavigation] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('theme') as 'light' | 'dark' || 'light'
  })

  // Loading states
  const [isPickingFile, setIsPickingFile] = useState(false)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Auto-compact state
  const [shouldAutoCompact, setShouldAutoCompact] = useState(true)

  // Refs for imperative operations
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const clearInProgressRef = useRef(false)

  // Custom hooks
  const { messages, toolCalls, isAgentReady, isLoading, sendMessage, clearHistory, loadMessages, interruptQuery } = useAgent(callbacks)
  const { logs, clearLogs } = useAgentLogs()

  // ... rest of component
}
```

**Why No Zustand?**
- Window-specific state (expanded, pinned, theme) doesn't need global store
- Single-window app (no state sharing across windows)
- Direct component-to-Tauri communication via hooks
- Simpler mental model for desktop app

---

## Image Upload (3 Methods)

**Implemented in Sessions 30-33**, this is a key feature with three input methods:

### Method 1: Paste (Cmd+V)

**apps/tauri-shell/src/App.tsx:233-296**

```typescript
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
      // Validate file size (10MB limit)
      if (file.size > MAX_IMAGE_SIZE) {
        alert(`Image "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`)
        continue
      }

      try {
        const base64Data = await readFileAsBase64(file)
        newImages.push({
          data: base64Data,
          mimeType: file.type,
          name: `pasted-image-${Date.now()}.${file.type.split('/')[1]}`
        })
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
```

**Attached to:** Textarea's `onPaste` handler

### Method 2: File Picker (📎 Button)

**apps/tauri-shell/src/App.tsx:303-340**

```typescript
const handleFilePicker = async () => {
  try {
    setIsPickingFile(true)

    // Invoke Tauri command (opens macOS NSOpenPanel)
    const filePath = await invoke<string | null>('open_image_picker')
    if (!filePath) return

    // Read image via Tauri (bypasses web sandbox)
    const imageData = await invoke<{ data: string; mime_type: string; name: string }>(
      'read_image_as_base64',
      { path: filePath }
    )

    setPastedImages(prev => [...prev, {
      data: imageData.data,
      mimeType: imageData.mime_type,
      name: imageData.name,
    }])

    resetInactivityTimer()
  } catch (error) {
    console.error('Failed to pick image:', error)
  } finally {
    setIsPickingFile(false)
  }
}
```

**UI:** Paperclip button positioned absolutely inside textarea (left side)

### Method 3: Drag-and-Drop

**apps/tauri-shell/src/App.tsx:362-417**

```typescript
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
        alert(`Image "${file.name}" is too large...`)
        continue
      }

      const base64Data = await readFileAsBase64(file)
      newImages.push({
        data: base64Data,
        mimeType: file.type,
        name: file.name,
      })
    }

    if (newImages.length > 0) {
      setPastedImages(prev => [...prev, ...newImages])
    }
  } finally {
    setIsLoadingImages(false)
    resetInactivityTimer()
  }
}
```

**UI:** Ring border appears when dragging over window

**Critical Fix (Session 33):** Disabled Tauri's native `fileDrop` in `tauri.conf.json` to allow HTML5 drag events to reach React.

### Helper: FileReader Promise Wrapper

**apps/tauri-shell/src/App.tsx:43-57**

```typescript
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
```

**Session 31 Fix:** Converted synchronous FileReader to async/await pattern to prevent crashes.

### Image Preview UI

**apps/tauri-shell/src/App.tsx:779-806**

```typescript
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
            className="absolute -top-2 -right-2 h-6 w-6 opacity-100"
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
```

**Features:**
- Thumbnail previews (80×80px)
- Remove button (always visible, changed in Session 35)
- Loading spinner (Loader2 from lucide-react)
- Multiple images side-by-side

---

## Compact Mode (Dynamic Height)

**Session 19 + Session 35 Enhancement**

### Window Sizes

```typescript
const COMPACT_HEIGHT = 60  // Minimal height (input only)
const EXPANDED_HEIGHT = 600
const WINDOW_WIDTH = 365
const INACTIVITY_TIMEOUT = 5 * 60 * 1000  // 5 minutes
```

### Expansion Animation

**apps/tauri-shell/src/App.tsx:119-143**

```typescript
const expandWindow = async () => {
  const startHeight = COMPACT_HEIGHT
  const endHeight = EXPANDED_HEIGHT
  const startTime = Date.now()

  const animate = async () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1)

    // Ease-out cubic for smooth deceleration
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
```

**Smooth 200ms slide-up animation** with cubic easing.

### Dynamic Height in Compact Mode (Session 35)

**apps/tauri-shell/src/App.tsx:477-488**

```typescript
const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const value = e.target.value
  setInputValue(value)

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

  resetInactivityTimer()
}
```

**Result:** Window grows from 60px to 140px as user types multi-line input.

### Auto-Compact Timer

**apps/tauri-shell/src/App.tsx:150-166**

```typescript
const resetInactivityTimer = useCallback(() => {
  if (inactivityTimerRef.current) {
    clearTimeout(inactivityTimerRef.current)
  }

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
```

**Triggers that reset timer:**
- User input
- Theme toggle
- Navigation interactions
- Image upload
- Any user activity

---

## Chat UI (ChatGPT-Style)

**Session 35 Redesign:** Removed chat bubbles from AI responses for cleaner, more modern look.

### Message Rendering

**apps/tauri-shell/src/App.tsx:676-758**

```typescript
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
      // Assistant: No card wrapper, just content
      <div className="max-w-[85%] text-sm">
        <div className="break-words">
          <Markdown content={msg.content} />
          {msg.isStreaming && <span className="animate-blink ml-0.5">▊</span>}
        </div>

        {/* Show images if present */}
        {msg.images && msg.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {msg.images.map((img, idx) => (
              <img
                key={idx}
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={img.name || `Image ${idx + 1}`}
                className="max-w-full rounded border"
              />
            ))}
          </div>
        )}

        {/* Tool calls */}
        {toolCalls.filter(tc => tc.id.includes(msg.id)).map(tc => (
          <ToolResult key={tc.id} toolCall={tc} />
        ))}
      </div>
    ) : (
      // User: Keep card bubble
      <Card className="max-w-[85%] p-3 text-sm bg-primary text-primary-foreground">
        <div className="break-words whitespace-pre-wrap">{msg.content}</div>
        {/* User images... */}
      </Card>
    )}
  </div>
))}
```

**Design:**
- ✅ **Assistant messages:** Plain text, no background (clean)
- ✅ **User messages:** Primary-colored card bubbles (clear distinction)
- ✅ **Markdown:** Rendered via `<Markdown>` component
- ✅ **Streaming cursor:** Blinking `▊` character
- ✅ **Tool results:** Collapsible cards below message
- ✅ **Images:** Displayed inline with messages

### Markdown Component

**apps/tauri-shell/src/components/Markdown.tsx**

```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Custom renderers for code blocks, tables, etc.
        code: ({ node, inline, className, children, ...props }) => {
          // Syntax highlighting, copy button, etc.
        },
        // ... other custom components
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

**Features:**
- ✅ GitHub Flavored Markdown (tables, strikethrough, task lists)
- ✅ Code syntax highlighting
- ✅ Copy-to-clipboard buttons
- ✅ Responsive table scrolling

---

## Keyboard Shortcuts

**apps/tauri-shell/src/App.tsx:500-530**

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // ESC - Dual purpose (Session 35)
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isLoading) {
        interruptQuery()  // Interrupt query when loading
        resetInactivityTimer()
      } else {
        appWindow.hide()  // Close window when idle
      }
      return
    }

    // Cmd+N (Mac) or Ctrl+N (Windows/Linux) - Clear chat
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
}, [messages.length, clearHistory, isLoading, interruptQuery])
```

### Supported Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| **ESC** | Interrupt query | When loading |
| **ESC** | Hide window | When idle |
| **Cmd+N** | Clear conversation | Anytime |
| **Cmd+Shift+Space** | Toggle window | Global (registered in Rust) |
| **Enter** | Send message | In textarea |
| **Shift+Enter** | New line | In textarea |
| **Tab** | Autocomplete slash command | In slash menu |
| **↑↓** | Navigate slash commands | In slash menu |

---

## Slash Commands

**apps/tauri-shell/src/App.tsx:31-37**

```typescript
const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', description: 'Show available commands' },
  { command: '/reset', description: 'Reset conversation and start fresh' },
  { command: '/clear', description: 'Clear conversation history (alias for /reset)' },
  { command: '/session', description: 'Show current session information' },
  { command: '/ultrathink', description: 'Enable extended thinking mode', example: '/ultrathink [your prompt]' },
]
```

### Autocomplete Menu

**apps/tauri-shell/src/App.tsx:808-833**

```typescript
{showSlashMenu && filteredCommands.length > 0 && (
  <Card className="absolute bottom-full left-3 right-3 mb-1 z-50 max-h-64 overflow-auto">
    <div className="p-1">
      {filteredCommands.map((cmd, index) => (
        <div
          key={cmd.command}
          className={cn(
            "flex flex-col items-start gap-1 px-3 py-2 rounded cursor-pointer",
            index === selectedCommandIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
          onClick={() => selectCommand(cmd.command)}
        >
          <div className="font-semibold font-mono text-sm">{cmd.command}</div>
          <div className="text-sm text-muted-foreground">{cmd.description}</div>
          {cmd.example && (
            <div className="text-sm font-mono text-muted-foreground italic">
              {cmd.example}
            </div>
          )}
        </div>
      ))}
    </div>
  </Card>
)}
```

**Features:**
- Shows when typing `/` in textarea
- Filters based on typed text
- Keyboard navigation (↑↓ arrows, Tab)
- Click to select
- ESC to dismiss

---

## shadcn/ui Integration

**Installed Components (Session 21):**

```
apps/tauri-shell/src/components/ui/
├── avatar.tsx           # Radix UI Avatar
├── badge.tsx            # Status badges
├── button.tsx           # Radix UI Button
├── card.tsx             # Containers
├── collapsible.tsx      # Expandable sections
├── command.tsx          # Command palette (future)
├── dialog.tsx           # Modal dialogs
├── dropdown-menu.tsx    # Context menus
├── input.tsx            # Text inputs
├── scroll-area.tsx      # Custom scrollbars
├── separator.tsx        # Dividers
├── sheet.tsx            # Slide-out panels
├── skeleton.tsx         # Loading placeholders
├── tabs.tsx             # Tab navigation
├── textarea.tsx         # Multi-line input
├── toast.tsx            # Notifications
└── toaster.tsx          # Toast container
```

**Configuration:**

**apps/tauri-shell/components.json:**
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/styles.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Tailwind Config:**

**apps/tauri-shell/tailwind.config.js:**
```javascript
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... more semantic colors
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-in',
        blink: 'blink 1s step-end infinite',
        thinkingDot1: 'thinkingDot 1.4s infinite 0s',
        thinkingDot2: 'thinkingDot 1.4s infinite 0.2s',
        thinkingDot3: 'thinkingDot 1.4s infinite 0.4s',
      },
    },
  },
}
```

**CSS Variables (Theme Support):**

**apps/tauri-shell/src/styles.css:**
```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    /* ... more variables */
  }

  [data-theme="dark"] {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    /* ... more dark mode variables */
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

@keyframes thinkingDot {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}
```

---

## useAgent Hook (IPC Bridge)

**apps/tauri-shell/src/useAgent.ts**

```typescript
export function useAgent(callbacks?: { onConversationCleared?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [isAgentReady, setIsAgentReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const conversationVersionRef = useRef(0)

  // Initialize agent on mount
  useEffect(() => {
    const initAgent = async () => {
      await invoke('spawn_agent')
    }
    initAgent()
  }, [])

  // Listen to agent responses
  useEffect(() => {
    const unlisten = listen<AgentResponse>('agent_response', (event) => {
      const response = event.payload

      if (response.type === 'ready') {
        setIsAgentReady(true)
        return
      }

      if (response.type === 'token') {
        // Append to last assistant message or create new one
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id === response.id) {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + response.token, isStreaming: true }
            ]
          } else {
            return [
              ...prev,
              { id: response.id, role: 'assistant', content: response.token, timestamp: response.timestamp, isStreaming: true }
            ]
          }
        })
        return
      }

      if (response.type === 'tool_use') {
        setToolCalls((prev) => [
          ...prev,
          { id: response.data.tool_use_id, name: response.data.tool_name, input: response.data.tool_input, timestamp: response.timestamp }
        ])
        return
      }

      if (response.type === 'done') {
        // Mark last message as not streaming
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg && lastMsg.isStreaming) {
            return [...prev.slice(0, -1), { ...lastMsg, isStreaming: false }]
          }
          return prev
        })
        setIsLoading(false)
        return
      }

      if (response.type === 'error') {
        setMessages((prev) => [...prev, { id: response.id, role: 'system', content: '', error: response.error, timestamp: response.timestamp }])
        setIsLoading(false)
        return
      }
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

  const sendMessage = async (message: string, images?: ImageAttachment[]) => {
    // Add user message immediately
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now(), images }])
    setIsLoading(true)

    // Send to agent via Tauri IPC
    await invoke('send_to_agent', {
      message,
      images: images && images.length > 0 ? JSON.stringify(images) : undefined
    })
  }

  const clearHistory = async () => {
    conversationVersionRef.current++
    await invoke('clear_history')
    setMessages([])
    setToolCalls([])
    setIsLoading(false)
    callbacks?.onConversationCleared?.()
  }

  const interruptQuery = async () => {
    await invoke('send_interrupt')
  }

  const loadMessages = (msgs: Message[]) => {
    conversationVersionRef.current++
    setMessages(msgs)
    setToolCalls([])
  }

  return { messages, toolCalls, isAgentReady, isLoading, sendMessage, clearHistory, loadMessages, interruptQuery, conversationVersionRef }
}
```

**Key Features:**
- ✅ Tauri `invoke()` for commands (send_to_agent, spawn_agent, etc.)
- ✅ Tauri `listen()` for streaming responses
- ✅ Conversation versioning (prevents stale responses)
- ✅ Automatic message accumulation
- ✅ Tool call tracking
- ✅ Loading state management

---

## Conversation Persistence

**apps/tauri-shell/src/components/Conversations.tsx** (simplified):

```typescript
export function Conversations({
  currentConversationId,
  onConversationSelect,
  onLoadMessages,
  conversationVersionRef
}: ConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      const result = await invoke<{ conversations: Conversation[] }>('list_conversations')
      setConversations(result.conversations)
    }
    loadConversations()
  }, [conversationVersionRef])

  const handleSelect = async (id: string) => {
    // Load conversation messages from database
    const result = await invoke<{ conversation: Conversation; messages: Message[] }>(
      'load_conversation',
      { conversationId: id }
    )

    // Pass to parent component
    onLoadMessages(result.messages)
    onConversationSelect(id)
  }

  return (
    <ScrollArea>
      {conversations.map(conv => (
        <div
          key={conv.id}
          className={cn(
            "p-3 cursor-pointer hover:bg-accent",
            currentConversationId === conv.id && "bg-accent"
          )}
          onClick={() => handleSelect(conv.id)}
        >
          <div className="font-medium truncate">{conv.title}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(conv.updated_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </ScrollArea>
  )
}
```

**Session 34 Fix:** Clear messages immediately when switching conversations to avoid showing stale data.

---

## Future Enhancements

### 1. Real-Time Conversation Titles

**Current:** Simple truncation of first message
**Future:** Claude-generated titles (background process)

```typescript
// Already implemented in sdk-adapter.ts!
private async generateDynamicTitle(userMessage: string, assistantMessage: string): Promise<void> {
  const response = await this.anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 50,
    temperature: 0.7,
    messages: [{
      role: 'user',
      content: `Generate a concise, descriptive title (5-10 words max) for this conversation...`
    }]
  })

  const title = response.content[0].text.trim()
  this.db.updateConversationTitle(this.currentConversationId, title)
}
```

**Status:** Implemented in backend, not yet reflected in UI

### 2. Search & Filter

**Planned Architecture:**
```typescript
// Full-text search via SQLite FTS5
const searchConversations = async (query: string) => {
  const results = await invoke<Conversation[]>('search_conversations', { query })
  return results
}

// Filter by date range
const filterByDate = async (startDate: Date, endDate: Date) => {
  const results = await invoke<Conversation[]>('filter_conversations', {
    start: startDate.toISOString(),
    end: endDate.toISOString()
  })
  return results
}
```

### 3. Voice Input/Output

**Documented in:** `docs/assistant-upgrades/voice-features.md`

**Tech Stack:**
- **Speech-to-Text:** Groq Whisper API
- **Text-to-Speech:** ElevenLabs API
- **UI:** Waveform visualization (wavesurfer.js)

**Integration Point:**
```typescript
const handleVoiceInput = async () => {
  // Start recording
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)

  // ... record audio

  // Send to Groq Whisper
  const transcription = await invoke('transcribe_audio', { audioData })
  setInputValue(transcription)
}
```

### 4. Terminal Sidebar

**Documented in:** `docs/08-terminal-sidebar.md`

**Tech Stack:**
- **Terminal Emulator:** xterm.js
- **Shell Integration:** Tauri command to spawn shell
- **Output Streaming:** Tauri events for stdout/stderr

**UI Layout:**
```
┌─────────────┬──────────────────┐
│             │                  │
│   Chat      │   Terminal       │
│   Messages  │   (xterm.js)     │
│             │                  │
└─────────────┴──────────────────┘
```

### 5. Memory Visualization

**Future Feature:** Visual representation of vector database search results

**Planned UI:**
```typescript
<MemoryPanel>
  <SemanticGraph nodes={memories} />
  <Timeline conversations={relatedConversations} />
  <SearchResults results={vectorSearchResults} />
</MemoryPanel>
```

---

## Testing

**Manual Testing Checklist:**

```bash
# Start dev server
cd apps/tauri-shell
pnpm tauri dev
```

**Test Cases:**
- [ ] Image upload (paste, picker, drag-drop)
- [ ] Compact mode auto-expand/collapse
- [ ] Dynamic height in compact mode (60-140px)
- [ ] ESC key dual purpose (interrupt vs close)
- [ ] Slash command autocomplete
- [ ] Conversation switching (no stale messages)
- [ ] Theme toggle (light/dark)
- [ ] Markdown rendering (code blocks, tables)
- [ ] Tool result display
- [ ] Streaming response with cursor
- [ ] Inactivity timer (5 min auto-compact)
- [ ] Keyboard shortcuts (Cmd+N, Enter, Shift+Enter)

**Integration Tests:**
```typescript
// apps/tauri-shell/src/__tests__/App.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  it('should handle image paste', async () => {
    const { container } = render(<App />)
    const textarea = screen.getByLabelText('Message input')

    // Simulate paste event with image
    const pasteEvent = createPasteEvent([mockImageFile])
    fireEvent.paste(textarea, pasteEvent)

    // Assert image appears in preview
    expect(await screen.findByAlt('Pasted image')).toBeInTheDocument()
  })

  it('should expand window on first message', async () => {
    // Test compact → expanded transition
  })
})
```

---

## Troubleshooting

**Images not uploading:**
- ✅ Check Tauri entitlements (Info.plist)
- ✅ Verify `open_image_picker` and `read_image_as_base64` commands exist
- ✅ Check file size (<10MB)
- ✅ Review browser console for FileReader errors

**Window not expanding:**
- ✅ Verify `@tauri-apps/api/window` import
- ✅ Check `appWindow.setSize()` permissions
- ✅ Review animation logic in `expandWindow()`

**Drag-and-drop not working:**
- ✅ Ensure `fileDropEnabled: false` in `tauri.conf.json`
- ✅ Check `onDragEnter/Over/Leave/Drop` handlers
- ✅ Verify event.preventDefault() and stopPropagation()

**Stale messages when switching conversations:**
- ✅ Ensure `loadMessages([])` called before loading new conversation
- ✅ Check `conversationVersionRef` increments correctly
- ✅ Verify `clearInProgressRef` guards are in place

**ESC key not working:**
- ✅ Check global keyboard event listener
- ✅ Verify `isLoading` state is accurate
- ✅ Ensure `appWindow.hide()` has permissions

**Slash commands not autocompleting:**
- ✅ Verify `showSlashMenu` state logic
- ✅ Check filter function for slash commands
- ✅ Review keyboard navigation handlers

---

## Best Practices

### 1. State Management
```typescript
// ✅ Good: Local state for window-specific UI
const [isExpanded, setIsExpanded] = useState(false)

// ❌ Bad: Global store for single-window app
const isExpanded = useStore(state => state.isExpanded)
```

### 2. Image Handling
```typescript
// ✅ Good: Async/await FileReader
const base64 = await readFileAsBase64(file)

// ❌ Bad: Synchronous FileReader (freezes UI)
reader.readAsDataURL(file)
const base64 = reader.result
```

### 3. Window Resizing
```typescript
// ✅ Good: Smooth animation with easing
const easeProgress = 1 - Math.pow(1 - progress, 3)

// ❌ Bad: Instant resize (jarring)
await appWindow.setSize(new LogicalSize(w, EXPANDED_HEIGHT))
```

### 4. Event Listeners
```typescript
// ✅ Good: Cleanup in useEffect return
useEffect(() => {
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])

// ❌ Bad: No cleanup (memory leak)
useEffect(() => {
  window.addEventListener('keydown', handler)
}, [])
```

### 5. Tauri IPC
```typescript
// ✅ Good: Use invoke() for commands
await invoke('send_to_agent', { message })

// ❌ Bad: Direct HTTP calls to localhost
await fetch('http://localhost:8080/agent', { ... })
```

---

## Next Steps

- Implement conversation search → [09-conversation-persistence.md](./09-conversation-persistence.md)
- Add voice features → [assistant-upgrades/voice-features.md](./assistant-upgrades/voice-features.md)
- Build terminal sidebar → [08-terminal-sidebar.md](./08-terminal-sidebar.md)
- Memory visualization → [10-memory-architecture.md](./10-memory-architecture.md)

---

## References

- [Tauri Window API](https://tauri.app/v1/api/js/window)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [react-markdown](https://github.com/remarkjs/react-markdown)
- [lucide-react Icons](https://lucide.dev/)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Tailwind CSS](https://tailwindcss.com/)
