# Memory System Architecture

> Local, privacy-focused persistent memory with semantic search

## Overview

Build a complete memory system that allows the assistant to:
- Remember all conversations
- Search semantically across history
- Process and index documents
- Retrieve relevant context automatically

**Privacy:** All data stays local (Ollama embeddings + LanceDB)
**Cost:** Zero ongoing costs
**Performance:** Fast on Apple Silicon

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Claude Agent SDK                        │
│  - Conversation history (current session)       │
│  - Short-term context window                    │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│      Long-Term Memory System                    │
│                                                  │
│  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Vector Store    │  │   Document Store   │  │
│  │  (Embeddings)    │  │   (Original text)  │  │
│  │                  │  │                    │  │
│  │  - Conversations │  │  - PDF content     │  │
│  │  - Documents     │  │  - Chat history    │  │
│  │  - Code snippets │  │  - File metadata   │  │
│  └──────────────────┘  └────────────────────┘  │
│                                                  │
│         LanceDB (Rust-native vector DB)         │
└─────────────────────────────────────────────────┘
```

---

## Components

### 1. Embedding Service (Ollama)

**Model:** nomic-embed-text (274MB)
**Dimensions:** 768
**Speed:** ~20-50ms per embedding (M1/M2)

```rust
// apps/tauri-shell/src-tauri/src/embeddings/ollama.rs

pub struct OllamaEmbeddingService {
    client: reqwest::Client,
    base_url: String,
}

impl OllamaEmbeddingService {
    pub async fn embed_text(&self, text: &str) -> Result<Vec<f32>> {
        // POST to http://localhost:11434/api/embeddings
        // Returns 768-dimensional vector
    }

    pub async fn embed_batch(&self, texts: Vec<&str>) -> Result<Vec<Vec<f32>>> {
        // Process multiple texts efficiently
    }
}
```

---

### 2. Vector Store (LanceDB)

**Storage:** `~/.claude/memory.lance`
**Schema:**

```rust
pub struct MemoryChunk {
    pub id: String,              // Unique ID
    pub text: String,            // Original text
    pub embedding: Vec<f32>,     // 768-dim vector
    pub source_type: String,     // "conversation" | "document" | "file"
    pub source_id: String,       // Session ID or file path
    pub timestamp: i64,          // Unix timestamp
    pub metadata: serde_json::Value,  // Additional context
}
```

**Operations:**
```rust
pub struct VectorStore {
    db: lancedb::Connection,
}

impl VectorStore {
    pub async fn add(&self, chunk: MemoryChunk) -> Result<()>;
    pub async fn search(&self, query_embedding: Vec<f32>, limit: usize) -> Result<Vec<SearchResult>>;
    pub async fn delete_by_source(&self, source_id: &str) -> Result<()>;
}
```

---

### 3. Document Processor

**Supported formats:**
- PDF (pdf-extract, lopdf)
- Text files (plain read)
- Code files (with syntax awareness)
- Markdown

**Chunking strategy:**
```rust
pub fn chunk_text(text: &str, chunk_size: usize) -> Vec<String> {
    // Split into ~512 token chunks
    // Preserve sentence boundaries
    // Overlap by 50 tokens for context
}
```

**Example:**
```
10-page PDF (5,000 words)
    ↓
~25,000 tokens
    ↓
~50 chunks (512 tokens each, 50 token overlap)
    ↓
50 embeddings (via Ollama)
    ↓
Stored in LanceDB
```

---

### 4. Conversation Indexer

**Auto-indexing:** Every conversation message gets embedded

```rust
// When user sends message
pub async fn index_message(
    message: &Message,
    session_id: &str,
    embedding_service: &OllamaEmbeddingService,
    vector_store: &VectorStore,
) -> Result<()> {
    let embedding = embedding_service.embed_text(&message.content).await?;

    vector_store.add(MemoryChunk {
        id: uuid::Uuid::new_v4().to_string(),
        text: message.content.clone(),
        embedding,
        source_type: "conversation".to_string(),
        source_id: session_id.to_string(),
        timestamp: message.timestamp,
        metadata: json!({
            "role": message.role,
            "session_id": session_id,
        }),
    }).await?;

    Ok(())
}
```

---

### 5. Context Retrieval

**On every user message:**
1. Embed the query
2. Search vector store for top 5 relevant chunks
3. Inject into SDK prompt

```rust
pub async fn get_relevant_context(
    query: &str,
    embedding_service: &OllamaEmbeddingService,
    vector_store: &VectorStore,
) -> Result<String> {
    // 1. Embed query
    let query_embedding = embedding_service.embed_text(query).await?;

    // 2. Search
    let results = vector_store.search(query_embedding, 5).await?;

    // 3. Format context
    let context = results.iter()
        .map(|r| format!("From {}: {}", r.source_id, r.text))
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(context)
}
```

**In SDK adapter:**
```typescript
// Before sending to SDK
const relevantContext = await invoke('get_relevant_context', {
  query: userMessage
});

