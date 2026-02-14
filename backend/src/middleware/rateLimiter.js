import rateLimit from 'express-rate-limit';
import { env } from '../config/index.js';
import { getRedisClient } from '../config/redis.js';

/**
 * Rate limiting middleware factory.
 *
 * Uses Redis if available (distributed, persistent across restarts).
 * Falls back to in-memory if Redis is not configured.
 *
 * Two tiers:
 *   - Global: all requests
 *   - Upload: stricter limit on upload endpoints
 */

/**
 * Create a Redis-backed store for express-rate-limit.
 * Compatible with express-rate-limit v7+.
 */
function createRedisStore(prefix, windowMs) {
  const client = getRedisClient();
  if (!client) return undefined; // fall back to MemoryStore

  return {
    init: () => {},
    async increment(key) {
      const redisKey = `${prefix}:${key}`;
      const multi = client.multi();
      multi.incr(redisKey);
      multi.pExpire(redisKey, windowMs);
      const results = await multi.exec();
      const totalHits = results[0];
      return { totalHits, resetTime: new Date(Date.now() + windowMs) };
    },
    async decrement(key) {
      const redisKey = `${prefix}:${key}`;
      await client.decr(redisKey);
    },
    async resetKey(key) {
      const redisKey = `${prefix}:${key}`;
      await client.del(redisKey);
    },
  };
}

/**
 * Global rate limiter — applies to all routes.
 * In development, uses a generous limit since all users share localhost IP.
 */
export const globalLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.isDev ? 1000 : env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:global', env.rateLimitWindowMs),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    },
  },
  keyGenerator: (req) => {
    // For authenticated requests, key by userId so different users
    // don't share the same rate limit bucket (especially in dev/localhost)
    if (req.userId) return `user:${req.userId}`;
    // Use X-Forwarded-For in production (behind Azure App Service)
    return req.ip || req.connection.remoteAddress;
  },
  // Skip rate limiting for successful requests in dev to avoid headaches
  skip: (req) => env.isDev && req.method === 'OPTIONS',
});

/**
 * Auth-specific rate limiter — separate bucket for login/register.
 * Prevents brute force while allowing normal API usage.
 */
export const authLimiter = rateLimit({
  windowMs: 60_000, // 1 minute window
  max: env.isDev ? 50 : 10, // 10 attempts per minute in prod, 50 in dev
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:auth', 60_000),
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts. Please wait a minute and try again.',
    },
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
});

/**
 * Upload-specific rate limiter — stricter.
 */
export const uploadLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.isDev ? 100 : env.rateLimitUploadMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:upload', env.rateLimitWindowMs),
  message: {
    success: false,
    error: {
      code: 'UPLOAD_RATE_LIMITED',
      message: 'Too many uploads. Please try again later.',
    },
  },
  keyGenerator: (req) => {
    if (req.userId) return `user:${req.userId}`;
    return req.ip || req.connection.remoteAddress;
  },
});

export default { globalLimiter, authLimiter, uploadLimiter };
