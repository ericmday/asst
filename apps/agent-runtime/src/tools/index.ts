import type { AppConfig } from '../config.js';

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: any) => Promise<any>;
}

export function setupTools(config: AppConfig): Tool[] {
  // For now, return an empty array
  // Tools will be implemented in Phase 3
  return [];
}
