import { createClient } from 'redis';
import env from './env.js';

let redisClient = null;

/**
 * Connect to Azure Cache for Redis (or local Redis).
 * Returns null if REDIS_URL is not set (falls back to in-memory rate limiting).
 */
export async function connectRedis() {
  if (!env.redisUrl) {
    console.warn('[Redis] No REDIS_URL set — using in-memory rate limiting');
    return null;
  }

  try {
    redisClient = createClient({
      url: env.redisUrl,
      password: env.redisPassword || undefined,
      socket: {
        tls: env.redisUrl.startsWith('rediss://'),
        reconnectStrategy: (retries) => {
          if (retries > 10) return new Error('[Redis] Max reconnect attempts reached');
          return Math.min(retries * 200, 5000);
        },
      },
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (err) {
    console.error('[Redis] Failed to connect:', err.message);
    console.warn('[Redis] Falling back to in-memory rate limiting');
    redisClient = null;
    return null;
  }
}

/**
 * Get the active Redis client (or null).
 */
export function getRedisClient() {
  return redisClient;
}

/**
 * Graceful shutdown.
 */
export async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Disconnected gracefully');
  }
}

export default { connectRedis, getRedisClient, disconnectRedis };
