# Enhanced Features

> Additional features to round out the desktop assistant experience

## 1. System Prompts

**Effort:** 1-2 days
**Value:** Medium

### Overview
Allow users to customize the assistant's behavior and personality through file-based system prompts.

### Implementation

**File structure:**
```
~/.claude/system/
├── default.txt          # Default system prompt
├── coding.txt           # For coding tasks
├── creative.txt         # For creative writing
└── professional.txt     # For business communication
```

**Example prompts:**
```
# coding.txt
You are an expert software engineer. Provide concise, production-ready code
with clear explanations. Focus on best practices, performance, and security.
Use TypeScript/Rust when possible. Always include error handling.

# creative.txt
You are a creative writing partner. Be imaginative, explore ideas deeply,
and help brainstorm. Don't worry about being overly formal. Have fun with language.
```

**SDK integration:**
```typescript
const systemPrompt = await readFile('~/.claude/system/default.txt');

const stream = query({
  prompt: userMessage,
  systemPrompt: systemPrompt,
  sessionId,
  // ...
});
```

**UI:**
Simple dropdown in settings to switch between prompts.

---

## 2. Vault Organization

**Effort:** 1-2 days
**Value:** Medium

### Overview
Better file organization for documents, sessions, and context.

### Structure

```
~/.claude/vault/
├── global/              # Shared context across all sessions
│   ├── knowledge/       # Reference documents
│   ├── templates/       # Reusable templates
│   └── snippets/        # Code snippets
├── local/               # Session-specific data
│   └── [session-id]/
│       ├── files/       # Attached files
│       └── context/     # Session notes
└── system/              # System configuration
    └── prompts/         # System prompts
```

### Features
- Hot-swap vaults (switch projects)
- Vault templates
- Import/export vault
- Vault backups

---

## 3. Multi-Provider Support

**Effort:** 1 week
**Value:** High

### Overview
Support multiple AI providers for flexibility and cost optimization.

### Providers

**1. Anthropic Claude (Current)**
- Best quality
- Tool use support
- Vision support
- $3/$15 per 1M tokens

**2. Groq**
- Ultra-fast inference (300+ tokens/sec)
- llama-3.3-70b-versatile
- $0.59/$0.79 per 1M tokens
- Great for quick questions

**3. OpenRouter**
- Access to many models (Claude, GPT-4, Gemini)
- Single API key
- Unified pricing
- Model fallback

### Implementation

```typescript
// Provider abstraction
interface AIProvider {
  name: string;
  chat(messages: Message[]): AsyncGenerator<string>;
  supportsTools(): boolean;
  supportsImages(): boolean;
}

class GroqProvider implements AIProvider {
  async *chat(messages: Message[]) {
    // Groq API for fast inference
  }
}

class OpenRouterProvider implements AIProvider {
  async *chat(messages: Message[]) {
    // OpenRouter for multi-model access
  }
}
```

### UI

```tsx
<Select value={provider} onChange={setProvider}>
  <option value="anthropic">Claude 3.5 Sonnet (Best Quality)</option>
  <option value="groq">Groq Llama 3.3 70B (Fastest)</option>
  <option value="openrouter">OpenRouter (Multi-Model)</option>
</Select>
```

### Use Cases
- **Groq:** Quick factual questions (super fast)
- **Claude:** Complex reasoning, coding, writing
- **OpenRouter:** Experimentation with different models

---

## 4. Native File Opening

**Effort:** 1 day
**Value:** High

### Overview
Open files and folders in their default applications from the assistant.

### Implementation

```rust
use tauri::api::shell;

#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    shell::open(&shell::Scope::default(), path, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

### Features
- Click file path → opens in default app
- Context menu: "Open in Finder"
- "Open externally" for generated files
- Respects user's default applications

---

## 5. Enhanced File Browser

**Effort:** 3-5 days
**Value:** Medium

### Overview
Built-in file browser for managing context and attachments.

### Features

**Tree View:**
- Browse project directories
- Filter by file type
- Search by name

**Preview Panel:**
- Syntax highlighting for code
- PDF rendering
- Image preview
- Markdown rendering

**Quick Actions:**
- @filename mentions
- Attach to conversation
- Open externally
- Copy path

### UI Layout

```
┌────────────┬─────────────────────┐
│  File Tree │   Preview Panel     │
│            │                     │
│  📁 src    │   [File content]    │
│    📄 a.ts │                     │
│    📄 b.ts │   [Syntax highlight]│
│  📁 docs   │                     │
│    📄 x.md │                     │
└────────────┴─────────────────────┘
```

---

## 6. Conversation Templates

**Effort:** 1-2 days
**Value:** Low-Medium

### Overview
Reusable conversation starters for common tasks.

### Examples

**Code Review Template:**
```
Please review this code for:
- Best practices
- Performance issues
- Security vulnerabilities
- Readability improvements

[Paste code here]
```

**Writing Assistant Template:**
```
Help me improve this writing for:
- Clarity
- Grammar
- Tone (formal/casual)
- Conciseness

[Paste text here]
```

### Implementation

```
~/.claude/templates/
├── code-review.md
├── writing-assistant.md
├── debug-helper.md
└── brainstorm.md
```

**UI:** Templates dropdown in new conversation

---

## 7. Keyboard Shortcuts

**Effort:** 1 day
**Value:** Medium

### Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+Space` | Show/hide assistant |
| `Cmd+K` | New conversation |
| `Cmd+/` | Focus input |
| `Cmd+T` | Toggle voice input |
| `Cmd+O` | Open file |
| `Cmd+F` | Search conversations |
| `Esc` | Cancel/close |
| `Cmd+,` | Settings |

---

## 8. Themes & Appearance

**Effort:** 2-3 days
**Value:** Low

### Features
- Light/dark/auto theme
- Custom accent colors
- Font size adjustment
- Window transparency
- Compact/comfortable density

---

## 9. Export & Sharing

**Effort:** 2-3 days
**Value:** Medium

### Features

**Export conversation:**
- Markdown
- PDF
- HTML
- JSON (raw)

**Share:**
- Copy to clipboard
- Save as file
- Generate shareable link (optional)

---

## 10. Advanced Settings

**Effort:** 1-2 days
**Value:** Low

### Options
- Model selection (within provider)
- Temperature/creativity control
- Max tokens
- Timeout settings
- Auto-save frequency
- Memory limits

---

## Implementation Priority

### High Priority (Do First)
1. Native file opening (1 day)
2. Multi-provider support (1 week)
3. System prompts (1-2 days)

### Medium Priority
4. Vault organization (1-2 days)
5. Keyboard shortcuts (1 day)
6. Export features (2-3 days)

### Lower Priority
7. File browser (3-5 days)
8. Themes (2-3 days)
9. Templates (1-2 days)
10. Advanced settings (1-2 days)

---

## Total Timeline

**All enhanced features:** ~3-4 weeks

**Recommended subset (high-value only):**
- Native file opening
- Multi-provider
- System prompts
- Keyboard shortcuts

**Subset timeline:** ~1.5 weeks
