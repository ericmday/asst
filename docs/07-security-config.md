# 07 - Security & Configuration

## Overview

Security and configuration management are critical for a desktop assistant with system access. This document covers API key management, tool permissions, sandboxing, and user configuration.

**Security layers:**
1. **API Key Protection** - Never expose keys to frontend
2. **Tool Sandboxing** - Restrict filesystem and command access
3. **Input Validation** - Sanitize all user and tool inputs
4. **Audit Logging** - Track all tool executions
5. **Rate Limiting** - Prevent abuse and runaway costs

## Configuration Architecture

```
┌─────────────────────────────────────────┐
│         Configuration Sources           │
├─────────────────────────────────────────┤
│                                         │
│  1. Environment Variables (.env)        │
│     └─> API keys, service URLs          │
│                                         │
│  2. OS Keychain (macOS/Windows)         │
│     └─> Encrypted API key storage       │
│                                         │
│  3. Settings File (config.json)         │
│     └─> User preferences, tool perms    │
│                                         │
│  4. Tauri Config (tauri.conf.json)      │
│     └─> App metadata, allowlists        │
│                                         │
└─────────────────────────────────────────┘
```

## API Key Management

### Option 1: Environment Variables (Development)

**.env (NEVER commit this):**

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

**Agent runtime reads:**

```typescript
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY not set');
}
```

### Option 2: OS Keychain (Production)

**macOS - Using Security Framework:**

Create a Tauri command to store/retrieve from Keychain:

```rust
use security_framework::passwords::*;

#[tauri::command]
async fn set_api_key(key: String) -> Result<(), String> {
    set_generic_password(
        "com.yourcompany.desktop-assistant",
        "anthropic_api_key",
        key.as_bytes()
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_api_key() -> Result<String, String> {
    let password = find_generic_password(
        "com.yourcompany.desktop-assistant",
        "anthropic_api_key"
    ).map_err(|e| e.to_string())?;

    let key = String::from_utf8(password.to_vec())
        .map_err(|e| e.to_string())?;

    Ok(key)
}
```

**Windows - Using DPAPI:**

```rust
use windows::Win32::Security::Cryptography::*;

// Similar implementation using Windows Data Protection API
```

**Pass to agent runtime:**

```rust
// In agent_process.rs
let api_key = get_api_key().await?;

let mut child = Command::new("node")
    .arg(&agent_path)
    .env("ANTHROPIC_API_KEY", api_key)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .spawn()?;
```

### Initial Setup Flow

1. User launches app for first time
2. Settings window prompts for API key
3. Key stored in OS keychain
4. Agent runtime receives key via environment variable
5. Never stored in plain text files

## Tool Permissions

### Permission Configuration

**config.json (in app data directory):**

```json
{
  "version": "1.0.0",
  "tools": {
    "filesystem": {
      "enabled": true,
      "allowedPaths": [
        "/Users/username/workspace",
        "/Users/username/Documents/projects"
      ],
      "maxFileSizeMB": 10,
      "allowedOperations": ["read", "write", "list"]
    },
    "shell": {
      "enabled": false,
      "allowedCommands": ["ls", "pwd", "date"]
    },
    "system": {
      "enabled": true,
      "allowOpenInDefaultApp": true
    },
    "comfyui": {
      "enabled": true,
      "apiUrl": "http://localhost:8188"
    }
  },
  "agent": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096,
    "temperature": 1.0
  },
  "ui": {
    "theme": "auto",
    "shortcuts": {
      "toggle": "Cmd+Shift+Space",
      "clearHistory": "Cmd+K"
    }
  }
}
```

### Loading Configuration

**apps/agent-runtime/src/config.ts:**

```typescript
import fs from 'fs/promises';
import path from 'path';
import { app } from '@tauri-apps/api';

export interface ToolPermissions {
  enabled: boolean;
  [key: string]: any;
}

export interface AppConfig {
  version: string;
  tools: Record<string, ToolPermissions>;
  agent: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  ui: {
    theme: string;
    shortcuts: Record<string, string>;
  };
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = await getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Return defaults if config doesn't exist
    return getDefaultConfig();
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = await getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

async function getConfigPath(): Promise<string> {
  const appDataDir = await app.appDataDir();
  return path.join(appDataDir, 'config.json');
}

function getDefaultConfig(): AppConfig {
  return {
    version: '1.0.0',
    tools: {
      filesystem: {
        enabled: true,
        allowedPaths: [],
        maxFileSizeMB: 10,
        allowedOperations: ['read', 'list'],
      },
      shell: {
        enabled: false,
        allowedCommands: [],
      },
      system: {
        enabled: true,
        allowOpenInDefaultApp: true,
      },
    },
    agent: {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 1.0,
    },
    ui: {
      theme: 'auto',
      shortcuts: {
        toggle: 'Cmd+Shift+Space',
        clearHistory: 'Cmd+K',
      },
    },
  };
}
```

### Permission Enforcement

Tools check permissions before execution:

```typescript
// In filesystem.ts
export function createFilesystemTools(config: AppConfig): Tool[] {
  const fsConfig = config.tools.filesystem;

  if (!fsConfig.enabled) {
    return []; // Don't register any filesystem tools
  }

  function validatePath(relativePath: string): string {
    // Check against allowedPaths
    const allowedPaths = fsConfig.allowedPaths || [];

    const resolved = path.resolve(relativePath);
    const isAllowed = allowedPaths.some(allowed =>
      resolved.startsWith(path.resolve(allowed))
    );

    if (!isAllowed) {
      throw new Error('Access denied: path not in allowed list');
    }

    return resolved;
  }

  return [
    // Tools that use validatePath...
  ];
}
```

