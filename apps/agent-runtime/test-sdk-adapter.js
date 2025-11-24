#!/usr/bin/env node
/**
 * Simple test script to verify SDK adapter works
 * Usage: node test-sdk-adapter.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🧪 Testing SDK Adapter...\n');

// Spawn the agent runtime
const agentProcess = spawn('npx', ['tsx', join(__dirname, 'src/index.ts')], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'inherit'],
});

let ready = false;
let responseBuffer = '';

// Handle responses from agent
agentProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const message = JSON.parse(line);

      if (message.type === 'ready') {
        console.log('✅ Agent ready!');
        ready = true;

        // Send a test message
        console.log('\n📤 Sending test message: "Hello, what is 2+2?"');
        const request = {
          id: 'test-1',
          kind: 'user_message',
          message: 'Hello, what is 2+2?'
        };
        agentProcess.stdin.write(JSON.stringify(request) + '\n');
      }
      else if (message.type === 'token') {
        process.stdout.write(message.token);
        responseBuffer += message.token;
      }
      else if (message.type === 'done') {
        console.log('\n\n✅ Response complete!');
        console.log('📊 Stats:', message.data);
        console.log('\n🎉 Test passed! SDK adapter is working.\n');

        // Clean exit
        agentProcess.kill();
        process.exit(0);
      }
      else if (message.type === 'error') {
        console.error('\n❌ Error:', message.error);
        agentProcess.kill();
        process.exit(1);
      }
      else {
        console.log(`\n📨 ${message.type}:`, JSON.stringify(message.data || message, null, 2));
      }
    } catch (e) {
      console.error('Failed to parse message:', line, e.message);
    }
  }
});

agentProcess.on('error', (error) => {
  console.error('❌ Failed to start agent:', error);
  process.exit(1);
});

agentProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\n❌ Agent exited with code ${code}`);
    process.exit(code);
  }
});

// Timeout after 60 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout after 60 seconds');
  agentProcess.kill();
  process.exit(1);
}, 60000);
