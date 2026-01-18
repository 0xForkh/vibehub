import type { StorageBackend } from './StorageBackend.js';
import type { GlobalClaudeSettings, Task } from '../sessions/types.js';

const GLOBAL_CLAUDE_SETTINGS_KEY = 'claude:global:settings';

/**
 * In-memory storage backend (fallback when Redis is not available)
 * Note: Data is lost when the server restarts
 */
export class MemoryStorage implements StorageBackend {
  private hashes: Map<string, Map<string, string>> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private strings: Map<string, string> = new Map();

  async hset(key: string, data: Record<string, string>): Promise<void> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key)!;
    Object.entries(data).forEach(([field, value]) => {
      hash.set(field, value);
    });
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) {
      return {};
    }
    const result: Record<string, string> = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    return result;
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    members.forEach(member => set.add(member));
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    return set && set.has(member) ? 1 : 0;
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    const set = this.sets.get(key);
    if (set) {
      members.forEach(member => set.delete(member));
    }
  }

  async del(...keys: string[]): Promise<void> {
    keys.forEach(key => {
      this.hashes.delete(key);
      this.sets.delete(key);
      this.strings.delete(key);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.strings.set(key, value);
  }

  async keys(pattern: string): Promise<string[]> {
    // Simple pattern matching (supports * wildcard)
    const regex = new RegExp(
      `^${  pattern.replace(/\*/g, '.*').replace(/\?/g, '.')  }$`
    );

    const allKeys = new Set<string>();
    this.hashes.forEach((_, key) => allKeys.add(key));
    this.sets.forEach((_, key) => allKeys.add(key));
    this.strings.forEach((_, key) => allKeys.add(key));

    return Array.from(allKeys).filter(key => regex.test(key));
  }

  // eslint-disable-next-line class-methods-use-this
  async close(): Promise<void> {
    // Nothing to close for in-memory storage
  }

  async getGlobalClaudeSettings(): Promise<GlobalClaudeSettings | null> {
    const data = this.strings.get(GLOBAL_CLAUDE_SETTINGS_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data) as GlobalClaudeSettings;
    } catch {
      return null;
    }
  }

  async setGlobalClaudeSettings(settings: GlobalClaudeSettings): Promise<void> {
    this.strings.set(GLOBAL_CLAUDE_SETTINGS_KEY, JSON.stringify(settings));
  }

  // Task management
  async getTasks(projectPath: string): Promise<Task[]> {
    const taskIds = await this.smembers(`tasks:${projectPath}`);
    const tasks: Task[] = [];
    for (const id of taskIds) {
      const task = await this.getTask(id);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const data = this.strings.get(`task:${taskId}`);
    if (!data) return null;
    try {
      return JSON.parse(data) as Task;
    } catch {
      return null;
    }
  }

  async createTask(task: Task): Promise<void> {
    this.strings.set(`task:${task.id}`, JSON.stringify(task));
    await this.sadd(`tasks:${task.projectPath}`, task.id);
  }

  async updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'projectPath' | 'createdAt'>>): Promise<Task | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const updated = { ...task, ...updates, updatedAt: new Date().toISOString() };
    this.strings.set(`task:${taskId}`, JSON.stringify(updated));
    return updated;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (task) {
      this.strings.delete(`task:${taskId}`);
      await this.srem(`tasks:${task.projectPath}`, taskId);
    }
  }
}
