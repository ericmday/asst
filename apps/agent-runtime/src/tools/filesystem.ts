import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import type { AppConfig } from '../config.js';
import type { Tool } from './types.js';

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
