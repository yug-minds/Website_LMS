import { redis, isRedisAvailable } from './redis-client';

// Debug log buffer with operation tracking
interface CacheOperation {
  timestamp: number;
  operation: 'GET' | 'SET' | 'GET_OR_SET' | 'INVALIDATE' | 'CLEAR';
  key: string;
  result: 'HIT' | 'MISS' | 'SUCCESS' | 'ERROR' | 'STALE_HIT' | 'WARNING' | 'SUCCESS_VERIFIED' | 'SUCCESS_VERIFY_FAILED';
  duration?: number;
  verifyDuration?: number;
  source?: 'Redis' | 'Fallback' | 'Database';
  error?: string;
}

const debugLogs: string[] = [];
const cacheOperations: CacheOperation[] = [];

function log(msg: string) {
  const timestamp = new Date().toISOString().split('T')[1];
  const logMsg = `[${timestamp}] ${msg}`;
  console.log(logMsg);
  debugLogs.push(logMsg);
  if (debugLogs.length > 100) debugLogs.shift();
}

function logOperation(operation: CacheOperation): void {
  cacheOperations.push(operation);
  // Keep last 200 operations
  if (cacheOperations.length > 200) {
    cacheOperations.shift();
  }
  
  const source = operation.source || '';
  const duration = operation.duration ? ` (${operation.duration}ms)` : '';
  const error = operation.error ? ` - ERROR: ${operation.error}` : '';
  log(`[Cache] ${operation.operation} ${operation.key} - ${operation.result}${source ? ` [${source}]` : ''}${duration}${error}`);
}

export function getDebugLogs() {
  return [...debugLogs];
}

export function getCacheOperations(limit: number = 50): CacheOperation[] {
  return cacheOperations.slice(-limit);
}

/**
 * Get cache hit rate statistics
 */
export function getCacheHitRate(): {
  total: number;
  hits: number;
  misses: number;
  hitRate: number;
  bySource: {
    redis: { hits: number; misses: number; hitRate: number };
    fallback: { hits: number; misses: number; hitRate: number };
  };
  byKey: Record<string, { hits: number; misses: number; hitRate: number }>;
} {
  const recentOps = cacheOperations.slice(-1000); // Last 1000 operations
  const total = recentOps.length;
  let hits = 0;
  let misses = 0;
  const bySource = {
    redis: { hits: 0, misses: 0, hitRate: 0 },
    fallback: { hits: 0, misses: 0, hitRate: 0 }
  };
  const byKey: Record<string, { hits: number; misses: number; hitRate: number }> = {};

  for (const op of recentOps) {
    if (op.result === 'HIT') {
      hits++;
      if (op.source === 'Redis') bySource.redis.hits++;
      if (op.source === 'Fallback') bySource.fallback.hits++;
    } else if (op.result === 'MISS') {
      misses++;
      if (op.source === 'Redis') bySource.redis.misses++;
      if (op.source === 'Fallback') bySource.fallback.misses++;
    }

    // Track by key
    if (!byKey[op.key]) {
      byKey[op.key] = { hits: 0, misses: 0, hitRate: 0 };
    }
    if (op.result === 'HIT') byKey[op.key].hits++;
    if (op.result === 'MISS') byKey[op.key].misses++;
  }

  // Calculate hit rates
  const hitRate = total > 0 ? (hits / total) * 100 : 0;
  const redisTotal = bySource.redis.hits + bySource.redis.misses;
  const fallbackTotal = bySource.fallback.hits + bySource.fallback.misses;
  bySource.redis.hitRate = redisTotal > 0 ? (bySource.redis.hits / redisTotal) * 100 : 0;
  bySource.fallback.hitRate = fallbackTotal > 0 ? (bySource.fallback.hits / fallbackTotal) * 100 : 0;

  // Calculate hit rates by key
  for (const key in byKey) {
    const keyTotal = byKey[key].hits + byKey[key].misses;
    byKey[key].hitRate = keyTotal > 0 ? (byKey[key].hits / keyTotal) * 100 : 0;
  }

  return {
    total,
    hits,
    misses,
    hitRate,
    bySource,
    byKey
  };
}

