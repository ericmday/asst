import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import type Anthropic from '@anthropic-ai/sdk';

const CLAUDE_DIR = join(homedir(), '.claude');
const DB_PATH = join(CLAUDE_DIR, 'history.db');

// Ensure .claude directory exists
if (!existsSync(CLAUDE_DIR)) {
  mkdirSync(CLAUDE_DIR, { recursive: true });
}

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string; // JSON stringified content
  timestamp: number;
}

export class ConversationDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, timestamp);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updated
      ON conversations(updated_at DESC);
    `);
  }

  // Conversation methods
  createConversation(id: string, title: string): Conversation {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, title, now, now);

    return { id, title, created_at: now, updated_at: now };
  }

  getConversation(id: string): Conversation | null {
    const stmt = this.db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      WHERE id = ?
    `);
    return stmt.get(id) as Conversation | null;
  }

  getAllConversations(): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      ORDER BY updated_at DESC
    `);
    return stmt.all() as Conversation[];
  }

  updateConversationTitle(id: string, title: string): void {
    const stmt = this.db.prepare(`
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(title, Date.now(), id);
  }

  touchConversation(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  deleteConversation(id: string): void {
    // Delete messages first (CASCADE should handle this, but being explicit)
    const deleteMessages = this.db.prepare(`
      DELETE FROM messages WHERE conversation_id = ?
    `);
    deleteMessages.run(id);

    // Delete conversation
    const deleteConv = this.db.prepare(`
      DELETE FROM conversations WHERE id = ?
    `);
    deleteConv.run(id);
  }

  // Message methods
  addMessage(conversationId: string, role: 'user' | 'assistant', content: Anthropic.MessageParam['content']): Message {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    const contentStr = JSON.stringify(content);

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, conversationId, role, contentStr, timestamp);

    // Touch the conversation to update its updated_at
    this.touchConversation(conversationId);

    return {
      id,
      conversation_id: conversationId,
      role,
      content: contentStr,
      timestamp,
    };
  }

  getMessages(conversationId: string): Message[] {
    const stmt = this.db.prepare(`
      SELECT id, conversation_id, role, content, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(conversationId) as Message[];
  }

  getMessageHistory(conversationId: string): Anthropic.MessageParam[] {
    const messages = this.getMessages(conversationId);
    return messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: JSON.parse(msg.content),
    }));
  }

  clearMessages(conversationId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM messages WHERE conversation_id = ?
    `);
    stmt.run(conversationId);
  }

  // Utility methods
  close(): void {
    this.db.close();
  }

  // Get database stats
  getStats(): { conversations: number; messages: number; dbSize: number } {
    const convCount = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
    const msgCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const dbSize = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number };

    return {
      conversations: convCount.count,
      messages: msgCount.count,
      dbSize: dbSize.size,
    };
  }
}
