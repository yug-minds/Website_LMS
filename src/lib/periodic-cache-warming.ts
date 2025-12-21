/**
 * Periodic Cache Warming
 * Periodically warms cache to ensure optimal performance
 */

import { warmAllDashboardCaches } from './cache-warming';
import { logger } from './logger';
import { RefreshConfig } from './cache-config';

let warmingInterval: NodeJS.Timeout | null = null;
let isWarming = false;
let lastWarmAttempt = 0;
const WARM_COOLDOWN_MS = 5000; // 5 second cooldown between warm attempts

/**
 * Start periodic cache warming
 */
export function startPeriodicCacheWarming(): void {
  // Clear any existing interval
  if (warmingInterval) {
    clearInterval(warmingInterval);
  }

  const intervalMs = RefreshConfig.CACHE_WARMING_INTERVAL;

  logger.info('Starting periodic cache warming', {
    intervalMs
  });

  // Initial warm (immediate)
  warmCacheSafely();

  // Set up periodic warming
  warmingInterval = setInterval(() => {
    warmCacheSafely();
  }, intervalMs);
}

/**
 * Stop periodic cache warming
 */
export function stopPeriodicCacheWarming(): void {
  if (warmingInterval) {
    clearInterval(warmingInterval);
    warmingInterval = null;
    logger.info('Stopped periodic cache warming');
  }
}

/**
 * Safely warm cache (with error handling and lock)
 */
async function warmCacheSafely(): Promise<void> {
  const now = Date.now();

  // Check if warming is in progress
  if (isWarming) {
    // Only log once per second to prevent spam
    if (now - lastWarmAttempt > 1000) {
      logger.debug('Cache warming already in progress, skipping');
      lastWarmAttempt = now;
    }
    return;
  }

  // Check cooldown period
  if (now - lastWarmAttempt < WARM_COOLDOWN_MS) {
    return; // Silently skip if too soon
  }

  isWarming = true;
  lastWarmAttempt = now;
  const startTime = Date.now();

  // Add timeout to prevent hanging (30 seconds max)
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      logger.warn('Cache warming timeout - taking too long, aborting');
      resolve();
    }, 30000); // 30 second timeout
  });

  try {
    // Race between cache warming and timeout
    await Promise.race([
      warmAllDashboardCaches(),
      timeoutPromise
    ]);

    const duration = Date.now() - startTime;
    logger.info('Periodic cache warming completed', {
      duration: `${duration}ms`
    });
  } catch (error) {
    logger.warn('Periodic cache warming failed', {
      error: error instanceof Error ? error.message : String(error),
      duration: `${Date.now() - startTime}ms`
    });
  } finally {
    isWarming = false;
  }
}

/**
 * Check if periodic warming is active
 */
export function isPeriodicWarmingActive(): boolean {
  return warmingInterval !== null;
}


