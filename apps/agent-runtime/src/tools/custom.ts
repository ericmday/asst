import { readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { pathToFileURL } from 'url';
import type { Tool } from './types.js';

const TOOLS_DIR = join(homedir(), '.claude', 'tools');

interface CustomToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (input: any) => Promise<any> | any;
}

/**
 * Validate a custom tool definition
 */
function validateToolDefinition(tool: any, filepath: string): tool is CustomToolDefinition {
  if (!tool || typeof tool !== 'object') {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: Must export an object`);
    return false;
  }

  if (typeof tool.name !== 'string' || tool.name.length === 0) {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: Missing or invalid 'name' field`);
    return false;
  }

  if (typeof tool.description !== 'string' || tool.description.length === 0) {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: Missing or invalid 'description' field`);
    return false;
  }

  if (!tool.input_schema || typeof tool.input_schema !== 'object') {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: Missing or invalid 'input_schema' field`);
    return false;
  }

  if (tool.input_schema.type !== 'object') {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: input_schema.type must be 'object'`);
    return false;
  }

  if (!tool.input_schema.properties || typeof tool.input_schema.properties !== 'object') {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: input_schema.properties must be an object`);
    return false;
  }

  if (typeof tool.execute !== 'function') {
    console.error(`[Custom Tools] Invalid tool in ${filepath}: Missing or invalid 'execute' function`);
    return false;
  }

  return true;
}

/**
 * Load all custom tools from .claude/tools/ directory
 * Each tool should be a .js or .mjs file that exports:
 * - name: string
 * - description: string
 * - input_schema: { type: 'object', properties: {...}, required?: [...] }
 * - execute: async (input: any) => any
 */
export async function loadCustomTools(): Promise<Tool[]> {
  const tools: Tool[] = [];

  // Check if tools directory exists
  if (!existsSync(TOOLS_DIR)) {
    console.error(`[Custom Tools] Directory not found: ${TOOLS_DIR}`);
    console.error(`[Custom Tools] Create it to add custom tools`);
    return tools;
  }

  try {
    const files = readdirSync(TOOLS_DIR);

    for (const file of files) {
      // Only load .js and .mjs files
      if (!file.endsWith('.js') && !file.endsWith('.mjs')) {
        continue;
      }

      const filepath = join(TOOLS_DIR, file);

      // Skip if not a file
      if (!statSync(filepath).isFile()) {
        continue;
      }

      try {
        console.error(`[Custom Tools] Loading tool from ${file}...`);

        // Import the tool module using file:// URL
        const fileUrl = pathToFileURL(filepath).href;
        const module = await import(fileUrl);

        // Get the default export or the module itself
        const toolDef = module.default || module;

        // Validate the tool definition
        if (!validateToolDefinition(toolDef, file)) {
          continue;
        }

        // Create Tool object
        const tool: Tool = {
          name: toolDef.name,
          description: toolDef.description,
          input_schema: toolDef.input_schema,
          execute: async (input: any) => {
            try {
              return await toolDef.execute(input);
            } catch (error) {
              throw new Error(`Custom tool '${toolDef.name}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        };

        tools.push(tool);
        console.error(`[Custom Tools] Loaded tool: ${tool.name}`);

      } catch (error) {
        console.error(`[Custom Tools] Failed to load ${file}:`, error instanceof Error ? error.message : error);
      }
    }

    console.error(`[Custom Tools] Successfully loaded ${tools.length} custom tool(s)`);

  } catch (error) {
    console.error(`[Custom Tools] Error reading tools directory:`, error instanceof Error ? error.message : error);
  }

  return tools;
}

/**
 * Create a sample custom tool file for documentation
 */
export function createSampleTool(): string {
  return `// Sample custom tool for Claude Desktop Assistant
// Place this file in ~/.claude/tools/

export default {
  name: 'sample_tool',
  description: 'A sample custom tool that demonstrates the format',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A message to process',
      },
      count: {
        type: 'number',
        description: 'How many times to repeat',
      },
    },
    required: ['message'],
  },
  execute: async (input) => {
    const { message, count = 1 } = input;
    return {
      result: message.repeat(count),
      processed_at: new Date().toISOString(),
    };
  },
};
`;
}
