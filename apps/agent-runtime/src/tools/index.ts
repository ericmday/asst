import type { Tool } from './types.js';
import type { AppConfig } from '../config.js';
import { createFilesystemTools } from './filesystem.js';
import { createSystemTools } from './system.js';
import { createClipboardTools } from './clipboard.js';
import { createVisionTools } from './vision.js';
import { loadCustomTools } from './custom.js';

export async function setupTools(config: AppConfig): Promise<Tool[]> {
  const tools: Tool[] = [
    ...createFilesystemTools(config),
    ...createSystemTools(config),
    ...createClipboardTools(),
    ...createVisionTools(),
  ];

  // Load custom user-defined tools
  const customTools = await loadCustomTools();
  tools.push(...customTools);

  // Optional tools based on config
  // if (config.comfyuiApiUrl) {
  //   tools.push(...createComfyUITools(config));
  // }

  return tools;
}

export type { Tool };
