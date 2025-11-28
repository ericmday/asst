# Conversation Switching Bug Fix

## Problem
When users clicked on a historical conversation or created a new conversation, the chat window didn't properly reset - they still saw messages from the prior conversation briefly before the new messages loaded.

## Root Cause
In `App.tsx`, the `handleConversationSelect` function was:
1. Setting the `currentConversationId` state
2. Relying on the `Conversations` component to load messages via the `loadMessages` callback
3. **BUT** not clearing the existing messages from the UI

This created a race condition where old messages remained visible until the backend response arrived with the new conversation's messages.

## Solution
Modified `handleConversationSelect` in `/Users/ericday/Repo/asst/apps/tauri-shell/src/App.tsx` to:

1. Set the `clearInProgressRef` flag to prevent auto-compact interference
2. Update `currentConversationId`
3. **Immediately clear messages** by calling `loadMessages([])` with an empty array
4. The actual messages will be loaded when the backend responds (via the event listener in Conversations.tsx)

## Code Changes

### File: `/Users/ericday/Repo/asst/apps/tauri-shell/src/App.tsx`

**Before:**
```typescript
const handleConversationSelect = (id: string) => {
  setCurrentConversationId(id)
  // Messages will be loaded by Conversations component via loadMessages callback
  resetInactivityTimer()
}
```

**After:**
```typescript
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
```

## Flow After Fix

1. User clicks on a conversation in the history sidebar
2. `handleSelectConversation` (Conversations.tsx) is called
3. Backend is invoked with `load_conversation`
4. `handleConversationSelect` (App.tsx) is called:
   - Sets guard flag
   - Updates conversation ID
   - **Clears messages immediately** via `loadMessages([])`
   - Resets inactivity timer
5. Backend sends response via `agent_response` event
6. Event listener in Conversations.tsx receives the messages
7. Calls `onLoadMessages(uiMessages)` which updates the UI with the actual conversation messages
8. Guard flag is reset after 100ms

## Testing Checklist

- [ ] Create multiple conversations with different messages
- [ ] Switch between conversations - verify no stale messages appear
- [ ] Create a new conversation - verify chat window clears
- [ ] Switch to a conversation, then quickly switch to another - verify no race conditions
- [ ] Check that the conversation history loads correctly
- [ ] Verify auto-compact behavior still works properly

## Notes

- The `loadMessages` function in `useAgent.ts` already increments `conversationVersionRef.current`, which protects against stale responses
- The `clearInProgressRef` flag prevents the auto-compact logic from interfering during conversation switches
- The existing `handleNewConversation` already calls `clearHistory()` which properly clears messages, so no changes were needed there
