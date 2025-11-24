# SDK Migration Testing Checklist

**Phase 2 Complete** - Use this checklist to verify the SDK adapter layer before Phase 3

---

## ✅ Phase 2 Verification Tests

### 1. Build & Compilation Tests

```bash
cd apps/agent-runtime
pnpm build
```

**Expected:**
- ✅ No TypeScript errors
- ✅ Build completes successfully
- ✅ Generates dist/ folder with compiled JS

---

### 2. Unit Test: SDK Adapter Standalone

```bash
cd apps/agent-runtime
node test-sdk-adapter.js
```

**Expected:**
- ✅ Agent ready signal
- ✅ Sends test message: "Hello, what is 2+2?"
- ✅ Receives streaming tokens word-by-word
- ✅ Response: "Hello! 2+2 = 4..."
- ✅ Done message with usage stats
- ✅ Test passes and exits cleanly
- ✅ Cost: ~$0.007 USD

---

### 3. Integration Test: Full Stack (Tauri + Agent)

#### 3.1 Start Tauri Dev Server

```bash
cd /Users/ericday/Repo/asst
pnpm dev:tauri
```

**Expected:**
- ✅ Tauri app builds successfully
- ✅ Desktop window opens (360x600)
- ✅ Agent runtime spawns
- ✅ "Agent ready" indicator shows green in UI
- ✅ No errors in terminal

#### 3.2 Test Basic Conversation

**Test 1: Simple Query**
- Type: "Hello, what is your name?"
- **Expected:**
  - ✅ Message sends
  - ✅ Streaming response appears word-by-word
  - ✅ Response is coherent
  - ✅ No errors in console

**Test 2: Math Query**
- Type: "What is 15 * 23?"
- **Expected:**
  - ✅ Correct answer: 345
  - ✅ Streaming works
  - ✅ Response completes

**Test 3: Multi-line Input**
- Type (using Shift+Enter):
  ```
  Hello!
  Can you tell me
  what day of the week it is?
  ```
- **Expected:**
  - ✅ Multi-line message sends correctly
  - ✅ Response addresses the question
  - ✅ Streaming works

#### 3.3 Test Window Management

**Test: Global Hotkey**
1. Click outside the app window (hide it)
2. Press `Cmd+Shift+Space`
- **Expected:**
  - ✅ Window shows/focuses

**Test: Tray Icon**
1. Check menu bar for tray icon
2. Click tray icon
- **Expected:**
  - ✅ Menu appears with "Show" and "Quit" options
  - ✅ "Show" brings window to front
  - ✅ "Quit" closes app

---

### 4. Streaming & Performance Tests

#### 4.1 Streaming Consistency

**Test: Long Response**
- Type: "Write a short story about a robot learning to paint (2 paragraphs)"
- **Expected:**
  - ✅ Response streams smoothly
  - ✅ No freezing or lag
  - ✅ ~50 words per second visible rate
  - ✅ Complete story appears

#### 4.2 Rapid Messages

**Test: Multiple Quick Messages**
1. Type: "Count to 5" → Send
2. Wait for response to complete
3. Type: "Now count to 10" → Send
4. Wait for response to complete
5. Type: "What were the last two things I asked?" → Send

- **Expected:**
  - ✅ All messages process in order
  - ✅ No message loss
  - ✅ Conversation history maintained
  - ✅ Agent remembers both counting tasks

---

### 5. Error Handling Tests

#### 5.1 Invalid API Key Test (Optional)

**Setup:**
1. Edit `.env` and set invalid API key
2. Restart agent

**Expected:**
- ✅ Agent starts
- ✅ Error message shown in UI
- ✅ App doesn't crash
- ✅ Can recover by fixing key and restarting

#### 5.2 Network Error Simulation

**Test: Disconnect Internet**
1. Disconnect from internet
2. Send message: "Hello"

**Expected:**
- ✅ Error message appears in UI
- ✅ No crash
- ✅ Reconnect and retry works

---

### 6. IPC Protocol Tests

#### 6.1 Message Format Validation

**Check stderr logs for:**
```bash
cd apps/agent-runtime
pnpm dev 2>&1 | grep -E "\[INFO\]|\[ERROR\]"
```

**Expected logs:**
- ✅ `[Custom Tools] Successfully loaded X custom tool(s)`
- ✅ `[INFO] SDK adapter initialized`
- ✅ `[INFO] SDK system message: init`
- ✅ No `[ERROR]` messages during normal operation

---

### 7. Conversation State Tests

#### 7.1 Clear History (Placeholder Test)

**Test: Clear History Button**
1. Send a few messages
2. Click "Clear History" button (if visible in UI)

**Expected:**
- ✅ History clears in UI
- ✅ No errors
- ✅ New messages work after clear

**Note:** Conversation persistence is Phase 6 - this just tests the placeholder

---

## 🚫 Known Limitations (Expected Behavior)

### Tools Not Yet Working
- ❌ Tool execution not implemented (Phase 3)
- If you ask: "List files in this directory" → Will fail or respond without tools
- If you ask: "Run a shell command" → No tool execution

### Conversation Persistence Not Working
- ❌ Conversation history doesn't persist across restarts (Phase 6)
- Clear history is placeholder only

### Image Support Not Working
- ❌ Image paste/upload not yet functional (Phase 6)
- Vision tools (screenshots) exist but not integrated with SDK yet

---

## 🎯 Success Criteria

**Phase 2 is successful if:**

1. ✅ Tauri app starts without errors
2. ✅ Agent runtime connects via IPC
3. ✅ Simple queries work end-to-end
4. ✅ Streaming appears natural (~50 words/sec)
5. ✅ Conversation history maintained within session
6. ✅ No crashes or freezing
7. ✅ Window management (hotkey, tray) works
8. ✅ Error messages display properly

**Known failures (expected):**
- ❌ Tool execution (file operations, shell commands, etc.)
- ❌ Conversation persistence across restarts
- ❌ Image/vision capabilities

---

## 🐛 If Tests Fail

### Build Errors
```bash
cd apps/agent-runtime
rm -rf dist node_modules
pnpm install
pnpm build
```

### Runtime Errors
1. Check `.env` has valid `ANTHROPIC_API_KEY`
2. Check stderr logs: `pnpm dev 2>&1`
3. Verify SDK version: `pnpm list @anthropic-ai/claude-agent-sdk`
4. Compare with backups: `agent.ts.backup`, `index.ts.backup`

### Tauri Build Errors
```bash
cd apps/tauri-shell
cargo clean
pnpm tauri dev
```

### IPC Communication Errors
1. Check agent spawns: `ps aux | grep tsx`
2. Check agent logs in Tauri terminal
3. Verify stdio protocol not broken
4. Test standalone: `node test-sdk-adapter.js`

---

## 📊 Test Results Template

```
## Phase 2 Test Results - [Date]

### Build Tests
- [ ] Compilation: ___
- [ ] Unit test: ___

### Integration Tests
- [ ] Tauri starts: ___
- [ ] Basic query: ___
- [ ] Math query: ___
- [ ] Multi-line: ___
- [ ] Hotkey: ___
- [ ] Tray icon: ___

### Streaming Tests
- [ ] Long response: ___
- [ ] Rapid messages: ___

### Error Handling
- [ ] Invalid key: ___
- [ ] Network error: ___

### Success Criteria Met: __ / 8

### Notes:
[Any issues, observations, or blockers]

### Ready for Phase 3: YES / NO
```

---

## 🚀 Ready for Phase 3?

If all success criteria are met, proceed with:
- Phase 3: Tool Conversion
- Next test: `apps/agent-runtime/src/tools/filesystem.ts` → SDK format
