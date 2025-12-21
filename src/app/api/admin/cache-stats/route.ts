import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { logger } from '../../../../lib/logger';
import { getCacheHitRate, getCacheOperations } from '../../../../lib/cache';

/**
 * Get Cache Statistics Endpoint
 * GET /api/admin/cache-stats
 * Returns cache hit rate and performance statistics
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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    // Get cache hit rate statistics
    const hitRate = getCacheHitRate();
    
    // Get recent cache operations (optional limit parameter)
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const operations = getCacheOperations(limit);

    // Filter operations for materialized view related keys
    const mvOperations = operations.filter((op: any) => 
      op.key.includes('admin:stats') || 
      op.key.includes('school-admin:stats')
    );

    return NextResponse.json({
      hitRate,
      recentOperations: operations,
      materializedViewOperations: mvOperations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Unexpected error getting cache stats', {
      endpoint: '/api/admin/cache-stats',
    }, error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      { 
        error: 'Failed to get cache stats',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

