import type { Tool } from './types.js';
import type { AppConfig } from '../config.js';
import { createFilesystemTools } from './filesystem.js';
import { createSystemTools } from './system.js';

export function setupTools(config: AppConfig): Tool[] {
  const tools: Tool[] = [
    ...createFilesystemTools(config),
    ...createSystemTools(config),
  ];

  // Optional tools based on config
  // if (config.comfyuiApiUrl) {
  //   tools.push(...createComfyUITools(config));
  // }

  return tools;
}

export type { Tool };
