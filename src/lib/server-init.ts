/**
 * Server Initialization
 * Runs on server startup to warm cache and optimize performance
 */

import { warmAllDashboardCaches } from './cache-warming';
import { logger } from './logger';
import { startPeriodicCacheWarming } from './periodic-cache-warming';
import { initializeAdminUser } from './admin-init';

let cacheWarmed = false;
let cacheWarmingInProgress = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize server-side optimizations
 * Should be called on server startup or first request
 * Uses singleton pattern to ensure it only runs once
 */
export async function initializeServer(): Promise<void> {
  if (cacheWarmed) {
    return; // Already initialized
  }

  // If initialization is already in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Prevent concurrent initialization
  if (cacheWarmingInProgress) {
    return; // Already in progress
  }

  cacheWarmingInProgress = true;
  
  // Create a single promise that all callers can await
  initializationPromise = (async () => {
    try {
      logger.info('Initializing server optimizations...');
    
    // Mark as warmed immediately to prevent blocking
    cacheWarmed = true;
    
    // Warm cache - don't await, let it run in background
    // Add timeout to prevent blocking server startup
    const warmCachePromise = warmAllDashboardCaches();
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn('Initial cache warming taking too long, continuing startup');
        resolve();
      }, 10000); // 10 second timeout for initial warm
    });
    
    // Race between cache warming and timeout - don't block startup
    Promise.race([warmCachePromise, timeoutPromise]).catch((error) => {
      logger.warn('Initial cache warming failed, continuing startup', {
        error: error instanceof Error ? error.message : String(error)
      });
    });

    // Start periodic cache warming (non-blocking)
    startPeriodicCacheWarming();

    // Initialize admin user (non-blocking)
    // This ensures admin account exists with correct credentials on deployment
    initializeAdminUser().catch((error) => {
      // Log but don't throw - admin initialization failure shouldn't block server startup
      logger.warn('Admin user initialization failed during server startup', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

      logger.info('Server optimizations initialized - cache warming started in background');
    } catch (error) {
      logger.warn('Server initialization error (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Still mark as initialized to prevent retry loops
      cacheWarmed = true;
    } finally {
      cacheWarmingInProgress = false;
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}

/**
 * Check if cache has been warmed
 */
export function isCacheWarmed(): boolean {
  return cacheWarmed;
}

