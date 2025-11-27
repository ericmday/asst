# Assistant Upgrades - Roadmap

> Features to add after completing the core Claude Agent SDK integration

## Current Status

**In Progress:**
- Claude Agent SDK integration (Phase 1-3 from main STATUS.md)
- Basic tool layer working
- Conversation UI complete
- Terminal sidebar integrated

**Next Priority:** Complete SDK integration before adding new features

---

## Planned Upgrades

### Phase 1: Foundation Completion (Current)
**Timeline:** Complete before moving to upgrades
**Status:** 80% complete

- [x] SDK integration
- [x] Basic conversation flow
- [x] Tool execution
- [ ] Conversation memory improvements
- [ ] Error handling polish

---

### Phase 2: Memory System (High Priority)
**Timeline:** 3-4 weeks
**Dependencies:** Phase 1 complete

See [memory-system.md](./memory-system.md) for details.

**Features:**
- Local vector embeddings (Ollama)
- LanceDB integration
- Document processing (PDF, text)
- Semantic search across conversations
- Persistent memory

**Why prioritize:**
- Essential for heavy daily use
- Builds on SDK conversation management
- Privacy-focused (all local)
- Foundation for other features

---

### Phase 3: Voice Interaction (Medium Priority)
**Timeline:** 1 week
**Dependencies:** Phase 2 complete

See [voice-features.md](./voice-features.md) for details.

**Features:**
- Voice input (Groq Whisper)
- Text-to-speech (ElevenLabs)
- Global hotkey for recording
- Hands-free mode

---

### Phase 4: Enhanced Features (Lower Priority)
**Timeline:** 1-2 weeks
**Dependencies:** Phase 2-3 complete

See [enhanced-features.md](./enhanced-features.md) for details.

**Features:**
- System prompts
- Vault organization
- Multi-provider support (Groq, OpenRouter)
- Native file opening
- File browser

---

## Decision: Conversation Memory Now or Later?

### Arguments for NOW (during SDK integration):
✅ SDK provides session management - natural integration point
✅ Conversation persistence is core functionality
✅ Better to architect it in from the start
✅ Can test with real usage patterns

### Arguments for LATER (after SDK complete):
✅ Don't scope creep current work
✅ SDK basics should work first
✅ Can design memory system with SDK knowledge
✅ Cleaner separation of concerns

### Recommendation:
**Implement basic conversation persistence NOW, defer advanced memory (vector search) to Phase 2**

**Basic persistence (this phase):**
- Save conversations to SQLite
- Load conversation history
- Delete/clear conversations
- Session management

**Advanced memory (Phase 2):**
- Vector embeddings
- Semantic search
- Document indexing
- Cross-conversation search

---

## Questions to Resolve

1. Should we finish SDK integration 100% before adding conversation memory?
2. Or implement basic persistence now as part of SDK work?
3. What's the minimum viable memory system for v1?

---

## References

- [STATUS.md](../STATUS.md) - Current project status
- [03-agent-runtime.md](../03-agent-runtime.md) - Agent runtime architecture
- [memory-system.md](./memory-system.md) - Detailed memory architecture
- [voice-features.md](./voice-features.md) - Voice interaction design
- [enhanced-features.md](./enhanced-features.md) - Additional features

