import Redis from 'ioredis';
import { logger as getLogger } from '../../shared/logger.js';
import type { StorageBackend } from './StorageBackend.js';
import type { GlobalClaudeSettings, Task } from '../sessions/types.js';

const GLOBAL_CLAUDE_SETTINGS_KEY = 'claude:global:settings';

/**
 * Redis storage backend adapter
 */
export class RedisStorage implements StorageBackend {
  private redis: Redis;
  private logger = getLogger();

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      retryStrategy(times) {
        // Stop retrying after 3 attempts
        if (times > 3) {
          return null;
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected', { url: redisUrl });
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis error', { err });
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }

  async hset(key: string, data: Record<string, string>): Promise<void> {
    await this.redis.hset(key, data);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.redis.sadd(key, ...members);
    }
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.redis.sismember(key, member);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.redis.srem(key, ...members);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.redis.set(key, value);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Check if Redis is connected and ready
   */
  async ping(): Promise<boolean> {
    try {
      await this.redis.connect();
      await this.redis.ping();
      return true;
    } catch {
      // Disconnect to stop retries
      this.redis.disconnect();
      return false;
    }
  }

  async getGlobalClaudeSettings(): Promise<GlobalClaudeSettings | null> {
    const data = await this.redis.get(GLOBAL_CLAUDE_SETTINGS_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data) as GlobalClaudeSettings;
    } catch {
      this.logger.error('Failed to parse global Claude settings');
      return null;
    }
  }

  async setGlobalClaudeSettings(settings: GlobalClaudeSettings): Promise<void> {
    await this.redis.set(GLOBAL_CLAUDE_SETTINGS_KEY, JSON.stringify(settings));
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
    const data = await this.redis.get(`task:${taskId}`);
    if (!data) return null;
    try {
      return JSON.parse(data) as Task;
    } catch {
      this.logger.error('Failed to parse task', { taskId });
      return null;
    }
  }

  async createTask(task: Task): Promise<void> {
    await this.redis.set(`task:${task.id}`, JSON.stringify(task));
    await this.sadd(`tasks:${task.projectPath}`, task.id);
  }

  async updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'projectPath' | 'createdAt'>>): Promise<Task | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const updated = { ...task, ...updates, updatedAt: new Date().toISOString() };
    await this.redis.set(`task:${taskId}`, JSON.stringify(updated));
    return updated;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (task) {
      await this.redis.del(`task:${taskId}`);
      await this.srem(`tasks:${task.projectPath}`, taskId);
    }
  }
}