const prompt = `Context from past conversations:
${relevantContext}

Current question: ${userMessage}`;

const stream = query({ prompt, sessionId, ... });
```

---

## Storage Structure

```
~/.claude/
├── memory.lance/           # LanceDB vector database
│   ├── data/
│   └── manifest.json
├── documents/              # Original documents
│   ├── pdfs/
│   │   └── contract.pdf
│   ├── text/
│   │   └── notes.txt
│   └── index.json         # Document metadata
└── sessions.db            # SQLite for session metadata
```

---

## Performance Estimates

**Document Processing:**
- 1-page PDF: ~500ms (extract + chunk + embed)
- 50-page PDF: ~20s (parallelized)
- 100 chat messages: ~2s (background indexing)

**Search:**
- Embedding query: ~30ms
- Vector search (10k chunks): ~50ms
- Total retrieval: <100ms

**Storage:**
- 1 chat message: ~1.5KB (text + embedding + metadata)
- 1,000 messages: ~1.5MB
- 10-page PDF: ~50KB (50 chunks)

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Ollama embedding service
- [ ] LanceDB integration
- [ ] Basic schema
- [ ] Add/search operations

### Phase 2: Document Processing (Week 2)
- [ ] PDF extraction
- [ ] Text chunking
- [ ] Batch embedding pipeline
- [ ] Document metadata

### Phase 3: Conversation Indexing (Week 2)
- [ ] Auto-index on message
- [ ] Background processing
- [ ] Session association
- [ ] Cleanup on delete

### Phase 4: Context Retrieval (Week 3)
- [ ] Query embedding
- [ ] Vector search
- [ ] Context injection
- [ ] Relevance ranking

### Phase 5: UI & Polish (Week 3)
- [ ] Memory status UI
- [ ] Document list
- [ ] Search interface
- [ ] Performance monitoring

---

## Tauri Commands

```rust
#[tauri::command]
async fn add_document(path: String) -> Result<DocumentId, String>;

#[tauri::command]
async fn search_memory(query: String, limit: usize) -> Result<Vec<SearchResult>, String>;

#[tauri::command]
async fn get_relevant_context(query: String) -> Result<String, String>;

#[tauri::command]
async fn delete_document(doc_id: String) -> Result<(), String>;

#[tauri::command]
async fn get_memory_stats() -> Result<MemoryStats, String>;
```

---

## Dependencies

**Cargo.toml additions:**
```toml
[dependencies]
# Embeddings
reqwest = { version = "0.11", features = ["json"] }

# Vector DB
lancedb = "0.5"
arrow = "50.0"

# Document processing
pdf-extract = "0.7"
lopdf = "0.32"

# Utilities
uuid = { version = "1.0", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

---

## Testing Plan

**Unit tests:**
- Embedding service
- Chunking algorithm
- Vector similarity

**Integration tests:**
- End-to-end document processing
- Search accuracy
- Context retrieval

**Performance tests:**
- Large document processing
- Search latency
- Memory usage

---

## Privacy Considerations

✅ All embeddings generated locally (Ollama)
✅ All data stored locally (LanceDB)
✅ No API calls for sensitive content
✅ User controls all data
✅ Easy to delete/export

---

## Future Enhancements

- [ ] Hybrid search (vector + keyword)
- [ ] Metadata filtering
- [ ] Temporal decay (recent = more relevant)
- [ ] Category/tag support
- [ ] Export/import memory
- [ ] Multi-vault support
