import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { getAuthenticatedUserId } from './auth-utils';

import { redis, isRedisAvailable } from './redis-client';

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Optional: Custom identifier (defaults to IP address or user ID) */
  identifier?: string;
  /** Optional: Endpoint path for per-endpoint rate limiting */
  endpoint?: string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Get client identifier from request
 * Prefers user ID if authenticated, otherwise falls back to IP address
 */
async function getIdentifier(request: NextRequest, customIdentifier?: string): Promise<string> {
  if (customIdentifier) {
    return customIdentifier;
  }
  
  // Try to get user ID from auth token (preferred for authenticated users)
  // Suppress warning since this is optional for rate limiting (public endpoints may not have auth)
  try {
    const userId = await getAuthenticatedUserId(request, true);
    if (userId) {
      return `user:${userId}`;
    }
  } catch (error) {
    // Fall through to IP-based identification
  }
  
  // Fallback to IP address for unauthenticated requests
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  return `ip:${ip}`;
}

/**
 * Rate limit middleware using Redis (primary) and Supabase (fallback)
 * This provides distributed rate limiting that works across multiple server instances
 * 
 * Priority: Redis -> Supabase -> Fail open (allow request)
 * 
 * @param request - Next.js request object
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const identifier = await getIdentifier(request, config.identifier);
  // Normalize endpoint: use empty string instead of null (database expects NOT NULL)
  const endpoint = config.endpoint || '';
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;
  
  // Try Redis first (sliding window algorithm - more accurate)
  if (isRedisAvailable()) {
    try {
      const key = `ratelimit:${identifier}:${endpoint}:${config.windowSeconds}`;
      
      // Remove expired entries (older than window)
      await redis.zremrangebyscore(key, 0, windowStart);
      
      // Count current requests in window
      const currentCount = await redis.zcard(key);
      
      if (currentCount !== null && currentCount >= config.maxRequests) {
        // Rate limit exceeded - get oldest request time to calculate retry after
        const oldest = await redis.zrange(key, 0, 0, { withScores: true });
        // Upstash returns [member, score, member, score, ...] when withScores is true
        const oldestTime = oldest && oldest.length > 1 ? parseInt(oldest[1]) : now;
        const retryAfter = Math.ceil((oldestTime + windowMs - now) / 1000);
        
        return {
          success: false,
          limit: config.maxRequests,
          remaining: 0,
          reset: Math.floor((now + windowMs) / 1000),
          retryAfter,
        };
      }
      
      // Add current request
      await redis.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiration
      await redis.expire(key, config.windowSeconds);
      
      const newCount = (currentCount || 0) + 1;
      
      return {
        success: true,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - newCount),
        reset: Math.floor((now + windowMs) / 1000),
      };
    } catch (error) {
      console.error('[RateLimit] Redis error, falling back to Supabase:', error);
      // Fall through to Supabase
    }
  }
  
  // Fallback to Supabase database
  try {
    const { data, error } = await (supabaseAdmin as any).rpc('check_rate_limit', {
      p_identifier: identifier,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
      p_endpoint: endpoint || '',
    });

    if (error) {
      console.error('[RateLimit] Supabase error:', error);
      // Fail open to prevent blocking legitimate traffic
      return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - 1,
        reset: nowSeconds + config.windowSeconds,
      };
    }

    if (!data || data.length === 0) {
      console.warn('[RateLimit] Supabase returned no data');
      return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - 1,
        reset: nowSeconds + config.windowSeconds,
      };
    }

    const result = data[0];
    const resetTimestamp = Math.floor(new Date(result.reset_time).getTime() / 1000);
    const retryAfter = result.allowed ? undefined : Math.ceil(resetTimestamp - nowSeconds);

    return {
      success: result.allowed,
      limit: config.maxRequests,
      remaining: result.remaining,
      reset: resetTimestamp,
      retryAfter,
    };
  } catch (error) {
    console.error('[RateLimit] Error:', error);
    // Fail open on error to prevent blocking legitimate traffic
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: nowSeconds + config.windowSeconds,
    };
  }
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  /** Authentication endpoints: 5 requests per minute */
  AUTH: {
    maxRequests: 5,
    windowSeconds: 60,
  },
  
  /** General API endpoints: 100 requests per minute */
  API: {
    maxRequests: 100,
    windowSeconds: 60,
  },
  
  /** File upload endpoints: 30 requests per minute (increased for admin operations) */
  UPLOAD: {
    maxRequests: 30,
    windowSeconds: 60,
  },
  
  /** Read-only endpoints: 200 requests per minute */
  READ: {
    maxRequests: 200,
    windowSeconds: 60,
  },
  
  /** Write endpoints: 50 requests per minute */
  WRITE: {
    maxRequests: 50,
    windowSeconds: 60,
  },
} as const;

/**
 * Helper to create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
    ...(result.retryAfter && {
      'Retry-After': result.retryAfter.toString(),
    }),
  };
}

/**
 * Cleanup expired rate limit entries
 * This should be called periodically (e.g., via cron job or scheduled function)
 * to prevent the rate_limits table from growing indefinitely
 * 
 * @returns Number of deleted entries
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_rate_limits');
    if (error) {
      console.error('Rate limit cleanup error:', error);
      return 0;
    }
    return data || 0;
  } catch (error) {
    console.error('Rate limit cleanup error:', error);
    return 0;
  }
}

