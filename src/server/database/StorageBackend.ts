import type { GlobalClaudeSettings, Task } from '../sessions/types.js';

/**
 * Storage backend interface for session data
 * Allows swapping between Redis and in-memory storage
 */
export interface StorageBackend {
  // Hash operations (for session data)
  hset(key: string, data: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;

  // Set operations (for session lists)
  sadd(key: string, ...members: string[]): Promise<void>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<number>;
  srem(key: string, ...members: string[]): Promise<void>;

  // Key operations
  del(...keys: string[]): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;

  // Connection management
  close(): Promise<void>;

  // Global Claude settings
  getGlobalClaudeSettings(): Promise<GlobalClaudeSettings | null>;
  setGlobalClaudeSettings(settings: GlobalClaudeSettings): Promise<void>;

  // Task management
  getTasks(projectPath: string): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  createTask(task: Task): Promise<void>;
  updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'projectPath' | 'createdAt'>>): Promise<Task | null>;
  deleteTask(taskId: string): Promise<void>;
}
