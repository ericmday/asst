/**
 * SDK-Compatible Tool Definitions
 *
 * This file converts our custom tools to SDK format using:
 * - tool() helper from @anthropic-ai/claude-agent-sdk
 * - Zod schemas for input validation
 * - CallToolResult for return values
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AppConfig } from './config.js';

const execAsync = promisify(exec);

/**
 * Create all SDK-compatible tools
 */
export function createSDKTools(config: AppConfig) {
  const allowedRoot = path.resolve(config.allowedRootDir);

  // Helper to validate paths
  function validatePath(relativePath: string): string {
    const resolved = path.resolve(allowedRoot, relativePath);
    if (!resolved.startsWith(allowedRoot)) {
      throw new Error('Access denied: path outside allowed directory');
    }
    return resolved;
  }

  // ============================================================================
  // FILESYSTEM TOOLS
  // ============================================================================

  const list_files = tool(
    'list_files',
    'List files and directories at a given path within the allowed workspace. Returns name, type (file/directory), and path.',
    {
      path: z.string().optional().describe('Relative path from workspace root (e.g., "src" or "src/components"). Defaults to "." for root directory.'),
    },
    async (args: { path?: string }) => {
      const inputPath = args.path || '.';
      const targetPath = validatePath(inputPath);
      const entries = await fs.readdir(targetPath, { withFileTypes: true });

      const result = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(inputPath, entry.name),
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  const read_file = tool(
    'read_file',
    'Read the contents of a text file within the allowed workspace. Use this to examine code, configuration, or documentation files.',
    {
      path: z.string().describe('Relative path to the file (e.g., "src/index.ts")'),
    },
    async (args: { path: string }) => {
      const targetPath = validatePath(args.path);
      const stats = await fs.stat(targetPath);

      // Check file size
      const maxSizeBytes = config.maxFileSizeMb * 1024 * 1024;
      if (stats.size > maxSizeBytes) {
        throw new Error(`File too large (max ${config.maxFileSizeMb}MB)`);
      }

      const content = await fs.readFile(targetPath, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            path: args.path,
            content,
            size: stats.size,
          }, null, 2)
        }],
      };
    }
  );

  const write_file = tool(
    'write_file',
    'Write or overwrite a text file within the allowed workspace. Use this to create new files or update existing ones.',
    {
      path: z.string().describe('Relative path to the file'),
      content: z.string().describe('The content to write to the file'),
    },
    async (args: { path: string; content: string }) => {
      const targetPath = validatePath(args.path);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Write file
      await fs.writeFile(targetPath, args.content, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            path: args.path,
            size: Buffer.byteLength(args.content, 'utf-8'),
            message: 'File written successfully',
          }, null, 2)
        }],
      };
    }
  );

  const search_files = tool(
    'search_files',
    'Search for files by name pattern within the allowed workspace. Supports glob patterns.',
    {
      pattern: z.string().describe('Glob pattern (e.g., "**/*.ts" for all TypeScript files)'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 100)'),
    },
    async (args: { pattern: string; maxResults?: number }) => {
      const matches = await glob(args.pattern, {
        cwd: allowedRoot,
        nodir: false,
        absolute: false,
      });

      const maxResults = args.maxResults || 100;
      const result = matches.slice(0, maxResults);

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ============================================================================
  // SYSTEM TOOLS
  // ============================================================================

  const run_shell_command = tool(
    'run_shell_command',
    'Execute a safe shell command. Only whitelisted commands are allowed for security.',
    {
      command: z.string().describe('The shell command to run (must be in whitelist)'),
      args: z.array(z.string()).optional().describe('Command arguments'),
    },
    async (args: { command: string; args?: string[] }) => {
      // Whitelist of allowed commands
      const allowedCommands = ['ls', 'pwd', 'date', 'echo', 'cat', 'grep'];

      if (!allowedCommands.includes(args.command)) {
        throw new Error(`Command not allowed: ${args.command}`);
      }

      const cmdArgs = args.args?.join(' ') || '';
      const fullCommand = `${args.command} ${cmdArgs}`;

      const { stdout, stderr } = await execAsync(fullCommand, {
        cwd: config.allowedRootDir,
        timeout: 10000, // 10 second timeout
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            command: fullCommand,
          }, null, 2)
        }],
      };
    }
  );

  const get_system_info = tool(
    'get_system_info',
    'Get basic system information like OS, architecture, and Node.js version.',
    {},
    async () => {
      const result = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  const open_in_default_app = tool(
    'open_in_default_app',
    'Open a file or URL in the default system application.',
    {
      target: z.string().describe('File path or URL to open'),
    },
    async (args: { target: string }) => {
      const open = (await import('open')).default;
      await open(args.target);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `Opened ${args.target}`,
          }, null, 2)
        }],
      };
    }
  );

  // ============================================================================
  // CLIPBOARD TOOLS
  // ============================================================================

  const read_clipboard = tool(
    'read_clipboard',
    'Read text content from the system clipboard.',
    {},
    async () => {
      const clipboardy = (await import('clipboardy')).default;
      const content = await clipboardy.read();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            content,
            length: content.length,
          }, null, 2)
        }],
      };
    }
  );

  const write_clipboard = tool(
    'write_clipboard',
    'Write text content to the system clipboard.',
    {
      content: z.string().describe('Text content to write to clipboard'),
    },
    async (args: { content: string }) => {
      const clipboardy = (await import('clipboardy')).default;
      await clipboardy.write(args.content);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Successfully wrote to clipboard',
            length: args.content.length,
          }, null, 2)
        }],
      };
    }
  );

  // ============================================================================
  // VISION TOOLS
  // ============================================================================

  const capture_screenshot = tool(
    'capture_screenshot',
    'Capture a screenshot and return it as base64. On macOS, this uses the screencapture command.',
    {
      mode: z.enum(['fullscreen', 'window', 'region']).optional().describe('Screenshot mode: fullscreen (entire screen), window (specific window, interactive), region (user selects region, interactive)'),
    },
    async (args: { mode?: 'fullscreen' | 'window' | 'region' }) => {
      const mode = args.mode || 'fullscreen';
      const tempPath = join(tmpdir(), `screenshot-${Date.now()}.png`);

      try {
        // Build screencapture command based on mode
        let command = 'screencapture';
        if (mode === 'window') {
          command += ' -w'; // Window mode (interactive)
        } else if (mode === 'region') {
          command += ' -s'; // Selection mode (interactive)
        }
        command += ` ${tempPath}`;

        // Execute screenshot command
        await execAsync(command, { timeout: 30000 }); // 30s timeout for user selection

        // Read the screenshot file
        const imageBuffer = await readFile(tempPath);
        const base64Image = imageBuffer.toString('base64');

        // Clean up temp file
        await unlink(tempPath);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              image: base64Image,
              format: 'png',
              mode,
              size: imageBuffer.length,
            }, null, 2)
          }],
        };
      } catch (error: any) {
        // Clean up temp file if it exists
        try {
          await unlink(tempPath);
        } catch {}

        throw new Error(`Screenshot capture failed: ${error.message}`);
      }
    }
  );

  const analyze_image = tool(
    'analyze_image',
    'Read an image file from disk and return it as base64 for analysis. Supports common formats: png, jpg, jpeg, gif, webp.',
    {
      path: z.string().describe('Path to the image file'),
    },
    async (args: { path: string }) => {
      try {
        // Read the image file
        const imageBuffer = await readFile(args.path);

        // Determine format from extension
        const ext = args.path.toLowerCase().split('.').pop();
        const format = ext === 'jpg' ? 'jpeg' : ext;

        // Validate format
        const supportedFormats = ['png', 'jpeg', 'jpg', 'gif', 'webp'];
        if (!format || !supportedFormats.includes(format)) {
          throw new Error(`Unsupported image format: ${format}. Supported: ${supportedFormats.join(', ')}`);
        }

        const base64Image = imageBuffer.toString('base64');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              image: base64Image,
              format: format === 'jpg' ? 'jpeg' : format,
              path: args.path,
              size: imageBuffer.length,
            }, null, 2)
          }],
        };
      } catch (error: any) {
        throw new Error(`Failed to read image: ${error.message}`);
      }
    }
  );

  // ============================================================================
  // CREATE MCP SERVER WITH ALL TOOLS
  // ============================================================================

  return createSdkMcpServer({
    name: 'desktop-assistant-tools',
    version: '1.0.0',
    tools: [
      // Filesystem
      list_files,
      read_file,
      write_file,
      search_files,
      // System
      run_shell_command,
      get_system_info,
      open_in_default_app,
      // Clipboard
      read_clipboard,
      write_clipboard,
      // Vision
      capture_screenshot,
      analyze_image,
    ],
  });
}
