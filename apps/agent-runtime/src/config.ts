import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from repository root (../../.env from src/)
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

export interface AppConfig {
  // Claude API
  anthropicApiKey: string;
  modelId: string;
  maxTokens: number;

  // Tool configuration
  allowedRootDir: string;
  maxFileSizeMb: number;

  // Optional integrations
  comfyuiApiUrl?: string;
  firebaseProjectId?: string;

  // Runtime settings
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    modelId: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022', // Using stable version due to tool input issues with newer models
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096', 10),

    allowedRootDir: process.env.ALLOWED_ROOT_DIR || path.join(process.env.HOME || '', 'workspace'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),

    comfyuiApiUrl: process.env.COMFYUI_API_URL,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,

    logLevel: (process.env.LOG_LEVEL as any) || 'debug',
  };

  // Validate required fields
  if (!config.anthropicApiKey) {
    console.error('Warning: ANTHROPIC_API_KEY is not set. Agent will not function without it.');
  }

  return config;
}
