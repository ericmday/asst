# 04 - Tool Layer

## Overview

The tool layer provides the agent with capabilities to interact with the local system, external APIs, and services. Each tool must be carefully designed with security constraints and clear interfaces.

**Design principles:**
- Explicit permissions and boundaries
- Clear, specific descriptions for the model
- Input validation and sanitization
- Comprehensive error handling
- Audit logging for sensitive operations

## Tool Interface

**src/tools/types.ts:**

```typescript
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (input: any) => Promise<any>;
}
```

## Tool Registry

**src/tools/index.ts:**

```typescript
import { Tool } from './types';
import { AppConfig } from '../config';
import { createFilesystemTools } from './filesystem';
import { createSystemTools } from './system';
import { createComfyUITools } from './comfyui';

export function setupTools(config: AppConfig): Tool[] {
  const tools: Tool[] = [
    ...createFilesystemTools(config),
    ...createSystemTools(config),
  ];

  // Optional tools based on config
  if (config.comfyuiApiUrl) {
    tools.push(...createComfyUITools(config));
  }

  return tools;
}

export type { Tool };
```

## Filesystem Tools

**src/tools/filesystem.ts:**

```typescript
import fs from 'fs/promises';
import path from 'path';
import { AppConfig } from '../config';
import { Tool } from './types';

export function createFilesystemTools(config: AppConfig): Tool[] {
  const allowedRoot = path.resolve(config.allowedRootDir);

  // Helper to validate paths
  function validatePath(relativePath: string): string {
    const resolved = path.resolve(allowedRoot, relativePath);
    if (!resolved.startsWith(allowedRoot)) {
      throw new Error('Access denied: path outside allowed directory');
    }
    return resolved;
  }

  return [
    {
      name: 'list_files',
      description: 'List files and directories at a given path within the allowed workspace. Returns name, type (file/directory), and size.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from workspace root (e.g., "src" or "src/components")',
          },
        },
        required: ['path'],
      },
      execute: async (input: { path: string }) => {
        const targetPath = validatePath(input.path);
        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        return entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: path.join(input.path, entry.name),
        }));
      },
    },

    {
      name: 'read_file',
      description: 'Read the contents of a text file within the allowed workspace. Use this to examine code, configuration, or documentation files.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file (e.g., "src/index.ts")',
          },
        },
        required: ['path'],
      },
      execute: async (input: { path: string }) => {
        const targetPath = validatePath(input.path);
        const stats = await fs.stat(targetPath);

        // Check file size
        const maxSizeBytes = config.maxFileSizeMb * 1024 * 1024;
        if (stats.size > maxSizeBytes) {
          throw new Error(`File too large (max ${config.maxFileSizeMb}MB)`);
        }

        const content = await fs.readFile(targetPath, 'utf-8');
        return {
          path: input.path,
          content,
          size: stats.size,
        };
      },
    },

    {
      name: 'write_file',
      description: 'Write or overwrite a text file within the allowed workspace. Use this to create new files or update existing ones.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
      execute: async (input: { path: string; content: string }) => {
        const targetPath = validatePath(input.path);

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Write file
        await fs.writeFile(targetPath, input.content, 'utf-8');

        return {
          path: input.path,
          size: Buffer.byteLength(input.content, 'utf-8'),
          message: 'File written successfully',
        };
      },
    },

    {
      name: 'search_files',
      description: 'Search for files by name pattern within the allowed workspace. Supports glob patterns.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern (e.g., "**/*.ts" for all TypeScript files)',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 100)',
          },
        },
        required: ['pattern'],
      },
      execute: async (input: { pattern: string; maxResults?: number }) => {
        const { glob } = await import('glob');
        const matches = await glob(input.pattern, {
          cwd: allowedRoot,
          nodir: false,
          absolute: false,
        });

        const maxResults = input.maxResults || 100;
        return matches.slice(0, maxResults);
      },
    },
  ];
}
```

## System Tools

**src/tools/system.ts:**

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { AppConfig } from '../config';
import { Tool } from './types';

const execAsync = promisify(exec);

export function createSystemTools(config: AppConfig): Tool[] {
  return [
    {
      name: 'run_shell_command',
      description: 'Execute a safe shell command. Only whitelisted commands are allowed for security.',
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to run (must be in whitelist)',
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments',
          },
        },
        required: ['command'],
      },
      execute: async (input: { command: string; args?: string[] }) => {
        // Whitelist of allowed commands
        const allowedCommands = ['ls', 'pwd', 'date', 'echo'];

        if (!allowedCommands.includes(input.command)) {
          throw new Error(`Command not allowed: ${input.command}`);
        }

        const args = input.args?.join(' ') || '';
        const fullCommand = `${input.command} ${args}`;

        const { stdout, stderr } = await execAsync(fullCommand, {
          cwd: config.allowedRootDir,
          timeout: 10000, // 10 second timeout
        });

        return {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command: fullCommand,
        };
      },
    },

    {
      name: 'get_system_info',
      description: 'Get basic system information like OS, architecture, and Node.js version.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        return {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        };
      },
    },

    {
      name: 'open_in_default_app',
      description: 'Open a file or URL in the default system application.',
      input_schema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'File path or URL to open',
          },
        },
        required: ['target'],
      },
      execute: async (input: { target: string }) => {
        const open = (await import('open')).default;
        await open(input.target);
        return {
          message: `Opened ${input.target}`,
        };
      },
    },
  ];
}
```

## ComfyUI Integration Tools

**src/tools/comfyui.ts:**

```typescript
import { AppConfig } from '../config';
import { Tool } from './types';

