/**
 * Redis Client for Upstash Redis
 * 
 * Provides a singleton Redis client with fallback to in-memory cache
 * Uses Upstash REST API for serverless compatibility
 */

// Optional import - only use if package is installed
let Redis: any = null;
try {
  const upstashRedis = require('@upstash/redis');
  Redis = upstashRedis.Redis;
} catch (e) {
  // @upstash/redis not installed, Redis will be disabled
  console.log('[Redis] @upstash/redis not installed, Redis features will be disabled');
}

let redisClient: any = null;
let redisEnabled = false;
let redisLastHealthCheck: number = 0;
let redisHealthStatus: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
const REDIS_HEALTH_CHECK_INTERVAL = 60000; // Check health every 60 seconds

/**
 * Initialize Redis client
 */
function getRedisClient(): any | null {
  // Check if Redis package is installed
  if (!Redis) {
    return null;
  }

  // Check if Redis is enabled via environment variable
  const redisEnabledEnv = process.env.REDIS_ENABLED !== 'false';
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisEnabledEnv || !redisUrl || !redisToken) {
    if (redisEnabledEnv && (!redisUrl || !redisToken)) {
      console.warn('[Redis] Redis is enabled but credentials are missing. Using fallback cache.');
    }
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      redisEnabled = true;
      redisHealthStatus = 'healthy';
      console.log('[Redis] Client initialized successfully');

      // Perform initial health check
      testRedisConnection().then(healthy => {
        redisHealthStatus = healthy ? 'healthy' : 'unhealthy';
        if (!healthy) {
          console.warn('[Redis] Initial health check failed - Redis may not be working properly');
        }
      }).catch(() => {
        redisHealthStatus = 'unhealthy';
      });
    } catch (error) {
      console.error('[Redis] Failed to initialize client:', error);
      redisHealthStatus = 'unhealthy';
      return null;
    }
  }

  return redisClient;
}

/**
 * Check if we're in static generation context
 */
function isStaticGeneration(): boolean {
  // During Next.js static generation, avoid Redis operations
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    // Additional check for build context
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return true;
    }
  }
  return false;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  // During static generation, disable Redis to avoid no-store fetch conflicts
  if (isStaticGeneration()) {
    return false;
  }

  // Check if Redis package is installed
  if (!Redis) {
    return false;
  }

  // Check environment variables first (fast check)
  const redisEnabledEnv = process.env.REDIS_ENABLED !== 'false';
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisEnabledEnv || !redisUrl || !redisToken) {
    return false;
  }

  // Try to get client (will initialize if needed)
  const client = getRedisClient();
  return client !== null;
}

/**
 * Get Redis client (returns null if unavailable)
 */
export function getRedis(): any | null {
  return getRedisClient();
}

/**
 * Test Redis connection with actual operation
 * This performs a real health check by doing a test operation
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) {
      redisHealthStatus = 'unhealthy';
      return false;
    }

    // Test with actual operation (set and get a test key)
    const testKey = `health:check:${Date.now()}`;
    const testValue = 'health-check';

    try {
      // Set a test value with short TTL
      await client.setex(testKey, 10, testValue);

      // Get it back
      const result = await client.get(testKey);

      // Clean up
      await client.del(testKey);

      const healthy = result === testValue;
      redisHealthStatus = healthy ? 'healthy' : 'unhealthy';
      redisLastHealthCheck = Date.now();

      if (!healthy) {
        console.warn('[Redis] Health check failed - set/get operation returned unexpected value');
      }

      return healthy;
    } catch (opError) {
      redisHealthStatus = 'unhealthy';
      redisLastHealthCheck = Date.now();
      console.error('[Redis] Health check operation failed:', opError);
      return false;
    }
  } catch (error) {
    redisHealthStatus = 'unhealthy';
    redisLastHealthCheck = Date.now();
    console.error('[Redis] Connection test failed:', error);
    return false;
  }
}

/**
 * Get Redis health status (cached, checks periodically)
 */
export async function getRedisHealthStatus(): Promise<{
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: number;
  available: boolean;
}> {
  const now = Date.now();

  // Check health if enough time has passed
  if (now - redisLastHealthCheck > REDIS_HEALTH_CHECK_INTERVAL) {
    await testRedisConnection();
  }

  return {
    status: redisHealthStatus,
    lastCheck: redisLastHealthCheck,
    available: isRedisAvailable()
  };
}

/**
 * Redis operations with automatic fallback
 */
