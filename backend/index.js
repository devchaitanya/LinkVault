import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  env,
  connectDatabase,
  disconnectDatabase,
  initializeStorage,
  connectRedis,
  disconnectRedis,
} from './src/config/index.js';
import apiRoutes from './src/routes/index.js';
import {
  errorHandler,
  globalLimiter,
  requestLogger,
  securityHeaders,
} from './src/middleware/index.js';
import { cleanupService } from './src/services/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LinkVault — End-to-end encrypted ephemeral content sharing.
 *
 * This server NEVER handles plaintext content or decryption keys.
 * It is an honest-but-curious component in the trust model.
 *
 * Startup order:
 *   1. Connect to MongoDB/Cosmos DB
 *   2. Initialize Azure Blob Storage container
 *   3. Connect to Redis (optional, fallback to in-memory)
 *   4. Start Express server
 *   5. Start cleanup cron
 */

const app = express();

// ─── Global Middleware ─────────────────────────────────────────
app.use(securityHeaders());
app.use(requestLogger());
app.use(cors({
  origin: env.corsOrigin,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Download-Session'],
  exposedHeaders: ['X-Chunk-Hash', 'Content-Length'],
  maxAge: 86400,
}));
app.use(express.json({ limit: '1mb' }));
app.use(globalLimiter);

// ─── API Routes ────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Static Frontend (production) ──────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

// ─── SPA Fallback ──────────────────────────────────────────────
// Any non-API route serves index.html (for client-side routing)
app.use((req, res, next) => {
  // Only serve index.html for GET/HEAD requests that accept HTML
  if (
    (req.method === 'GET' || req.method === 'HEAD') &&
    req.accepts('html')
  ) {
    return res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next(); // Fall through to 404 if file doesn't exist
    });
  }
  next();
});

// ─── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// ─── Global Error Handler ──────────────────────────────────────
app.use(errorHandler);

// ─── Startup ───────────────────────────────────────────────────
async function start() {
  try {
    console.log(`[LinkVault] Starting in ${env.nodeEnv} mode...`);

    // 1. Database
    await connectDatabase();

    // 2. Object Storage
    await initializeStorage();

    // 3. Redis (optional)
    await connectRedis();

    // 4. HTTP Server
    const server = app.listen(env.port, () => {
      console.log(`[LinkVault] API running on http://localhost:${env.port}`);
      console.log(`[LinkVault] Health: http://localhost:${env.port}/api/health`);
    });

    // 5. Cleanup cron
    cleanupService.start();

    // ─── Graceful Shutdown ───────────────────────────────────
    const shutdown = async (signal) => {
      console.log(`\n[LinkVault] ${signal} received. Shutting down gracefully...`);
      cleanupService.stop();
      server.close();
      await disconnectRedis();
      await disconnectDatabase();
      console.log('[LinkVault] Goodbye.');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled errors
    process.on('unhandledRejection', (err) => {
      console.error('[LinkVault] Unhandled rejection:', err);
    });

    process.on('uncaughtException', (err) => {
      console.error('[LinkVault] Uncaught exception:', err);
      process.exit(1);
    });

  } catch (err) {
    console.error('[LinkVault] Startup failed:', err);
    process.exit(1);
  }
}

start();

export default app;
