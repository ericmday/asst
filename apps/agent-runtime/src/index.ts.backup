import { createInterface } from 'readline';
import { AgentOrchestrator } from './agent.js';
import { loadConfig } from './config.js';
import { setupTools } from './tools/index.js';

async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    // Setup tools (async to load custom tools)
    const tools = await setupTools(config);

    // Create agent orchestrator
    const orchestrator = new AgentOrchestrator(config, tools);
    await orchestrator.initialize();

    // Setup stdio IPC
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Handle incoming messages
    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line);
        await orchestrator.handleRequest(request);
      } catch (error) {
        const errorResponse = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        };
        console.log(JSON.stringify(errorResponse));
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });

    // Send ready signal
    console.log(JSON.stringify({ type: 'ready', timestamp: Date.now() }));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down...');
  process.exit(0);
});

main();
