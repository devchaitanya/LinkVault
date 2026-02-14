import mongoose from 'mongoose';
import env from './env.js';

let isConnected = false;

/**
 * Connect to MongoDB / Cosmos DB.
 * Retries up to 5 times with exponential backoff.
 */
export async function connectDatabase() {
  if (isConnected) return;

  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`[DB] Connection attempt ${attempt}/${MAX_RETRIES}...`);

      await mongoose.connect(env.mongodbUri);

      isConnected = true;
      console.log('[DB] Connected successfully');

      mongoose.connection.on('error', (err) => {
        console.error('[DB] Connection error:', err.message);
        isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[DB] Disconnected');
        isConnected = false;
      });

      return;
    } catch (err) {
      console.error(`[DB] Attempt ${attempt} failed:`, err.message);
      if (attempt >= MAX_RETRIES) {
        throw new Error('[DB] All connection attempts failed');
      }
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

/**
 * Graceful shutdown helper.
 */
export async function disconnectDatabase() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.log('[DB] Disconnected gracefully');
}

export default { connectDatabase, disconnectDatabase };