/**
 * Distributed Caching using Redis (primary) with in-memory fallback
 * 
 * Priority order:
 * 1. Redis (if available) - fastest, distributed
 * 2. In-memory cache - local fallback
 * 
 * Provides distributed caching that works across multiple server instances
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Fallback in-memory cache for when Redis is unavailable
 */
class FallbackCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 1000;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      log(`[Fallback] GET ${key} -> EXPIRED`);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, value: T, ttl: number): void {
    log(`[Fallback] SET ${key}`);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl
    });
  }

  delete(key: string): void {
    log(`[Fallback] DELETE ${key}`);
    this.cache.delete(key);
  }

  clear(): void {
    log(`[Fallback] CLEAR`);
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

const fallbackCache = new FallbackCache();

/**
 * Cache TTL presets (in milliseconds)
 * Optimized for different data types:
 * - Stable data (admin stats, school stats): Longer TTL (10-15 min)
 * - User-specific data (student/teacher dashboards): Medium TTL (5 min)
 * - Dynamic data (notifications, real-time): Short TTL (2-3 min)
 */
// Cache TTL Configuration (can be overridden via environment variables)
// Using direct values to avoid circular dependencies
const getConfigValue = (envVar: string, defaultValue: number): number => {
  const value = process.env[envVar];
  return value ? parseInt(value, 10) : defaultValue;
};

export const CacheTTL = {
  SHORT: getConfigValue('CACHE_TTL_SHORT', 2 * 60 * 1000),      // 2 minutes
  MEDIUM: getConfigValue('CACHE_TTL_MEDIUM', 5 * 60 * 1000),     // 5 minutes
  LONG: getConfigValue('CACHE_TTL_LONG', 10 * 60 * 1000),      // 10 minutes
  VERY_LONG: getConfigValue('CACHE_TTL_VERY_LONG', 15 * 60 * 1000), // 15 minutes
  DASHBOARD_STATS: getConfigValue('CACHE_TTL_DASHBOARD_STATS', 10 * 60 * 1000), // 10 minutes
  USER_DASHBOARD: getConfigValue('CACHE_TTL_USER_DASHBOARD', 5 * 60 * 1000),   // 5 minutes
  ADMIN_STATS: getConfigValue('CACHE_TTL_ADMIN_STATS', 10 * 60 * 1000),     // 10 minutes
  SCHOOL_STATS: getConfigValue('CACHE_TTL_SCHOOL_STATS', 10 * 60 * 1000),    // 10 minutes
} as const;

/**
 * Get value from cache (read-only)
 * Uses Redis first in serverless, fallback cache in persistent environments
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const startTime = Date.now();
  const isServerless = isServerlessEnvironment();

  // In serverless: Check Redis FIRST
  if (isServerless) {
    if (isRedisAvailable()) {
      try {
        const redisStart = Date.now();
        const redisValue = await redis.get<T>(key);
        const redisDuration = Date.now() - redisStart;
        
        if (redisValue !== null) {
          cacheHits++;
          updateEndpointStats(key, true);
          const duration = Date.now() - startTime;
          logOperation({
            timestamp: Date.now(),
            operation: 'GET',
            key,
            result: 'HIT',
            duration,
            source: 'Redis'
          });
          // Update fallback for same-instance subsequent access
          fallbackCache.set(key, redisValue, CacheTTL.MEDIUM);
          return redisValue;
        }
        cacheMisses++;
        updateEndpointStats(key, false);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET',
          key,
          result: 'MISS',
          duration: redisDuration,
          source: 'Redis'
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: errorMsg
        });
      }
    }
    
    // Try fallback (may work for same-instance subsequent calls)
    const fallbackValue = fallbackCache.get<T>(key);
    if (fallbackValue !== null) {
      cacheHits++;
      updateEndpointStats(key, true);
      const duration = Date.now() - startTime;
      logOperation({
        timestamp: Date.now(),
        operation: 'GET',
        key,
        result: 'HIT',
        duration,
        source: 'Fallback'
      });
      return fallbackValue;
    }
  } else {
    // Persistent: Check fallback first
    const fallbackValue = fallbackCache.get<T>(key);
    if (fallbackValue !== null) {
      cacheHits++;
      updateEndpointStats(key, true);
      const duration = Date.now() - startTime;
      logOperation({
        timestamp: Date.now(),
        operation: 'GET',
        key,
        result: 'HIT',
        duration,
        source: 'Fallback'
      });
      return fallbackValue;
    }

    // Then Redis
    if (isRedisAvailable()) {
      try {
        const redisStart = Date.now();
        const redisValue = await redis.get<T>(key);
        const redisDuration = Date.now() - redisStart;
        
        if (redisValue !== null) {
          cacheHits++;
          updateEndpointStats(key, true);
          const duration = Date.now() - startTime;
          logOperation({
            timestamp: Date.now(),
            operation: 'GET',
            key,
            result: 'HIT',
            duration,
            source: 'Redis'
          });
          fallbackCache.set(key, redisValue, CacheTTL.MEDIUM);
          return redisValue;
        }
        cacheMisses++;
        updateEndpointStats(key, false);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET',
          key,
          result: 'MISS',
          duration: redisDuration,
          source: 'Redis'
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: errorMsg
        });
      }
    }
  }

  return null;
}

/**
 * Set value in cache
 * Uses Redis first in serverless (must persist), fallback in persistent
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttl: number = CacheTTL.MEDIUM
): Promise<void> {
  const ttlSeconds = Math.floor(ttl / 1000);
  const isServerless = isServerlessEnvironment();

  // In serverless: Set Redis FIRST (critical for persistence)
  if (isServerless) {
    if (isRedisAvailable()) {
      try {
        const redisStart = Date.now();
        const success = await redis.set(key, value, ttlSeconds);
        const redisDuration = Date.now() - redisStart;
        if (success) {
          logOperation({
            timestamp: Date.now(),
            operation: 'SET',
            key,
            result: 'SUCCESS',
            duration: redisDuration,
            source: 'Redis'
          });
        } else {
          logOperation({
            timestamp: Date.now(),
            operation: 'SET',
            key,
            result: 'ERROR',
            source: 'Redis',
            error: 'Redis returned false'
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logOperation({
          timestamp: Date.now(),
          operation: 'SET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: errorMsg
        });
      }
    }
    // Also set in fallback for same-instance access
    fallbackCache.set(key, value, ttl);
  } else {
    // Persistent: Set fallback first (faster), then Redis
    fallbackCache.set(key, value, ttl);
    
    if (isRedisAvailable()) {
      try {
        const redisStart = Date.now();
        const success = await redis.set(key, value, ttlSeconds);
        const redisDuration = Date.now() - redisStart;
        if (success) {
          logOperation({
            timestamp: Date.now(),
            operation: 'SET',
            key,
            result: 'SUCCESS',
            duration: redisDuration,
            source: 'Redis'
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logOperation({
          timestamp: Date.now(),
          operation: 'SET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: errorMsg
        });
      }
    }
  }
  
  // Also store stale cache for stale-while-revalidate (if key suggests it's a dashboard cache)
  if (key.includes(':dashboard:') || key.includes(':stats:')) {
    const staleKey = `${key}:stale`;
    const staleTtl = ttl * 2; // Stale cache lasts 2x longer
    const staleTtlSeconds = Math.floor(staleTtl / 1000);
    
    // Store in fallback
    fallbackCache.set(staleKey, value, staleTtl);
    
    // Store in Redis if available
    if (isRedisAvailable()) {
      try {
        await redis.set(staleKey, value, staleTtlSeconds);
      } catch (error) {
        // Ignore errors setting stale cache
      }
    }
  }
}

/**
 * Detect if we're in a serverless environment
 * In serverless (Vercel/Edge), each request may be a new instance
 * so in-memory cache won't persist between requests
 */
function isServerlessEnvironment(): boolean {
  // Vercel sets VERCEL environment variable
  if (process.env.VERCEL === '1') {
    return true;
  }
  
  // AWS Lambda sets AWS_LAMBDA_FUNCTION_NAME
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return true;
  }
  
  // Edge runtime indicator
  if (process.env.NEXT_RUNTIME === 'edge') {
    return true;
  }
  
  // Default: assume persistent (local dev, traditional servers)
  // Only use serverless mode when explicitly in serverless environment
  // In persistent environments, fallback cache is faster and should be checked first
  return false;
}

