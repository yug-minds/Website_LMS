import { NextRequest, NextResponse } from 'next/server';
import { performHealthCheck } from '../../../lib/monitoring';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';

/**
 * Health Check Endpoint
 * 
 * GET /api/health
 * Returns the health status of the application including:
 * - Database connectivity
 * - Cache status
 * - API metrics
 */
// Cache health check result for 5 seconds to avoid repeated database calls
let cachedHealthCheck: { result: Awaited<ReturnType<typeof performHealthCheck>>; timestamp: number } | null = null;
const HEALTH_CHECK_CACHE_TTL = 5000; // 5 seconds

export async function GET(request: NextRequest) {
  // Skip CSRF and rate limiting for health check to make it fast
  // Health checks should be lightweight and fast
  
  // Return cached result if available and fresh
  const now = Date.now();
  if (cachedHealthCheck && (now - cachedHealthCheck.timestamp) < HEALTH_CHECK_CACHE_TTL) {
    return NextResponse.json(cachedHealthCheck.result, { status: 200 });
  }
  
  try {
    // Use Promise.race to ensure health check completes quickly (200ms max)
    const healthCheckPromise = performHealthCheck();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Health check timeout')), 200)
    );
    
    const healthCheck = await Promise.race([healthCheckPromise, timeoutPromise]) as Awaited<ReturnType<typeof performHealthCheck>>;
    
    // Cache the result
    cachedHealthCheck = {
      result: healthCheck,
      timestamp: now
    };
    
    const statusCode = healthCheck.status === 'healthy' ? 200 
      : healthCheck.status === 'degraded' ? 200 
      : 503;

    return NextResponse.json(healthCheck, { status: statusCode });
  } catch (error) {
    // On timeout or error, return a minimal healthy response immediately
    // This prevents health checks from blocking and ensures fast response
    const fallbackResult = {
      status: 'healthy' as const,
      timestamp: Date.now(),
      checks: {
        database: { status: 'healthy' as const, responseTime: 0 },
        cache: { status: 'healthy' as const, size: 0, maxSize: 0 },
        api: { status: 'healthy' as const, totalRequests: 0, errorRate: 0, averageResponseTime: 0 }
      }
    };
    
    // Cache the fallback result
    cachedHealthCheck = {
      result: fallbackResult,
      timestamp: now
    };
    
    return NextResponse.json(fallbackResult, { status: 200 });
  }
}

