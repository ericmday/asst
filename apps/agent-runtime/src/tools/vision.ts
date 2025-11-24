import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Tool } from './types.js';

const execAsync = promisify(exec);

export function createVisionTools(): Tool[] {
  return [
    {
      name: 'capture_screenshot',
      description: 'Capture a screenshot and return it as base64. On macOS, this uses the screencapture command.',
      input_schema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['fullscreen', 'window', 'region'],
            description: 'Screenshot mode: fullscreen (entire screen), window (specific window, interactive), region (user selects region, interactive)',
          },
        },
        required: [],
      },
      execute: async (input: { mode?: 'fullscreen' | 'window' | 'region' }) => {
        const mode = input.mode || 'fullscreen';
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
            image: base64Image,
            format: 'png',
            mode,
            size: imageBuffer.length,
          };
        } catch (error: any) {
          // Clean up temp file if it exists
          try {
            await unlink(tempPath);
          } catch {}

          throw new Error(`Screenshot capture failed: ${error.message}`);
        }
      },
    },

    {
      name: 'analyze_image',
      description: 'Read an image file from disk and return it as base64 for analysis. Supports common formats: png, jpg, jpeg, gif, webp.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the image file',
          },
        },
        required: ['path'],
      },
      execute: async (input: { path: string }) => {
        try {
          // Read the image file
          const imageBuffer = await readFile(input.path);

          // Determine format from extension
          const ext = input.path.toLowerCase().split('.').pop();
          const format = ext === 'jpg' ? 'jpeg' : ext;

          // Validate format
          const supportedFormats = ['png', 'jpeg', 'jpg', 'gif', 'webp'];
          if (!format || !supportedFormats.includes(format)) {
            throw new Error(`Unsupported image format: ${format}. Supported: ${supportedFormats.join(', ')}`);
          }

          const base64Image = imageBuffer.toString('base64');

          return {
            image: base64Image,
            format: format === 'jpg' ? 'jpeg' : format,
            path: input.path,
            size: imageBuffer.length,
          };
        } catch (error: any) {
          throw new Error(`Failed to read image: ${error.message}`);
        }
      },
    },
  ];
}
