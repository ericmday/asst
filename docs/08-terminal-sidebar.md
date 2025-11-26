# Terminal Sidebar Implementation Plan

## Overview
Add a fixed-width terminal sidebar on the right side of the window to display agent runtime logs (both stdout and stderr) for debugging during development. Toggle visibility via a Terminal icon in the header next to the pin button.

## User Requirements
- **Log scope**: Both stdout (IPC messages) and stderr (debug logs)
- **Sidebar behavior**: Fixed width (~300px), show/hide toggle
- **Log retention**: Session-only (in-memory, cleared on restart)
- **UI placement**: Terminal icon next to pin button in header

## Architecture Changes

### 1. Rust Backend (Tauri) - Log Event Emission
**File**: `apps/tauri-shell/src-tauri/src/agent_ipc.rs`

**Current behavior**:
- stdout → parsed as JSON, emitted as `agent_response` events
- stderr → logged to Rust stderr only (`eprintln!`)

**Changes needed**:
- Add new Tauri event: `agent_log`
- Emit both stdout and stderr as log events
- Include metadata: `source` ('stdout'|'stderr'), `message`, `timestamp`

**Implementation**:
```rust
// Line 64-92: Modify stdout/stderr handling
// For stdout (before JSON parsing):
app_handle.emit_all("agent_log", json!({
    "source": "stdout",
    "message": line.clone(),
    "timestamp": SystemTime::now()
}));

// For stderr:
app_handle.emit_all("agent_log", json!({
    "source": "stderr",
    "message": line,
    "timestamp": SystemTime::now()
}));
```

### 2. React Frontend - Type Definitions
**File**: `apps/tauri-shell/src/types.ts`

**Add new types**:
```typescript
export interface AgentLog {
  source: 'stdout' | 'stderr'
  message: string
  timestamp: number
}
```

### 3. React Frontend - Log Hook
**File**: `apps/tauri-shell/src/useAgentLogs.ts` (new file)

**Purpose**: Centralized hook for managing agent logs

**Responsibilities**:
- Listen to `agent_log` events from Tauri
- Store logs in-memory (useState)
- Auto-limit to last 1000 lines to prevent memory bloat
- Provide clear() method

**Interface**:
```typescript
export function useAgentLogs() {
  const [logs, setLogs] = useState<AgentLog[]>([])

  // Listen to agent_log events
  useEffect(() => {
    const unlisten = listen<AgentLog>('agent_log', (event) => {
      setLogs(prev => [...prev.slice(-999), event.payload])
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const clearLogs = () => setLogs([])

  return { logs, clearLogs }
}
```

### 4. React Component - TerminalSidebar
**File**: `apps/tauri-shell/src/components/TerminalSidebar.tsx` (new file)

**Features**:
- Fixed 300px width sidebar
- Auto-scroll to bottom on new logs
- Syntax highlighting for stdout vs stderr
- Clear button
- Monospace font (font-mono)

**Structure**:
```tsx
export function TerminalSidebar({ logs, onClear }: Props) {
  return (
    <div className="w-[300px] border-l flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-3 py-2 flex justify-between">
        <span className="font-semibold text-sm">Terminal</span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Log content */}
      <ScrollArea className="flex-1">
        <div className="p-2 font-mono text-xs space-y-0.5">
          {logs.map((log, i) => (
            <div key={i} className={cn(
              "whitespace-pre-wrap break-all",
              log.source === 'stderr' ? 'text-yellow-600 dark:text-yellow-400' :
              'text-gray-600 dark:text-gray-400'
            )}>
              [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
```

### 5. App Layout Modification
**File**: `apps/tauri-shell/src/App.tsx`

**Changes**:
1. Add state: `const [showTerminal, setShowTerminal] = useState(false)`
2. Import useAgentLogs hook
3. Modify main layout from vertical to horizontal split when terminal is visible
4. Add Terminal icon button next to Pin button in header

**Layout structure** (when `isExpanded && showTerminal`):
```tsx
<div className="flex flex-1 overflow-hidden">
  {/* Main chat area (flex-1) */}
  <div className="flex-1 flex flex-col">
    {/* Existing: ScrollArea + messages */}
  </div>

  {/* Terminal sidebar (fixed 300px) */}
  <TerminalSidebar logs={logs} onClear={clearLogs} />
</div>
```

**Header modification** (line ~455):
```tsx
<div className="flex items-center gap-2">
  {/* Existing: Pin button */}
  <Button
    variant="ghost"
    size="icon"
    onClick={() => setShowTerminal(!showTerminal)}
  >
    <Terminal className={cn("h-4 w-4", showTerminal && "text-blue-600")} />
  </Button>

  {/* Status, Clear, etc. */}
</div>
```

### 6. Navigation Icon Addition
**File**: `apps/tauri-shell/src/components/Navigation.tsx`

**No changes needed** - Terminal toggle is in the main header, not the Navigation sidebar.

## File Modification Summary

### New Files
1. `apps/tauri-shell/src/useAgentLogs.ts` - Log management hook
2. `apps/tauri-shell/src/components/TerminalSidebar.tsx` - Terminal UI component

### Modified Files
1. `apps/tauri-shell/src-tauri/src/agent_ipc.rs` - Emit log events
2. `apps/tauri-shell/src/types.ts` - Add AgentLog type
3. `apps/tauri-shell/src/App.tsx` - Add terminal toggle + layout changes

## Implementation Steps

1. **Backend (Rust)**
   - Modify `agent_ipc.rs` to emit `agent_log` events for both stdout and stderr
   - Add timestamp and source metadata

2. **Type Definitions**
   - Add `AgentLog` interface to `types.ts`

3. **Log Hook**
   - Create `useAgentLogs.ts` hook
   - Implement event listener and log management
   - Add 1000-line buffer limit

4. **Terminal Component**
   - Create `TerminalSidebar.tsx`
   - Style with monospace font, color-coded by source
   - Add clear button and auto-scroll

5. **App Integration**
   - Add terminal toggle state to `App.tsx`
   - Add Terminal icon next to Pin button
   - Modify layout to horizontal split when terminal visible
   - Wire up useAgentLogs hook

6. **Testing**
   - Verify logs stream in real-time
   - Test toggle show/hide
   - Verify clear functionality
   - Check auto-scroll behavior
   - Verify 1000-line limit works

## Edge Cases & Considerations

1. **Window size**: Terminal adds 300px width - ensure window still fits on screen
2. **Performance**: 1000-line limit prevents memory bloat from long sessions
3. **JSON parsing**: Some stdout lines are valid JSON (IPC), some are debug logs - show both
4. **Timestamps**: Use browser's local time for consistency
5. **Dark mode**: Ensure log colors work in both light and dark themes

## Development-Only Feature

This is intended as a development/debugging tool. For production:
- Consider adding a feature flag or environment check
- Or simply document that users can close it if they don't need it
- Keep the icon visible so it's discoverable but optional
