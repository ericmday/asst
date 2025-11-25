# shadcn/ui Migration Plan - Desktop Assistant

## Overview

Comprehensive migration from 1445 lines of custom CSS to shadcn/ui + Tailwind CSS, focused on reducing maintenance burden, improving accessibility, and modernizing the UI with industry-standard components.

**Estimated Time:** 12-16 hours across 4 sessions
**Expected Outcome:** 86% CSS reduction (1445 → ~200 lines), WCAG 2.1 AA compliance, modern component architecture

---

## Goals & Priorities

✅ **Reduce CSS maintenance burden** - Cut 1445 lines to ~200 lines
✅ **Improve accessibility** - ARIA labels, keyboard nav, screen reader support
✅ **Modernize UI** - Adopt shadcn/ui component library
✅ **Migrate chat UI** - Convert to shadcn Card components
✅ **Add advanced features** - Command palette, global keyboard shortcuts

---

## Phase 1: Foundation Setup (3-4 hours)

### 1.1 Install Dependencies

```bash
cd apps/tauri-shell

# Core Tailwind + PostCSS
pnpm add -D tailwindcss postcss autoprefixer
pnpm add -D @tailwindcss/typography  # For markdown styling
pnpm add -D tailwindcss-animate

# shadcn/ui dependencies
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-slot

# Initialize Tailwind
npx tailwindcss init -p

# Initialize shadcn/ui CLI
npx shadcn@latest init
```

**shadcn/ui configuration choices:**
- Style: **New York** (modern, professional for desktop app)
- Base color: **Slate** (neutral, matches current design)
- CSS variables: **Yes** (aligns with existing theme system)

### 1.2 Install shadcn Components

```bash
# Core UI components
npx shadcn@latest add button
npx shadcn@latest add input textarea
npx shadcn@latest add card scroll-area separator

# Navigation & layout
npx shadcn@latest add sheet tabs

# Advanced components
npx shadcn@latest add command  # For slash command palette
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu

# Utility components
npx shadcn@latest add badge avatar skeleton toast
npx shadcn@latest add collapsible
```

This creates `src/components/ui/` directory with all shadcn components.

### 1.3 Configure Tailwind

**File: `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],  // Support existing theme system
  content: [
    "./src/**/*.{ts,tsx}",
  ],
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
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        thinkingDot: {
          "0%, 20%": { opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s ease-in-out",
        blink: "blink 1s infinite",
        thinkingDot: "thinkingDot 1.4s infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
}
```

### 1.4 Replace styles.css

**File: `src/styles.css`**

Replace the entire 1445-line CSS file with shadcn theme system:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 210 100% 50%;  /* #007aff - iOS blue */
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;  /* Red for delete actions */
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 210 100% 50%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 11%;
    --foreground: 0 0% 98%;
    --card: 0 0% 11%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 11%;
    --popover-foreground: 0 0% 98%;
    --primary: 211 100% 52%;  /* #0a84ff - iOS dark blue */
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 17%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 17%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 17%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 22%;
    --input: 0 0% 22%;
    --ring: 211 100% 52%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Custom animations for chat UI */
