# 01 - Project Setup

## Overview

This document covers the initial project scaffolding, monorepo structure, and dependency installation for the Desktop Assistant.

## Monorepo Structure

Using **pnpm workspaces** for monorepo management.

```
desktop-assistant/
├─ package.json              # Workspace root
├─ pnpm-workspace.yaml
├─ .gitignore
├─ .env.example
├─ claude.md
├─ docs/
│  └─ *.md
├─ apps/
│  ├─ tauri-shell/
│  │  ├─ package.json
│  │  ├─ vite.config.ts
│  │  ├─ index.html
│  │  ├─ src/               # React UI
│  │  │  ├─ main.tsx
│  │  │  ├─ App.tsx
│  │  │  ├─ components/
│  │  │  └─ lib/
│  │  └─ src-tauri/         # Rust/Tauri
│  │     ├─ Cargo.toml
│  │     ├─ tauri.conf.json
│  │     ├─ build.rs
│  │     └─ src/
│  │        ├─ main.rs
│  │        ├─ ipc.rs
│  │        └─ agent_process.rs
│  └─ agent-runtime/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts
│        ├─ agent.ts
│        ├─ config.ts
│        └─ tools/
│           ├─ index.ts
│           ├─ filesystem.ts
│           ├─ system.ts
│           └─ comfyui.ts
└─ packages/                # Shared packages (optional)
   └─ shared-types/
      ├─ package.json
      └─ src/
         └─ index.ts
```

## Initial Setup Steps

### 1. Initialize Root Package

```bash
# Create project directory
mkdir desktop-assistant
cd desktop-assistant

# Initialize pnpm workspace
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << EOF
packages:
  - 'apps/*'
  - 'packages/*'
EOF
```

### 2. Root package.json

```json
{
  "name": "desktop-assistant",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:tauri": "pnpm --filter tauri-shell tauri dev",
    "dev:agent": "pnpm --filter agent-runtime dev",
    "build:tauri": "pnpm --filter tauri-shell tauri build",
    "build:agent": "pnpm --filter agent-runtime build",
    "build": "pnpm build:agent && pnpm build:tauri"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

### 3. Create Tauri Shell

```bash
# Create app directory
mkdir -p apps/tauri-shell
cd apps/tauri-shell

# Use Tauri CLI to initialize
pnpm create tauri-app . --template react-ts

# Install additional dependencies
pnpm add zustand
pnpm add -D @types/node
```

**apps/tauri-shell/package.json:**

```json
{
  "name": "tauri-shell",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri dev": "tauri dev",
    "tauri build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^1.5.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^1.5.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

### 4. Create Agent Runtime

```bash
# From project root
mkdir -p apps/agent-runtime/src/tools
cd apps/agent-runtime

# Initialize package
pnpm init
```

**apps/agent-runtime/package.json:**

```json
{
  "name": "agent-runtime",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

**apps/agent-runtime/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Environment Variables

Create `.env.example` in project root:

```env
# Claude API Configuration
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Agent Runtime Configuration
ALLOWED_ROOT_DIR=/Users/yourusername/allowed-workspace
MAX_FILE_SIZE_MB=10

# Optional Tool Configurations
COMFYUI_API_URL=http://localhost:8188
FIREBASE_PROJECT_ID=your-project-id
```

### 6. Git Setup

`.gitignore`:

```
# Dependencies
node_modules/
**/node_modules/

# Build outputs
dist/
build/
target/
apps/tauri-shell/src-tauri/target/

# Environment
.env
.env.local

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Tauri
apps/tauri-shell/src-tauri/target/
```

### 7. Install All Dependencies

From project root:

```bash
# Install all workspace dependencies
pnpm install
```

## Verification Checklist

- [ ] pnpm workspace configured
- [ ] Tauri shell initializes with `pnpm dev:tauri`
- [ ] Agent runtime starts with `pnpm dev:agent`
- [ ] TypeScript compiles without errors
- [ ] .env.example created (not .env with real keys)
- [ ] Git initialized and .gitignore in place

## Next Steps

Once setup is complete:
1. Configure Tauri shell basics → [02-tauri-shell.md](./02-tauri-shell.md)
2. Implement IPC protocol → [06-ipc-protocol.md](./06-ipc-protocol.md)
3. Build agent runtime core → [03-agent-runtime.md](./03-agent-runtime.md)

## Troubleshooting

**pnpm workspace not resolving:**
- Ensure `pnpm-workspace.yaml` is in project root
- Check package names match workspace paths

**Tauri fails to start:**
- Ensure Rust toolchain installed: `rustup default stable`
- Check system prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites

**TypeScript errors:**
- Verify tsconfig.json `moduleResolution: "node"`
- Check all @types packages installed
