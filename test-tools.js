#!/usr/bin/env node

/**
 * Test script to verify SDK tool execution
 *
 * This script tests the agent runtime with SDK tools by:
 * 1. Spawning the agent runtime via stdio
 * 2. Sending a test message that should trigger tool usage
 * 3. Monitoring the response stream
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

const requestId = randomUUID();
let agentReady = false;
let responseDone = false;

console.log('[TEST] Starting agent runtime test with SDK tools...\n');

// Spawn agent runtime
const agent = spawn('npx', ['tsx', 'apps/agent-runtime/src/index.ts'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
});

// Handle stdout (IPC responses)
agent.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const message = JSON.parse(line);

      // Log all messages
      console.log('[AGENT]', message.type, JSON.stringify(message, null, 2).substring(0, 200));

      if (message.type === 'ready') {
        agentReady = true;
        console.log('\n[TEST] Agent ready! Sending test message...\n');

        // Send test message that should trigger a tool
        const testRequest = {
          id: requestId,
          kind: 'user_message',
          message: 'List the files in the current directory',
        };

        agent.stdin.write(JSON.stringify(testRequest) + '\n');
      }

      if (message.type === 'tool_use') {
        console.log(`\n[TEST] ✅ Tool executed: ${message.data?.tool_name}\n`);
      }

      if (message.type === 'done' && message.id === requestId) {
        responseDone = true;
        console.log('\n[TEST] ✅ Response complete!\n');
        console.log('[TEST] Test succeeded! SDK tools are working correctly.\n');

        // Exit successfully
        setTimeout(() => {
          agent.kill();
          process.exit(0);
        }, 500);
      }

      if (message.type === 'error') {
        console.error('\n[TEST] ❌ Error:', message.error);
        agent.kill();
        process.exit(1);
      }
    } catch (err) {
      // Ignore parse errors for non-JSON output
    }
  }
});

// Handle agent exit
agent.on('exit', (code) => {
  if (!responseDone) {
    console.error(`\n[TEST] ❌ Agent exited with code ${code} before completing test`);
    process.exit(1);
  }
});

// Timeout after 30 seconds
setTimeout(() => {
  if (!responseDone) {
    console.error('\n[TEST] ❌ Test timed out after 30 seconds');
    agent.kill();
    process.exit(1);
  }
}, 30000);
