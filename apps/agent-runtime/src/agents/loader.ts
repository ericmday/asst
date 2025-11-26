import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

const AGENTS_DIR = join(homedir(), '.claude', 'agents');

export interface AgentMetadata {
  icon?: string;
  color?: string;
  author?: string;
  version?: string;
}

export interface AgentConfig extends AgentDefinition {
  name: string;
  metadata?: AgentMetadata;
}

/**
 * Built-in agents that are always available
 */
function getBuiltInAgents(): Record<string, AgentDefinition> {
  return {
    researcher: {
      description: 'Use when user needs deep research on topics using web search and analysis. Expert at finding, synthesizing, and presenting information from multiple sources.',
      tools: ['WebSearch', 'WebFetch', 'read_file', 'write_file', 'read_clipboard', 'write_clipboard'],
      prompt: `You are a research specialist with deep expertise in information gathering and analysis.

Your capabilities:
- Conduct thorough web research using multiple search queries
- Fetch and analyze content from web pages
- Synthesize information from multiple sources
- Provide well-structured, citation-backed reports
- Save research findings to files for reference

When conducting research:
1. Break down complex questions into searchable components
2. Use web_search to find relevant sources
3. Use web_fetch to deep-dive into promising sources
4. Cross-reference information across sources
5. Cite all sources clearly
6. Present findings in a clear, organized format

Always provide citations and acknowledge source limitations.`,
      model: 'sonnet'
    },

    coder: {
      description: 'Use for code writing, refactoring, debugging, and implementing features. Expert at software development with clean, maintainable code.',
      tools: ['read_file', 'write_file', 'search_files', 'list_files', 'run_shell_command'],
      prompt: `You are a coding specialist focused on writing clean, maintainable, and well-tested code.

Your capabilities:
- Write new code following best practices
- Refactor existing code for better quality
- Debug and fix issues
- Implement features with proper error handling
- Write clear, helpful comments

When coding:
1. Read existing code to understand context and patterns
2. Follow the project's existing style and conventions
3. Write clean, self-documenting code
4. Add proper error handling
5. Test your changes when possible

Focus on code quality, readability, and maintainability over cleverness.`,
      model: 'sonnet'
    },

    'file-ops': {
      description: 'Use for batch file operations, organization, renaming, and filesystem management. Expert at handling multiple files efficiently.',
      tools: ['list_files', 'read_file', 'write_file', 'search_files', 'run_shell_command'],
      prompt: `You are a file operations specialist focused on efficient filesystem management.

Your capabilities:
- Organize files and directories
- Batch rename files following patterns
- Move, copy, and restructure file hierarchies
- Clean up duplicate or unnecessary files
- Search and filter files by various criteria

When working with files:
1. Always confirm destructive operations before executing
2. Provide clear summaries of what will be changed
3. Handle errors gracefully (missing files, permissions, etc.)
4. Use safe, reversible operations when possible
5. Report results clearly with counts and examples

Be careful with destructive operations and always communicate clearly.`,
      model: 'haiku'
    },

    analyst: {
      description: 'Use for data analysis, log parsing, pattern detection, and generating insights from structured/unstructured data.',
      tools: ['read_file', 'write_file', 'search_files', 'list_files', 'run_shell_command', 'read_clipboard', 'write_clipboard'],
      prompt: `You are a data analyst specialist focused on extracting insights from data.

Your capabilities:
- Parse and analyze log files
- Process CSV, JSON, and other structured data
- Detect patterns and anomalies
- Generate statistical summaries
- Create reports with visualizations (as text/markdown)

When analyzing data:
1. Understand the data structure first
2. Identify key metrics and patterns
3. Look for anomalies and outliers
4. Provide clear, actionable insights
5. Present findings in well-formatted reports

Focus on clarity and actionable insights over raw data dumps.`,
      model: 'sonnet'
    }
  };
}

/**
 * Validate an agent configuration
 */
