import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { logger } from '../../../../lib/logger';
import { warmAllDashboardCaches } from '../../../../lib/cache-warming';

/**
 * Warm Cache Endpoint
 * POST /api/admin/warm-cache
 * Manually warms the cache with frequently accessed data
 */
export async function POST(request: NextRequest) {
  ensureCsrfToken(request);
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    const startTime = Date.now();

    // Warm all dashboard caches
    await warmAllDashboardCaches();

    const duration = Date.now() - startTime;

    logger.info('Cache warmed successfully', {
      endpoint: '/api/admin/warm-cache',
      duration: `${duration}ms`
    });

    return NextResponse.json({
      success: true,
      message: 'Cache warmed successfully',
      duration: `${duration}ms`
    });
  } catch (error) {
    logger.error('Failed to warm cache', {
      endpoint: '/api/admin/warm-cache',
    }, error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to warm cache',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}


