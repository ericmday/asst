# Quick Test Checklist - Phase 2 SDK Adapter

Run these tests in order to verify Phase 2 completion:

## 🚀 Quick Tests (5 minutes)

### 1. Build Test
```bash
cd apps/agent-runtime && pnpm build
```
✅ Expected: No errors

### 2. Standalone Test
```bash
cd apps/agent-runtime && node test-sdk-adapter.js
```
✅ Expected: "Test passed! SDK adapter is working."

### 3. Full Stack Test
```bash
pnpm dev:tauri
```
Then in the UI:
- Type: "What is 2+2?"
- ✅ Expected: Streaming response with "4"

### 4. Hotkey Test
- Press `Cmd+Shift+Space`
- ✅ Expected: Window shows/hides

### 5. Conversation Test
- Type: "My name is [Your Name]"
- Wait for response
- Type: "What's my name?"
- ✅ Expected: Agent remembers your name

## ✅ All Pass? → Ready for Phase 3!
## ❌ Any Fail? → See TESTING.md for debugging

---

## Expected Failures (Normal)
- ❌ "List files" - Tools not implemented yet (Phase 3)
- ❌ "Run command" - Tools not implemented yet (Phase 3)
- ❌ Restart app - History won't persist (Phase 6)