@layer utilities {
  .animate-thinkingDot1 {
    animation: thinkingDot 1.4s 0s infinite;
  }
  .animate-thinkingDot2 {
    animation: thinkingDot 1.4s 0.2s infinite;
  }
  .animate-thinkingDot3 {
    animation: thinkingDot 1.4s 0.4s infinite;
  }
}
```

### 1.5 Update tsconfig.json

Add path alias for component imports:

```json
{
  "compilerOptions": {
    // ... existing config
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 1.6 Create Utility Files

**File: `src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**File: `src/lib/accessibility.ts`**

```ts
// Screen reader announcements
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div')
  announcement.setAttribute('role', 'status')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message

  document.body.appendChild(announcement)
  setTimeout(() => document.body.removeChild(announcement), 1000)
}

// Generate unique IDs for ARIA relationships
let idCounter = 0
export function useAriaId(prefix: string = 'aria') {
  return `${prefix}-${++idCounter}`
}
```

### 1.7 Test Foundation

Run the app to verify Tailwind is working without breaking existing styles:

```bash
pnpm dev
```

**Checkpoint:** App should still look and function identically at this stage.

---

## Phase 2: Core Components Migration (4-5 hours)

### 2.1 Header & Buttons (App.tsx)

**Migrate all buttons to shadcn Button component:**

```tsx
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Hamburger menu button
<Button
  variant="ghost"
  size="icon"
  onClick={() => setShowNavigation(true)}
  aria-label="Open menu"
>
  <Menu size={20} />
</Button>

// Clear history button
<Button
  variant="outline"
  size="sm"
  onClick={clearHistory}
  aria-label="Clear conversation history"
>
  <Trash2 size={16} className="mr-1.5" />
  Clear
</Button>

// Send message button
<Button
  onClick={handleSend}
  disabled={!isAgentReady || isLoading || (!inputValue.trim() && pastedImages.length === 0)}
  aria-label={isLoading ? "Sending message" : "Send message"}
>
  {isLoading ? 'Sending...' : (
    <>
      <Send size={16} className="mr-1.5" />
      Send
    </>
  )}
</Button>
```

**Update header layout with Tailwind:**

```tsx
<div className="flex items-center justify-between px-4 py-3 border-b bg-background">
  <Button variant="ghost" size="icon" onClick={() => setShowNavigation(true)} aria-label="Open menu">
    <Menu size={20} />
  </Button>

  <div className="flex items-center gap-3">
    <span className={cn(
      "flex items-center gap-1.5 text-sm font-medium",
      isAgentReady ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
    )}>
      {isAgentReady ? '●' : '○'} {isAgentReady ? 'Ready' : 'Starting...'}
    </span>

    {messages.length > 0 && (
      <Button variant="outline" size="sm" onClick={clearHistory} aria-label="Clear conversation history">
        <Trash2 size={16} className="mr-1.5" />
        Clear
      </Button>
    )}
  </div>
</div>
```

### 2.2 Navigation Drawer (Navigation.tsx)

**Migrate to shadcn Sheet + Tabs:**

```tsx
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export function Navigation({ isOpen, onClose, ... }: NavigationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('history')

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-80 p-0">
        <div className="flex flex-col h-full">
          {/* Header with tabs */}
          <div className="flex items-center justify-between p-3 border-b">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="flex-1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="history" className="gap-1.5">
                  <MessageSquare size={16} />
                  <span className="text-xs">History</span>
                </TabsTrigger>
                <TabsTrigger value="tools" className="gap-1.5">
                  <Wrench size={16} />
                  <span className="text-xs">Tools</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5">
                  <Settings size={16} />
                  <span className="text-xs">Settings</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab}>
              <TabsContent value="history" className="h-full m-0">
                <Conversations {...props} embedded={true} />
              </TabsContent>

              <TabsContent value="tools" className="h-full m-0 p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Available Tools</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Tools available for the assistant to use
                    </p>
                  </div>

                  <div className="space-y-2">
                    {/* Tool items */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                      <span className="text-2xl">📁</span>
                      <div>
                        <div className="font-medium text-sm">Filesystem</div>
                        <div className="text-xs text-muted-foreground">Read, write, and search files</div>
                      </div>
                    </div>
                    {/* More tool items... */}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="h-full m-0 p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-3">Appearance</h3>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div>
                        <div className="font-medium text-sm">Theme</div>
                        <div className="text-xs text-muted-foreground">
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
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

### 2.3 Input Area (App.tsx)

**Migrate to shadcn Textarea:**

```tsx
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"

// Image preview
{pastedImages.length > 0 && (
  <Card className="p-2 mb-2">
    <div className="flex gap-2 flex-wrap">
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
            className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => removeImage(index)}
            aria-label="Remove image"
          >
            <X size={14} />
          </Button>
        </div>
      ))}
    </div>
  </Card>
)}

// Input row
<div className="flex gap-2 p-3 border-t bg-background">
  <Textarea
    ref={textareaRef}
    value={inputValue}
    onChange={handleInputChange}
    onKeyDown={handleKeyDown}
    onPaste={handlePaste}
    placeholder={isAgentReady ? "Type a message or paste an image..." : "Starting agent..."}
    disabled={!isAgentReady || isLoading}
    className="min-h-[42px] max-h-[120px] resize-none"
    rows={1}
    aria-label="Message input"
  />
  <Button
    onClick={handleSend}
    disabled={!isAgentReady || isLoading || (!inputValue.trim() && pastedImages.length === 0)}
    aria-label={isLoading ? "Sending message" : "Send message"}
  >
    {isLoading ? 'Sending...' : (
      <>
        <Send size={16} className="mr-1.5" />
        Send
      </>
    )}
  </Button>
</div>
```

---

## Phase 3: Chat UI Migration (3-4 hours)

### 3.1 Message List with ScrollArea

```tsx
import { ScrollArea } from "@/components/ui/scroll-area"

<ScrollArea className="flex-1 px-4" role="log" aria-live="polite" aria-label="Chat messages">
  {messages.length === 0 ? (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <h2 className="text-2xl font-semibold mb-4">What can I help you with?</h2>
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
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Enter to send • Shift+Enter for new line</p>
        <p>Cmd+Shift+Space to toggle • Cmd+N to clear</p>
      </div>
    </div>
  ) : (
    <div className="py-4 space-y-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} toolCalls={toolCalls} />
      ))}

      {/* Thinking indicator */}
      {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
        <Card className="max-w-[85%] p-3 bg-muted">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Thinking</span>
            <span className="flex gap-1">
              <span className="animate-thinkingDot1">.</span>
              <span className="animate-thinkingDot2">.</span>
              <span className="animate-thinkingDot3">.</span>
            </span>
          </div>
        </Card>
      )}

      <div ref={messagesEndRef} />
    </div>
  )}
</ScrollArea>
```

### 3.2 Message Bubble Component

**Create new file: `src/components/MessageBubble.tsx`**

```tsx
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Markdown } from "./Markdown"
import { ToolResult } from "./ToolResult"
import type { Message, ToolCall } from "../types"

interface MessageBubbleProps {
  message: Message
  toolCalls: ToolCall[]
}

export function MessageBubble({ message, toolCalls }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <div
      className={cn(
        "flex animate-fadeIn",
        isUser && "justify-end",
        isAssistant && "justify-start"
      )}
    >
      <Card
        className={cn(
          "max-w-[85%] p-3",
          isUser && "bg-primary text-primary-foreground",
          isAssistant && "bg-card"
        )}
        role="article"
        aria-label={`${isUser ? 'Your' : 'Assistant'} message`}
      >
        {message.error ? (
          <div className="flex items-start gap-2 p-2 bg-destructive/10 text-destructive rounded border-l-4 border-destructive">
            <strong className="font-semibold">Error:</strong>
            <span>{message.error}</span>
          </div>
        ) : (
          <>
            <div className="break-words">
              {isAssistant ? (
                <>
                  <Markdown content={message.content} />
                  {message.isStreaming && (
                    <span className="animate-blink ml-0.5" aria-label="Streaming">▊</span>
                  )}
                </>
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </div>

            {/* Images */}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {message.images.map((img, idx) => (
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

            {/* Tool calls */}
            {toolCalls.filter(tc => tc.id.includes(message.id)).map(tc => (
              <ToolResult key={tc.id} toolCall={tc} />
            ))}
          </>
        )}
      </Card>
    </div>
  )
}
```

### 3.3 Tool Results with Collapsible

**Update `src/components/ToolResult.tsx`:**

```tsx
import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from "@/lib/utils"

export function ToolResult({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasResult = toolCall.result !== undefined
  const isError = hasResult && toolCall.result?.error

  const getStatusBadge = () => {
    if (!hasResult) return <Badge variant="outline">Running</Badge>
    if (isError) return <Badge variant="destructive">Error</Badge>
    return <Badge variant="default">Success</Badge>
  }

  return (
    <Card className="mt-2 p-2.5 bg-muted/50 text-xs">
      <div className="flex items-center justify-between mb-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <span className="font-mono font-semibold text-sm">{toolCall.name}</span>
        </div>
        {hasResult && !isError && (
          <span className="text-[10px] text-muted-foreground">
            {new Date(toolCall.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Tool input parameters */}
      {toolCall.input && Object.keys(toolCall.input).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 bg-secondary/50 rounded">
          {Object.entries(toolCall.input).map(([key, value]) => (
            <span key={key} className="text-[11px] font-mono text-muted-foreground">
              {key}: <span className="text-foreground font-medium">{String(value)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Tool result */}
      {hasResult && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <div className="space-y-2">
            {formatResult(toolCall.result)}

            {shouldShowExpandButton(toolCall.result) && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp size={14} className="mr-1" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} className="mr-1" />
                      Show more
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </Collapsible>
      )}
    </Card>
  )
}

// Keep existing formatResult logic with Tailwind classes
```

### 3.4 Conversations List

**Update `src/components/Conversations.tsx`:**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { cn } from "@/lib/utils"

export function Conversations({ ... }: ConversationsProps) {
  // ... existing state and logic

  return (
    <div className="flex flex-col h-full">
      {/* New conversation button */}
      <div className="p-3 border-b">
        <Button
          onClick={onNewConversation}
          className="w-full"
          aria-label="Start new conversation"
        >
          <Plus size={16} className="mr-2" />
          New Conversation
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className={cn(
                "group cursor-pointer transition-all hover:shadow-md",
                conv.id === currentConversationId && "ring-2 ring-primary"
              )}
              onClick={() => handleSelectConversation(conv.id)}
              role="button"
              tabIndex={0}
              aria-label={`Conversation: ${conv.title}`}
              aria-selected={conv.id === currentConversationId}
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <MessageSquare
                    size={16}
                    className={cn(
                      "shrink-0 mt-0.5",
                      conv.id === currentConversationId ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{conv.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(conv.updated_at)}
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  aria-label="Delete conversation"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
```

---

## Phase 4: Advanced Features (3-4 hours)

### 4.1 Command Palette for Slash Commands

**Create new file: `src/components/CommandPalette.tsx`**

```tsx
import { useEffect, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

interface SlashCommand {
  command: string
  description: string
  example?: string
}

interface CommandPaletteProps {
  commands: SlashCommand[]
  onSelect: (command: string) => void
  initialFilter?: string
}

export function CommandPalette({ commands, onSelect, initialFilter = '' }: CommandPaletteProps) {
  const [search, setSearch] = useState(initialFilter)

  return (
    <Command className="rounded-t-lg border shadow-lg">
      <CommandInput
        placeholder="Search commands..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        <CommandGroup heading="Available Commands">
          {commands.map((cmd) => (
            <CommandItem
              key={cmd.command}
              onSelect={() => onSelect(cmd.command)}
              className="flex flex-col items-start gap-1 py-3"
            >
              <div className="font-semibold font-mono text-sm">{cmd.command}</div>
              <div className="text-xs text-muted-foreground">{cmd.description}</div>
              {cmd.example && (
                <div className="text-[10px] font-mono text-muted-foreground italic mt-0.5">
                  {cmd.example}
                </div>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
```

**Update App.tsx to use CommandPalette:**

```tsx
import { CommandPalette } from "./components/CommandPalette"

// Replace slash menu div with:
{showSlashMenu && filteredCommands.length > 0 && (
  <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
    <CommandPalette
      commands={filteredCommands}
      onSelect={selectCommand}
      initialFilter={inputValue}
    />
  </div>
)}
```

### 4.2 Global Keyboard Shortcuts

**Create new file: `src/hooks/useKeyboardShortcuts.ts`**

```tsx
import { useEffect } from 'react'

interface Shortcut {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  action: () => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.metaKey === undefined || shortcut.metaKey === e.metaKey
        const ctrlMatch = shortcut.ctrlKey === undefined || shortcut.ctrlKey === e.ctrlKey
        const shiftMatch = shortcut.shiftKey === undefined || shortcut.shiftKey === e.shiftKey
        const keyMatch = shortcut.key.toLowerCase() === e.key.toLowerCase()

        if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
```

**Use in App.tsx:**

```tsx
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

function App() {
  // ... existing state

  useKeyboardShortcuts([
    {
      key: 'k',
      metaKey: true,
      action: () => {
        // Future: Open command palette
        console.log('Command palette shortcut')
      },
      description: 'Open command palette'
    },
    {
      key: 'n',
      metaKey: true,
      action: () => {
        if (messages.length > 0) {
          clearHistory()
          announce('Conversation cleared')
        }
      },
      description: 'New conversation'
    },
    {
      key: '/',
      metaKey: true,
      action: () => setShowNavigation(prev => !prev),
      description: 'Toggle navigation'
    },
    {
      key: '1',
      metaKey: true,
      action: () => {
        setShowNavigation(true)
        // Set history tab active
      },
      description: 'Open history'
    },
    {
      key: '2',
      metaKey: true,
      action: () => {
        setShowNavigation(true)
        // Set tools tab active
      },
      description: 'Open tools'
    },
    {
      key: '3',
      metaKey: true,
      action: () => {
        setShowNavigation(true)
        // Set settings tab active
      },
      description: 'Open settings'
    }
  ])

  // ... rest of component
}
```

### 4.3 Toast Notifications

```bash
npx shadcn@latest add toast
```

**Setup Toaster in App.tsx:**

```tsx
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast"

function App() {
  const { toast } = useToast()

  // Use toast for actions
  const handleClearHistory = () => {
    clearHistory()
    toast({
      description: "Conversation cleared",
      duration: 2000,
    })
  }

  // ... in return JSX
  return (
    <div className="app">
      {/* ... existing UI */}
      <Toaster />
    </div>
  )
}
```

### 4.4 Markdown with Typography Plugin

**Update `src/components/Markdown.tsx`:**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

export function Markdown({ content }: { content: string }) {
  return (
    <div className={cn(
      "prose prose-sm dark:prose-invert max-w-none",
      "prose-pre:bg-muted prose-pre:text-muted-foreground",
      "prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded"
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
```

---

## Phase 5: Testing & Polish (1-2 hours)

### 5.1 Accessibility Audit

**Test with keyboard only:**
- [ ] Tab through all interactive elements
- [ ] Focus visible on all elements (2px ring)
- [ ] Enter/Space activate buttons
- [ ] Escape closes modals/sheets
- [ ] Arrow keys navigate lists and menus

**Test with screen reader (VoiceOver on Mac):**
- [ ] All buttons have descriptive labels
- [ ] Messages are announced as they stream
- [ ] Tool results announce status changes
- [ ] Form inputs have proper labels
- [ ] Navigation landmarks work correctly

**WCAG 2.1 AA Checklist:**
- [ ] Color contrast ≥4.5:1 for normal text
- [ ] Color contrast ≥3:1 for large text
- [ ] No color-only information
- [ ] All functionality keyboard accessible
- [ ] Focus order is logical
- [ ] No keyboard traps

### 5.2 Theme Testing

Test both light and dark themes:
- [ ] All text readable
- [ ] Focus rings visible
- [ ] Hover states clear
- [ ] Active states clear
- [ ] Disabled states clear
- [ ] Border colors sufficient contrast

### 5.3 Responsive Testing

Test at different window sizes:
- [ ] 360px width (minimum)
- [ ] 600px width (default)
- [ ] 1000px+ width (expanded)

### 5.4 Interaction Testing

- [ ] All buttons clickable and have correct hover/active states
- [ ] Navigation drawer opens/closes smoothly
- [ ] Tabs switch correctly
- [ ] Messages scroll to bottom on new message
- [ ] Textarea auto-resizes correctly
- [ ] Image paste and preview works
- [ ] Slash command menu keyboard navigation
- [ ] Tool results expand/collapse
- [ ] Conversation selection works
- [ ] Delete confirmation (if added)

### 5.5 Performance

Check bundle size:
```bash
pnpm build
```

Expected production CSS: ~30-40KB (acceptable for desktop app)

---

## Success Metrics

### Code Quality
- ✅ **86% CSS reduction** (1445 → ~200 lines)
- ✅ **Component library adoption** (15+ shadcn components)
- ✅ **Type safety** (TypeScript throughout)
- ✅ **Consistent styling** (Tailwind utilities)

### Accessibility
- ✅ **WCAG 2.1 AA compliance**
- ✅ **Keyboard navigation** (100% coverage)
- ✅ **Screen reader support** (ARIA labels, live regions)
- ✅ **Focus management** (visible focus rings, logical tab order)

### User Experience
- ✅ **8+ keyboard shortcuts** (Cmd+K, Cmd+N, Cmd+1/2/3, etc.)
- ✅ **Toast notifications** for user actions
- ✅ **Command palette** with fuzzy search
- ✅ **Smooth animations** (preserved from original)
- ✅ **Theme persistence** (light/dark mode)

### Performance
- ✅ **Bundle size** <50KB increase
- ✅ **No runtime performance degradation**
- ✅ **Fast build times**

---

## Critical Files to Modify

### Priority 1 - Foundation (Phase 1)
1. `tailwind.config.js` - NEW - Tailwind configuration with theme
2. `postcss.config.js` - NEW - PostCSS configuration
3. `src/styles.css` - REPLACE - 1445 lines → ~200 lines with theme variables
4. `src/lib/utils.ts` - NEW - cn() helper function
5. `src/lib/accessibility.ts` - NEW - Accessibility utilities
6. `tsconfig.json` - UPDATE - Add path aliases
7. `package.json` - UPDATE - Add dependencies

### Priority 2 - Core Components (Phase 2)
8. `src/App.tsx` - UPDATE - Header, buttons, input area, layout
9. `src/components/Navigation.tsx` - UPDATE - Sheet, Tabs, settings
10. `src/components/Conversations.tsx` - UPDATE - ScrollArea, Cards, buttons

### Priority 3 - Chat UI (Phase 3)
11. `src/components/MessageBubble.tsx` - NEW - Extracted message component
12. `src/components/ToolResult.tsx` - UPDATE - Card, Collapsible, Badge
13. `src/components/Markdown.tsx` - UPDATE - Typography plugin classes

### Priority 4 - Advanced Features (Phase 4)
14. `src/components/CommandPalette.tsx` - NEW - Command component for slash menu
15. `src/hooks/useKeyboardShortcuts.ts` - NEW - Global keyboard shortcuts
16. `src/hooks/use-toast.ts` - AUTO-GENERATED - Toast hook from shadcn

### Auto-Generated (shadcn CLI)
17. `src/components/ui/button.tsx`
18. `src/components/ui/card.tsx`
19. `src/components/ui/sheet.tsx`
20. `src/components/ui/tabs.tsx`
21. `src/components/ui/command.tsx`
22. `src/components/ui/scroll-area.tsx`
23. `src/components/ui/textarea.tsx`
24. `src/components/ui/badge.tsx`
25. `src/components/ui/collapsible.tsx`
26. `src/components/ui/separator.tsx`
27. `src/components/ui/toast.tsx`
28. `src/components/ui/toaster.tsx`

---

## Rollback Plan

If issues arise:

1. **Per-Phase Rollback:** Each phase is in a separate commit - revert specific commits
2. **Full Rollback:**
   - `git revert` all shadcn commits
   - `pnpm remove tailwindcss postcss autoprefixer class-variance-authority clsx tailwind-merge`
   - Restore original `styles.css` from git history
3. **Partial Freeze:** Keep Tailwind installed but pause migration at any phase

---

## Implementation Timeline

### Session 1 (3-4 hours): Foundation
- Phase 1 complete
- Tailwind + shadcn installed
- Theme system working
- No visual changes

### Session 2 (4-5 hours): Core Components
- Phase 2 complete
- Buttons migrated
- Navigation drawer with Sheet + Tabs
- Input area with Textarea
- ~40% CSS reduction

### Session 3 (3-4 hours): Chat UI
- Phase 3 complete
- Message bubbles with Cards
- Tool results with Collapsible
- Conversations list styled
- ~70% CSS reduction

### Session 4 (3-4 hours): Advanced Features & Polish
- Phase 4 complete
- Command palette
- Keyboard shortcuts
- Toast notifications
- Phase 5 testing
- 86% CSS reduction
- Full accessibility

**Total: 13-17 hours** (within 12-16 hour budget with efficiency)

---

## Next Steps

To begin implementation:

1. Create feature branch: `git checkout -b feature/shadcn-migration`
2. Commit current state: `git commit -am "Pre-shadcn migration checkpoint"`
3. Start Phase 1: Install dependencies
4. Follow each phase sequentially
5. Test after each phase before proceeding
6. Commit after each phase for easy rollback

---

## Notes

- **Desktop app context:** Bundle size increases are acceptable (not a web app)
- **Existing patterns:** Preserve conversation loading, streaming, image paste logic
- **State management:** Keep Zustand - no changes needed
- **Agent runtime:** No changes to backend/IPC layer
- **Theme system:** Preserve `data-theme` attribute approach for compatibility