## Input Validation & Sanitization

### User Input

```typescript
function sanitizeUserInput(input: string): string {
  // Remove potentially dangerous characters
  const sanitized = input
    .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
    .trim()
    .slice(0, 10000); // Max length

  return sanitized;
}
```

### Path Validation

```typescript
function validatePath(userPath: string, allowedRoot: string): string {
  // Resolve to absolute path
  const resolved = path.resolve(allowedRoot, userPath);

  // Check for path traversal
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error('Path traversal detected');
  }

  // Check for suspicious patterns
  if (resolved.includes('..') || resolved.includes('~')) {
    throw new Error('Invalid path pattern');
  }

  return resolved;
}
```

### Command Validation

```typescript
function validateCommand(cmd: string, whitelist: string[]): void {
  if (!whitelist.includes(cmd)) {
    throw new Error(`Command not allowed: ${cmd}`);
  }

  // No shell metacharacters
  if (/[;&|`$()]/.test(cmd)) {
    throw new Error('Invalid command characters');
  }
}
```

## Audit Logging

### Log Tool Executions

**apps/agent-runtime/src/audit.ts:**

```typescript
import fs from 'fs/promises';
import path from 'path';

export interface AuditLogEntry {
  timestamp: number;
  toolName: string;
  input: any;
  result?: any;
  error?: string;
  userId?: string;
}

class AuditLogger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  async log(entry: AuditLogEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.logPath, logLine, 'utf-8');
  }

  async getRecentLogs(limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n');
      return lines
        .slice(-limit)
        .map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }
}

export const auditLogger = new AuditLogger(
  path.join(process.env.HOME || '', '.desktop-assistant', 'audit.log')
);
```

**Usage in tools:**

```typescript
execute: async (input: any) => {
  try {
    const result = await performOperation(input);

    await auditLogger.log({
      timestamp: Date.now(),
      toolName: 'list_files',
      input,
      result,
    });

    return result;
  } catch (error) {
    await auditLogger.log({
      timestamp: Date.now(),
      toolName: 'list_files',
      input,
      error: error.message,
    });

    throw error;
  }
}
```

## Rate Limiting

### API Rate Limiting

```typescript
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside window
    this.requests = this.requests.filter(
      time => now - time < this.windowMs
    );

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      throw new Error(`Rate limit exceeded. Retry in ${waitTime}ms`);
    }

    this.requests.push(now);
  }
}

// Usage
const apiLimiter = new RateLimiter(50, 60000); // 50 requests per minute

async function callClaude() {
  await apiLimiter.checkLimit();
  // Make API call...
}
```

## Settings UI

Create a settings panel for users to configure:

1. **API Keys** - Input, test, and save
2. **Tool Permissions** - Enable/disable tools, configure paths
3. **Model Settings** - Select model, adjust parameters
4. **Shortcuts** - Customize keyboard shortcuts
5. **Theme** - Light/dark mode
6. **Audit Logs** - View recent tool executions

**Example Tauri command:**

```rust
#[tauri::command]
async fn update_settings(settings: String) -> Result<(), String> {
    let config_path = get_config_path()?;
    std::fs::write(config_path, settings)
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

## Security Checklist

### Development

- [ ] Never commit `.env` files
- [ ] Use `.env.example` for documentation
- [ ] Validate all user inputs
- [ ] Sanitize all file paths
- [ ] Whitelist shell commands
- [ ] Set resource limits (file size, timeout)
- [ ] Implement audit logging
- [ ] Test path traversal prevention

### Production

- [ ] Use OS keychain for API keys
- [ ] Enable rate limiting
- [ ] Configure tool permissions
- [ ] Set up audit log rotation
- [ ] Minimize Tauri allowlist
- [ ] Review CSP (Content Security Policy)
- [ ] Test in sandboxed environment
- [ ] Document security model for users

## Threat Model

**Threats to consider:**

1. **Path Traversal** - Attacker reads `/etc/passwd`
   - Mitigation: Path validation, allowlist

2. **Command Injection** - Attacker runs arbitrary commands
   - Mitigation: Command whitelist, no shell execution

3. **API Key Exposure** - Key leaked in logs/UI
   - Mitigation: OS keychain, never log keys

4. **Runaway Costs** - Infinite loop of API calls
   - Mitigation: Rate limiting, cost monitoring

5. **Data Exfiltration** - Agent sends sensitive data to attacker
   - Mitigation: Network monitoring, audit logs

## Monitoring & Alerts

### Cost Monitoring

Track API usage and costs:

```typescript
interface UsageStats {
  requestCount: number;
  tokenCount: number;
  estimatedCost: number;
}

class UsageTracker {
  private stats: UsageStats = {
    requestCount: 0,
    tokenCount: 0,
    estimatedCost: 0,
  };

  recordUsage(tokens: number): void {
    this.stats.requestCount++;
    this.stats.tokenCount += tokens;
    this.stats.estimatedCost += this.calculateCost(tokens);

    // Alert if over threshold
    if (this.stats.estimatedCost > 10) {
      this.alertUser();
    }
  }

  private calculateCost(tokens: number): number {
    // Claude pricing (example)
    const costPerMToken = 3.0; // $3 per million tokens
    return (tokens / 1000000) * costPerMToken;
  }

  private alertUser(): void {
    // Send notification via Tauri
  }
}
```

## Next Steps

- Review all documentation → [claude.md](../claude.md)
- Begin implementation → [01-project-setup.md](./01-project-setup.md)

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Tauri Security](https://tauri.app/v1/references/architecture/security)
- [Claude API Docs](https://docs.anthropic.com/)