export function createComfyUITools(config: AppConfig): Tool[] {
  const apiUrl = config.comfyuiApiUrl;

  return [
    {
      name: 'comfyui_list_workflows',
      description: 'List available ComfyUI workflows.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const response = await fetch(`${apiUrl}/api/workflows`);
        if (!response.ok) {
          throw new Error(`ComfyUI API error: ${response.statusText}`);
        }
        return await response.json();
      },
    },

    {
      name: 'comfyui_queue_prompt',
      description: 'Queue a prompt/workflow for generation in ComfyUI.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'object',
            description: 'The ComfyUI workflow JSON',
          },
        },
        required: ['prompt'],
      },
      execute: async (input: { prompt: object }) => {
        const response = await fetch(`${apiUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: input.prompt }),
        });

        if (!response.ok) {
          throw new Error(`ComfyUI API error: ${response.statusText}`);
        }

        return await response.json();
      },
    },

    {
      name: 'comfyui_get_queue',
      description: 'Get the current ComfyUI generation queue status.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const response = await fetch(`${apiUrl}/queue`);
        if (!response.ok) {
          throw new Error(`ComfyUI API error: ${response.statusText}`);
        }
        return await response.json();
      },
    },
  ];
}
```

## Custom Tool Template

When adding a new tool:

```typescript
// src/tools/my-custom-tool.ts
import { Tool } from './types';
import { AppConfig } from '../config';

export function createMyCustomTools(config: AppConfig): Tool[] {
  return [
    {
      name: 'my_tool_name',
      description: 'Clear, specific description of what this tool does and when to use it. Be explicit about inputs and outputs.',
      input_schema: {
        type: 'object',
        properties: {
          paramName: {
            type: 'string',
            description: 'What this parameter is for',
          },
        },
        required: ['paramName'],
      },
      execute: async (input: { paramName: string }) => {
        // 1. Validate input
        if (!input.paramName) {
          throw new Error('paramName is required');
        }

        // 2. Check permissions/constraints
        // ...

        // 3. Perform operation
        const result = await performOperation(input.paramName);

        // 4. Return structured result
        return {
          success: true,
          data: result,
        };
      },
    },
  ];
}

async function performOperation(param: string): Promise<any> {
  // Implementation
}
```

## Security Best Practices

1. **Path Traversal Protection**
   - Always resolve and validate paths
   - Ensure they stay within allowed directories
   - Use `path.resolve()` and check with `startsWith()`

2. **Command Injection Prevention**
   - Whitelist allowed commands
   - Validate and sanitize all inputs
   - Use `child_process` safely

3. **Resource Limits**
   - Enforce file size limits
   - Set operation timeouts
   - Limit result set sizes

4. **Input Validation**
   - Validate against schema before execution
   - Check data types and formats
   - Reject unexpected inputs

5. **Error Messages**
   - Don't leak sensitive paths or system info
   - Provide actionable error messages
   - Log detailed errors to stderr only

## Testing Tools

**src/tools/__tests__/filesystem.test.ts:**

```typescript
import { createFilesystemTools } from '../filesystem';
import { AppConfig } from '../../config';

describe('Filesystem Tools', () => {
  const mockConfig: AppConfig = {
    allowedRootDir: '/tmp/test-workspace',
    maxFileSizeMb: 10,
    // ... other config
  };

  it('should reject paths outside allowed directory', async () => {
    const tools = createFilesystemTools(mockConfig);
    const readTool = tools.find(t => t.name === 'read_file')!;

    await expect(
      readTool.execute({ path: '../../etc/passwd' })
    ).rejects.toThrow('Access denied');
  });

  // More tests...
});
```

## Tool Documentation

For each tool, document:
- **Purpose:** What it does and when to use it
- **Inputs:** Expected parameters and formats
- **Outputs:** Return value structure
- **Errors:** Common error cases
- **Security:** Constraints and permissions
- **Examples:** Sample inputs/outputs

## Next Steps

- Implement UI for tool results → [05-web-ui.md](./05-web-ui.md)
- Configure security policies → [07-security-config.md](./07-security-config.md)

## Troubleshooting

**Tool not found:**
- Verify tool registered in `setupTools()`
- Check tool name matches exactly

**Permission denied:**
- Review path validation logic
- Check `allowedRootDir` configuration

**Tool execution timeout:**
- Increase timeout for long operations
- Consider making operation async with status checks