/**
 * Detect if we're in static generation context
 * During static generation, we should avoid Redis operations that use no-store fetch
 */
function isStaticGeneration(): boolean {
  // Check if we're in Next.js static generation
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    // During build time, avoid Redis operations
    return true;
  }
  return false;
}

/**
 * Get or set cached value with stale-while-revalidate support
 * Uses Redis first in serverless, fallback cache in persistent environments
 * 
 * @param key - Cache key
 * @param fetcher - Function to fetch data if not in cache
 * @param ttl - Time to live in milliseconds
 * @param options - Optional configuration
 * @param options.staleWhileRevalidate - If true, serve stale cache while refreshing (default: false)
 * @param options.staleTtl - TTL for stale cache (default: ttl * 2)
 * @returns Cached or freshly fetched data
 */
export async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CacheTTL.MEDIUM,
  options?: { staleWhileRevalidate?: boolean; staleTtl?: number }
): Promise<T> {
  const staleWhileRevalidate = options?.staleWhileRevalidate ?? false;
  const staleTtl = options?.staleTtl ?? ttl * 2; // Stale cache lasts 2x longer
  const ttlSeconds = Math.floor(ttl / 1000);
  const startTime = Date.now();
  const isServerless = isServerlessEnvironment();
  
  // During static generation, skip caching and fetch directly
  if (isStaticGeneration()) {
    log(`[Cache] GET_OR_SET ${key} - Static generation detected, skipping cache`);
    const fetchStart = Date.now();
    const data = await fetcher();
    const fetchDuration = Date.now() - fetchStart;
    log(`[Cache] GET_OR_SET ${key} - Fetched directly in ${fetchDuration}ms (static generation)`);
    return data;
  }

  // In serverless: Check Redis FIRST (only cache that persists across instances)
  // In persistent: Check fallback cache first (faster, same instance)
  if (isServerless) {
    // Serverless: Redis first, then fallback (for same-instance subsequent calls)
    if (isRedisAvailable()) {
      try {
        const redisStart = Date.now();
        const redisValue = await redis.get<T>(key);
        const redisDuration = Date.now() - redisStart;
        
        if (redisValue !== null) {
          cacheHits++;
          updateEndpointStats(key, true);
          const duration = Date.now() - startTime;
          logOperation({
            timestamp: Date.now(),
            operation: 'GET_OR_SET',
            key,
            result: 'HIT',
            duration,
            source: 'Redis'
          });
          // Update fallback cache for faster subsequent access in same instance
          fallbackCache.set(key, redisValue, ttl);
          return redisValue;
        }
        cacheMisses++;
        updateEndpointStats(key, false);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET_OR_SET',
          key,
          result: 'MISS',
          duration: redisDuration,
          source: 'Redis'
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET_OR_SET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: errorMsg
        });
        // Fall through to fallback cache or fetch
      }
    } else {
      log(`[Cache] GET_OR_SET ${key} - Redis not available in serverless, skipping fallback cache`);
    }
    
    // Try fallback cache (may work for subsequent calls in same instance)
    const fallbackValue = fallbackCache.get<T>(key);
    if (fallbackValue !== null) {
      cacheHits++;
      updateEndpointStats(key, true);
      const duration = Date.now() - startTime;
      logOperation({
        timestamp: Date.now(),
        operation: 'GET_OR_SET',
        key,
        result: 'HIT',
        duration,
        source: 'Fallback'
      });
      return fallbackValue;
    }
  } else {
    // Persistent environment: Fallback cache first (faster)
    const fallbackValue = fallbackCache.get<T>(key);
    if (fallbackValue !== null) {
      cacheHits++;
      updateEndpointStats(key, true);
      const duration = Date.now() - startTime;
      logOperation({
        timestamp: Date.now(),
        operation: 'GET_OR_SET',
        key,
        result: 'HIT',
        duration,
        source: 'Fallback'
      });
      return fallbackValue;
    }

    // Then check Redis
    if (isRedisAvailable()) {
      try {
        const redisStart = Date.now();
        const redisValue = await redis.get<T>(key);
        const redisDuration = Date.now() - redisStart;
        
        if (redisValue !== null) {
          cacheHits++;
          updateEndpointStats(key, true);
          const duration = Date.now() - startTime;
          logOperation({
            timestamp: Date.now(),
            operation: 'GET_OR_SET',
            key,
            result: 'HIT',
            duration,
            source: 'Redis'
          });
          // Update fallback cache for faster subsequent access
          fallbackCache.set(key, redisValue, ttl);
          return redisValue;
        }
        cacheMisses++;
        updateEndpointStats(key, false);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET_OR_SET',
          key,
          result: 'MISS',
          duration: redisDuration,
          source: 'Redis'
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logOperation({
          timestamp: Date.now(),
          operation: 'GET_OR_SET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: errorMsg
        });
        // Fall through to fetch
      }
    }
  }

  // Cache miss - check for stale cache if stale-while-revalidate is enabled
  let staleData: T | null = null;
  if (staleWhileRevalidate) {
    // Check for stale cache in fallback (with extended TTL)
    const staleKey = `${key}:stale`;
    const staleFallback = fallbackCache.get<T>(staleKey);
    if (staleFallback !== null) {
      staleData = staleFallback;
      log(`[Cache] GET_OR_SET ${key} - Found stale cache, serving immediately`);
    } else if (isRedisAvailable()) {
      try {
        const staleRedis = await redis.get<T>(staleKey);
        if (staleRedis !== null) {
          staleData = staleRedis;
          fallbackCache.set(staleKey, staleRedis, staleTtl);
          log(`[Cache] GET_OR_SET ${key} - Found stale cache in Redis, serving immediately`);
        }
      } catch (error) {
        // Ignore errors when checking stale cache
      }
    }
  }

  // Fetch fresh data
  cacheMisses++;
  updateEndpointStats(key, false);
  logOperation({
    timestamp: Date.now(),
    operation: 'GET_OR_SET',
    key,
    result: staleData ? 'STALE_HIT' : 'MISS',
    source: 'Database'
  });
  
  // If we have stale data, refresh in background and return stale immediately
  if (staleData !== null) {
    // Refresh cache in background (non-blocking)
    fetcher()
      .then((freshData) => {
        // Store fresh data
        setCache(key, freshData, ttl).catch(() => {
          // Ignore errors in background refresh
        });
        // Also update stale cache
        setCache(`${key}:stale`, freshData, staleTtl).catch(() => {
          // Ignore errors
        });
      })
      .catch(() => {
        // Ignore errors in background refresh
      });
    
    return staleData;
  }
  
  // No stale cache - fetch fresh data
  const fetchStart = Date.now();
  const freshData = await fetcher();
  const fetchDuration = Date.now() - fetchStart;
  log(`[Cache] GET_OR_SET ${key} - Fetched in ${fetchDuration}ms`);

  // Store in Redis FIRST (critical for serverless - must persist across instances)
  if (isRedisAvailable()) {
    try {
      const redisSetStart = Date.now();
      const success = await redis.set(key, freshData, ttlSeconds);
      const redisSetDuration = Date.now() - redisSetStart;
      if (success) {
        // Verify cache was written by reading it back (only in development or if enabled)
        const verifyCache = process.env.VERIFY_CACHE_WRITES === 'true';
        if (verifyCache) {
          try {
            const verifyStart = Date.now();
            const verified = await redis.get(key);
            const verifyDuration = Date.now() - verifyStart;
            if (verified === null) {
              logOperation({
                timestamp: Date.now(),
                operation: 'GET_OR_SET',
                key,
                result: 'WARNING',
                source: 'Redis',
                error: 'Cache write verification failed - key not found after write',
                duration: verifyDuration
              });
            } else {
              logOperation({
                timestamp: Date.now(),
                operation: 'GET_OR_SET',
                key,
                result: 'SUCCESS_VERIFIED',
                duration: redisSetDuration,
                verifyDuration,
                source: 'Redis'
              });
            }
          } catch (verifyError) {
            // Verification failed but write succeeded, log warning
            logOperation({
              timestamp: Date.now(),
              operation: 'GET_OR_SET',
              key,
              result: 'SUCCESS_VERIFY_FAILED',
              duration: redisSetDuration,
              source: 'Redis',
              error: verifyError instanceof Error ? verifyError.message : String(verifyError)
            });
          }
        } else {
          logOperation({
            timestamp: Date.now(),
            operation: 'GET_OR_SET',
            key,
            result: 'SUCCESS',
            duration: redisSetDuration,
            source: 'Redis'
          });
        }
      } else {
        logOperation({
          timestamp: Date.now(),
          operation: 'GET_OR_SET',
          key,
          result: 'ERROR',
          source: 'Redis',
          error: 'Redis set returned false'
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logOperation({
        timestamp: Date.now(),
        operation: 'GET_OR_SET',
        key,
        result: 'ERROR',
        source: 'Redis',
        error: errorMsg
      });
    }
  }

  // Store in fallback cache (for same-instance subsequent access)
  fallbackCache.set(key, freshData, ttl);

  return freshData;
}

/**
 * Invalidate cache entry
 * Clears from Redis and in-memory fallback
 */
export async function invalidateCache(key: string): Promise<void> {
  log(`[Cache] INVALIDATE ${key} - Clearing caches...`);
  
  // Delete from fallback first
  fallbackCache.delete(key);

  // Delete from Redis
  if (isRedisAvailable()) {
    try {
      await redis.del(key);
      log(`[Cache] INVALIDATE ${key} - Redis cleared`);
    } catch (error) {
      log(`[Cache] INVALIDATE ${key} - Redis error: ${error}`);
    }
  }
}

/**
 * Invalidate cache entries matching pattern
 * Pattern uses regex syntax
 * Example: "school:.*" matches "school:123", "school:456", etc.
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  try {
    // Clear from fallback using regex
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete = fallbackCache.getAllKeys().filter(k => regex.test(k));
    keysToDelete.forEach(k => fallbackCache.delete(k));

    // Clear from Redis (if available)
    if (isRedisAvailable()) {
      // Note: Upstash REST API doesn't support SCAN directly
      // For now, we'll clear matching keys from fallback cache only
      // Redis keys matching the pattern will expire naturally
      log(`[Cache] Pattern invalidation for ${pattern} - cleared ${keysToDelete.length} keys from fallback`);
    }

  } catch (error) {
    console.warn(`Cache pattern invalidation exception for ${pattern}:`, error);
  }
}

/**
 * Clear all cache
 */
export async function clearCache(): Promise<void> {
  try {
    fallbackCache.clear();

    // Note: Redis doesn't have a direct "clear all" via REST API
    // Keys will expire naturally based on TTL
    log('[Cache] Cleared fallback cache');

  } catch (error) {
    console.warn('Cache clear exception:', error);
  }
}

// Cache hit/miss tracking (per endpoint)
let cacheHits = 0;
let cacheMisses = 0;
const endpointStats: Map<string, { hits: number; misses: number }> = new Map();

/**
 * Update endpoint statistics
 */
function updateEndpointStats(key: string, isHit: boolean): void {
  // Extract endpoint from cache key (e.g., "admin:stats:global" -> "admin:stats")
  const endpoint = key.split(':').slice(0, 2).join(':');
  const stats = endpointStats.get(endpoint) || { hits: 0, misses: 0 };
  
  if (isHit) {
    stats.hits++;
  } else {
    stats.misses++;
  }
  
  endpointStats.set(endpoint, stats);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  size: number;
  totalEntries?: number;
  activeEntries?: number;
  expiredEntries?: number;
  totalHits?: number;
  totalMisses?: number;
  avgHitsPerEntry?: number;
  totalSizeBytes?: number;
  hitRate?: number;
  redisAvailable?: boolean;
  endpointStats?: Record<string, { hits: number; misses: number; hitRate: number }>;
}> {
  try {
    const size = fallbackCache.size();
    const total = cacheHits + cacheMisses;
    const hitRate = total > 0 ? (cacheHits / total) * 100 : 0;

    // Convert endpoint stats to object with hit rates
    const endpointStatsObj: Record<string, { hits: number; misses: number; hitRate: number }> = {};
    endpointStats.forEach((stats, endpoint) => {
      const endpointTotal = stats.hits + stats.misses;
      const endpointHitRate = endpointTotal > 0 ? (stats.hits / endpointTotal) * 100 : 0;
      endpointStatsObj[endpoint] = {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: Math.round(endpointHitRate * 100) / 100
      };
    });

    return {
      size,
      totalEntries: size,
      activeEntries: size,
      totalHits: cacheHits,
      totalMisses: cacheMisses,
      hitRate: Math.round(hitRate * 100) / 100,
      redisAvailable: isRedisAvailable(),
      endpointStats: endpointStatsObj
    };

  } catch (error) {
    console.warn('Cache stats error:', error);
    return { size: fallbackCache.size() };
  }
}

/**
 * Cleanup expired cache entries
 * Should be called periodically (e.g., cron job)
 * Note: Redis handles expiration automatically via TTL
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    // Cleanup fallback cache expired entries
    const keys = fallbackCache.getAllKeys();
    let cleaned = 0;
    
    keys.forEach(key => {
      const entry = (fallbackCache as any).cache.get(key);
      if (entry) {
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
          fallbackCache.delete(key);
          cleaned++;
        }
      }
    });

    // Redis handles expiration automatically, no cleanup needed
    return cleaned;

  } catch (error) {
    console.error('Cache cleanup exception:', error);
    return 0;
  }
}

/**
 * Cache key generators
 */
export const CacheKeys = {
  school: (schoolId: string) => `school:${schoolId}`,
  course: (courseId: string) => `course:${courseId}`,
  courseMetadata: (courseId: string) => `course:metadata:${courseId}`,
  userProfile: (userId: string) => `profile:${userId}`,
  userRole: (userId: string) => `role:${userId}`,
  studentCourses: (studentId: string, schoolId: string, grade: string) =>
    `student:courses:${studentId}:${schoolId}:${grade}`,
  teacherClasses: (teacherId: string, schoolId?: string) =>
    `teacher:classes:${teacherId}${schoolId ? `:${schoolId}` : ''}`,
  schoolStats: (schoolId: string) => `school:stats:${schoolId}`,
  homepageLogos: () => `logos:homepage`,
  successStories: () => `success_stories:published`,
} as const;