export const redis = {
  /**
   * Get value from Redis with retry logic
   */
  async get<T>(key: string, retries: number = 1): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const client = getRedisClient();
        if (!client) {
          return null;
        }

        const value = await client.get(key) as T;

        // Update health status on success
        if (attempt === 0) {
          redisHealthStatus = 'healthy';
        }

        return value;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 10));
          continue;
        }

        // All retries failed
        redisHealthStatus = 'unhealthy';
        console.error(`[Redis] GET error for key ${key} after ${retries + 1} attempts:`, lastError);
        return null;
      }
    }

    return null;
  },

  /**
   * Set value in Redis with TTL and retry logic
   */
  async set<T>(key: string, value: T, ttlSeconds?: number, retries: number = 1): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const client = getRedisClient();
        if (!client) {
          return false;
        }

        if (ttlSeconds) {
          await client.setex(key, ttlSeconds, value);
        } else {
          await client.set(key, value);
        }

        // Update health status on success
        if (attempt === 0) {
          redisHealthStatus = 'healthy';
        }

        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 10));
          continue;
        }

        // All retries failed
        redisHealthStatus = 'unhealthy';
        console.error(`[Redis] SET error for key ${key} after ${retries + 1} attempts:`, lastError);
        return false;
      }
    }

    return false;
  },

  /**
   * Delete key from Redis
   */
  async del(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      if (!client) {
        return false;
      }

      await client.del(key);
      return true;
    } catch (error) {
      console.error(`[Redis] DEL error for key ${key}:`, error);
      return false;
    }
  },

  /**
   * Delete multiple keys matching pattern
   * Note: Upstash REST API doesn't support SCAN, so we use a workaround
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const client = getRedisClient();
      if (!client) {
        return 0;
      }

      // Upstash REST API doesn't support SCAN directly
      // We'll need to track keys manually or use a different approach
      // For now, return 0 and log a warning
      console.warn('[Redis] Pattern deletion not fully supported via REST API. Consider using explicit keys.');
      return 0;
    } catch (error) {
      console.error(`[Redis] DEL pattern error for ${pattern}:`, error);
      return 0;
    }
  },

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      if (!client) {
        return false;
      }

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[Redis] EXISTS error for key ${key}:`, error);
      return false;
    }
  },

  /**
   * Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      if (!client) {
        return false;
      }

      await client.expire(key, seconds);
      return true;
    } catch (error) {
      console.error(`[Redis] EXPIRE error for key ${key}:`, error);
      return false;
    }
  },

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number | null> {
    try {
      const client = getRedisClient();
      if (!client) {
        return null;
      }

      return await client.incr(key);
    } catch (error) {
      console.error(`[Redis] INCR error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Increment counter with expiration
   */
  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number | null> {
    try {
      const client = getRedisClient();
      if (!client) {
        return null;
      }

      const pipeline = client.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds);
      const results = await pipeline.exec();

      if (results && results[0]) {
        return results[0] as number;
      }
      return null;
    } catch (error) {
      console.error(`[Redis] INCR with expiry error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Add to sorted set (for sliding window rate limiting)
   */
  async zadd(key: string, score: number, member: string): Promise<number | null> {
    try {
      const client = getRedisClient();
      if (!client) {
        return null;
      }

      // Upstash REST API uses different syntax
      return await client.zadd(key, { score, member }) as number;
    } catch (error) {
      console.error(`[Redis] ZADD error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Remove from sorted set by score range
   */
  async zremrangebyscore(key: string, min: number, max: number): Promise<number | null> {
    try {
      const client = getRedisClient();
      if (!client) {
        return null;
      }

      return await client.zremrangebyscore(key, min, max);
    } catch (error) {
      console.error(`[Redis] ZREMRANGEBYSCORE error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Get count of members in sorted set
   */
  async zcard(key: string): Promise<number | null> {
    try {
      const client = getRedisClient();
      if (!client) {
        return null;
      }

      return await client.zcard(key);
    } catch (error) {
      console.error(`[Redis] ZCARD error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Get range from sorted set
   */
  async zrange(key: string, start: number, stop: number, options?: { withScores?: boolean }): Promise<string[] | null> {
    try {
      const client = getRedisClient();
      if (!client) {
        return null;
      }

      if (options?.withScores) {
        const result = await client.zrange(key, start, stop, { withScores: true });
        // Upstash returns array of [member, score, member, score, ...]
        return Array.isArray(result) ? result.map(String) : null;
      }
      const result = await client.zrange(key, start, stop);
      return Array.isArray(result) ? result.map(String) : null;
    } catch (error) {
      console.error(`[Redis] ZRANGE error for key ${key}:`, error);
      return null;
    }
  },
};

