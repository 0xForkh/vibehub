import { logger as getLogger } from '../../shared/logger.js';
import { MemoryStorage } from './MemoryStorage.js';
import { RedisStorage } from './RedisStorage.js';
import type { StorageBackend } from './StorageBackend.js';

let storage: StorageBackend | null = null;
const logger = getLogger();

/**
 * Get storage backend (Redis with fallback to in-memory)
 * In development mode, always use in-memory to avoid conflicts with production
 */
export async function getStorageBackend(): Promise<StorageBackend> {
  if (!storage) {
    // Force in-memory storage in development mode
    if (process.env.NODE_ENV === 'development') {
      logger.info('Development mode: using in-memory storage');
      storage = new MemoryStorage();
      return storage;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Try Redis first
    try {
      logger.info('Attempting to connect to Redis', { url: redisUrl });
      const redisStorage = new RedisStorage(redisUrl);

      // Test connection with timeout
      const connected = await Promise.race([
        redisStorage.ping(),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 3000);
        })
      ]);

      if (connected) {
        logger.info('✅ Using Redis storage backend');
        storage = redisStorage;
      } else {
        throw new Error('Redis connection timeout');
      }
    } catch (err) {
      logger.warn('Redis not available, falling back to in-memory storage', { err });
      logger.warn('⚠️  Using in-memory storage - session data will be lost on restart!');
      storage = new MemoryStorage();
    }
  }

  return storage;
}

export async function closeStorage(): Promise<void> {
  if (storage) {
    await storage.close();
    storage = null;
  }
}

// Legacy exports for compatibility
export function getRedisClient(): Promise<StorageBackend> {
  return getStorageBackend();
}

export async function closeRedis(): Promise<void> {
  return closeStorage();
}
