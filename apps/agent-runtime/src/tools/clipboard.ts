import type { Tool } from './types.js';

export function createClipboardTools(): Tool[] {
  return [
    {
      name: 'read_clipboard',
      description: 'Read text content from the system clipboard.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const clipboardy = (await import('clipboardy')).default;
        const content = await clipboardy.read();
        return {
          content,
          length: content.length,
        };
      },
    },

    {
      name: 'write_clipboard',
      description: 'Write text content to the system clipboard.',
      input_schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Text content to write to clipboard',
          },
        },
        required: ['content'],
      },
      execute: async (input: { content: string }) => {
        const clipboardy = (await import('clipboardy')).default;
        await clipboardy.write(input.content);
        return {
          message: 'Successfully wrote to clipboard',
          length: input.content.length,
        };
      },
    },
  ];
}
