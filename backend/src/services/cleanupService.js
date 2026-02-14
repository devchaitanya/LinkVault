import cron from 'node-cron';
import { env } from '../config/index.js';
import vaultService from './vaultService.js';

/**
 * CleanupService — scheduled cleanup of expired vaults and orphaned blobs.
 *
 * Runs on a cron schedule. TTL indexes in MongoDB are a safety net,
 * but this service is the primary cleanup mechanism.
 */
class CleanupService {
  constructor() {
    this.task = null;
    this.isRunning = false;
  }

  /**
   * Start the cleanup cron job.
   */
  start() {
    if (this.task) {
      console.warn('[Cleanup] Already running');
      return;
    }

    console.log(`[Cleanup] Scheduling at: ${env.cleanupCronSchedule}`);

    this.task = cron.schedule(env.cleanupCronSchedule, async () => {
      if (this.isRunning) {
        console.log('[Cleanup] Previous run still in progress, skipping');
        return;
      }

      this.isRunning = true;
      try {
        const result = await vaultService.cleanupExpiredVaults();
        if (result.cleaned > 0) {
          console.log(`[Cleanup] Cycle complete: ${result.cleaned}/${result.total}`);
        }
      } catch (err) {
        console.error('[Cleanup] Cycle failed:', err.message);
      } finally {
        this.isRunning = false;
      }
    });

    // Run once immediately on startup
    this.runOnce();
  }

  /**
   * Run cleanup once (outside cron schedule).
   */
  async runOnce() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await vaultService.cleanupExpiredVaults();
    } catch (err) {
      console.error('[Cleanup] Manual run failed:', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the cron job gracefully.
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[Cleanup] Stopped');
    }
  }
}

export default new CleanupService();
