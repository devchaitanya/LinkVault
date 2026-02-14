import 'dotenv/config';

const env = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // MongoDB / Cosmos DB
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/linkvault',

  // Azure Blob Storage
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  azureStorageContainer: process.env.AZURE_STORAGE_CONTAINER || 'linkvault-blobs',

  // Redis
  redisUrl: process.env.REDIS_URL,
  redisPassword: process.env.REDIS_PASSWORD,

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900_000,
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  rateLimitUploadMax: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX, 10) || 20,

  // Vault Defaults
  defaultExpiryMs: parseInt(process.env.DEFAULT_EXPIRY_MS, 10) || 600_000,
  maxExpiryMs: parseInt(process.env.MAX_EXPIRY_MS, 10) || 86_400_000,
  defaultMaxViews: parseInt(process.env.DEFAULT_MAX_VIEWS, 10) || 10,
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES, 10) || 52_428_800,
  chunkSizeBytes: parseInt(process.env.CHUNK_SIZE_BYTES, 10) || 5_242_880,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Cleanup
  cleanupCronSchedule: process.env.CLEANUP_CRON_SCHEDULE || '*/5 * * * *',
};

// Validate required vars in production
if (env.isProd) {
  const required = ['MONGODB_URI', 'AZURE_STORAGE_CONNECTION_STRING'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

export default env;