function validateAgentConfig(config: any, source: string): config is AgentConfig {
  if (!config || typeof config !== 'object') {
    console.warn(`[agents] Invalid agent config from ${source}: not an object`);
    return false;
  }

  if (!config.name || typeof config.name !== 'string') {
    console.warn(`[agents] Invalid agent config from ${source}: missing or invalid name`);
    return false;
  }

  if (!config.description || typeof config.description !== 'string') {
    console.warn(`[agents] Invalid agent config from ${source}: missing or invalid description`);
    return false;
  }

  if (!config.prompt || typeof config.prompt !== 'string') {
    console.warn(`[agents] Invalid agent config from ${source}: missing or invalid prompt`);
    return false;
  }

  // tools and model are optional
  if (config.tools && !Array.isArray(config.tools)) {
    console.warn(`[agents] Invalid agent config from ${source}: tools must be an array`);
    return false;
  }

  if (config.model && !['sonnet', 'opus', 'haiku', 'inherit'].includes(config.model)) {
    console.warn(`[agents] Invalid agent config from ${source}: invalid model "${config.model}"`);
    return false;
  }

  return true;
}

/**
 * Load custom agent definitions from ~/.claude/agents/*.json
 */
async function loadCustomAgents(): Promise<Record<string, AgentDefinition>> {
  const customAgents: Record<string, AgentDefinition> = {};

  try {
    // Check if agents directory exists
    try {
      await fs.access(AGENTS_DIR);
    } catch {
      // Directory doesn't exist, return empty
      console.log('[agents] No custom agents directory found');
      return customAgents;
    }

    // Read all files in the agents directory
    const files = await fs.readdir(AGENTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    console.log(`[agents] Found ${jsonFiles.length} agent definition files`);

    for (const file of jsonFiles) {
      try {
        const filePath = join(AGENTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const config = JSON.parse(content);

        if (validateAgentConfig(config, file)) {
          const { name, metadata, ...agentDef } = config;

          // Store agent definition without name (SDK uses object keys as names)
          customAgents[name] = agentDef;

          console.log(`[agents] Loaded custom agent: ${name} from ${file}`);
        }
      } catch (error) {
        console.warn(`[agents] Failed to load agent from ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('[agents] Error loading custom agents:', error);
  }

  return customAgents;
}

/**
 * Load all agent definitions (built-in + custom)
 * Custom agents override built-in agents with the same name
 */
export async function loadAgentDefinitions(): Promise<Record<string, AgentDefinition>> {
  const builtIn = getBuiltInAgents();
  const custom = await loadCustomAgents();

  // Merge: custom agents override built-in
  const allAgents = { ...builtIn, ...custom };

  console.log(`[agents] Loaded ${Object.keys(allAgents).length} total agents (${Object.keys(builtIn).length} built-in, ${Object.keys(custom).length} custom)`);

  return allAgents;
}

/**
 * Get metadata for all agents (for UI display)
 */
export async function getAgentMetadata(): Promise<AgentConfig[]> {
  const agentMetadataList: AgentConfig[] = [];

  // Built-in agents metadata
  const builtInAgents = getBuiltInAgents();
  const builtInMetadata: Record<string, AgentMetadata> = {
    researcher: { icon: '🔍', color: 'blue', author: 'Desktop Assistant', version: '1.0.0' },
    coder: { icon: '💻', color: 'green', author: 'Desktop Assistant', version: '1.0.0' },
    'file-ops': { icon: '📁', color: 'yellow', author: 'Desktop Assistant', version: '1.0.0' },
    analyst: { icon: '📊', color: 'purple', author: 'Desktop Assistant', version: '1.0.0' }
  };

  for (const [name, def] of Object.entries(builtInAgents)) {
    agentMetadataList.push({
      name,
      ...def,
      metadata: builtInMetadata[name]
    });
  }

  // Load custom agents metadata
  try {
    try {
      await fs.access(AGENTS_DIR);
    } catch {
      return agentMetadataList;
    }

    const files = await fs.readdir(AGENTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const filePath = join(AGENTS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const config = JSON.parse(content);

        if (validateAgentConfig(config, file)) {
          // Check if this overrides a built-in agent
          const builtInIndex = agentMetadataList.findIndex(a => a.name === config.name);

          if (builtInIndex >= 0) {
            // Override built-in
            agentMetadataList[builtInIndex] = config;
          } else {
            // Add new custom agent
            agentMetadataList.push(config);
          }
        }
      } catch (error) {
        console.warn(`[agents] Failed to load metadata from ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('[agents] Error loading agent metadata:', error);
  }

  return agentMetadataList;
}
