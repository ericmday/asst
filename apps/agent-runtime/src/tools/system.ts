import { exec } from 'child_process';
import { promisify } from 'util';
import type { AppConfig } from '../config.js';
import type { Tool } from './types.js';

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
        const allowedCommands = ['ls', 'pwd', 'date', 'echo', 'cat', 'grep'];

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
