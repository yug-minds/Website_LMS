import { NextRequest, NextResponse } from 'next/server';
import { isRedisAvailable, testRedisConnection, getRedisHealthStatus } from '../../../../lib/redis-client';
import { getCacheStats, getDebugLogs, getCacheOperations } from '../../../../lib/cache';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * Cache Status Endpoint
 * GET /api/cache/status
 * Returns cache connection status, hit rates, and statistics
 */
export async function GET(request: NextRequest) {
  ensureCsrfToken(request);
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

  try {
    // Verify admin access (cache status is sensitive)
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    // Check Redis connection and health
    const redisAvailable = isRedisAvailable();
    const redisHealth = await getRedisHealthStatus();
    const redisConnected = redisAvailable ? await testRedisConnection() : false;

    // Get cache statistics
    const cacheStats = await getCacheStats();
    const debugLogs = getDebugLogs();
    const cacheOperations = getCacheOperations(100); // Last 100 operations

    // Calculate hit/miss rates from operations (more accurate than logs)
    const operations = cacheOperations.filter((op: any) => op.result === 'HIT' || op.result === 'MISS');
    const hits = operations.filter((op: any) => op.result === 'HIT').length;
    const misses = operations.filter((op: any) => op.result === 'MISS').length;
    const errors = operations.filter((op: any) => op.result === 'ERROR').length;
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;

    // Group operations by key pattern
    const keyPatterns: Record<string, { count: number; hits: number; misses: number; avgDuration?: number }> = {};
    cacheOperations.forEach(op => {
      // Extract pattern (e.g., "admin:stats:global" -> "admin:stats")
      const pattern = op.key.split(':').slice(0, 2).join(':');
      if (!keyPatterns[pattern]) {
        keyPatterns[pattern] = { count: 0, hits: 0, misses: 0 };
      }
      keyPatterns[pattern].count++;
      if (op.result === 'HIT') keyPatterns[pattern].hits++;
      if (op.result === 'MISS') keyPatterns[pattern].misses++;
      if (op.duration) {
        keyPatterns[pattern].avgDuration = (keyPatterns[pattern].avgDuration || 0) + op.duration;
      }
    });
    
    // Calculate averages
    Object.keys(keyPatterns).forEach(pattern => {
      const stats = keyPatterns[pattern];
      if (stats.count > 0 && stats.avgDuration) {
        stats.avgDuration = Math.round(stats.avgDuration / stats.count);
      }
    });

    // Calculate Redis latency from operations
    const redisOps = cacheOperations.filter((op: any) => op.source === 'Redis' && op.duration);
    const redisLatencies = redisOps.map((op: any) => op.duration!);
    const avgRedisLatency = redisLatencies.length > 0
      ? Math.round(redisLatencies.reduce((a: number, b: any) => a + b, 0) / redisLatencies.length)
      : null;

    return NextResponse.json({
      redis: {
        available: redisAvailable,
        connected: redisConnected,
        health: redisHealth.status,
        lastHealthCheck: redisHealth.lastCheck,
        status: redisConnected ? 'connected' : redisAvailable ? 'disconnected' : 'disabled',
        avgLatency: avgRedisLatency
      },
      cache: {
        ...cacheStats,
        hitRate: Math.round(hitRate * 100) / 100,
        totalOperations: total,
        hits,
        misses,
        errors
      },
      operations: {
        recent: cacheOperations.slice(-20), // Last 20 operations
        total: cacheOperations.length,
        byPattern: keyPatterns
      },
      recentLogs: debugLogs.slice(-20), // Last 20 log entries
      environment: {
        redisEnabled: process.env.REDIS_ENABLED !== 'false',
        hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
        hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        isServerless: process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NEXT_RUNTIME === 'edge'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to get cache status',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

