import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../lib/auth-utils';
import { getMetrics, getRecentMetrics, getEndpointMetrics } from '../../../lib/monitoring';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';

/**
 * Metrics Endpoint (Admin Only)
 * 
 * GET /api/metrics
 * Returns API performance metrics
 * 
 * Query parameters:
 * - endpoint: Filter metrics by endpoint
 * - recent: Get recent N metrics (default: 100)
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

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const recent = searchParams.get('recent');

    if (endpoint) {
      // Return metrics for specific endpoint
      const endpointMetrics = getEndpointMetrics(endpoint);
      return NextResponse.json({
        endpoint,
        metrics: endpointMetrics,
        count: endpointMetrics.length
      });
    }

    if (recent) {
      // Return recent metrics
      const limit = parseInt(recent, 10) || 100;
      const recentMetrics = getRecentMetrics(limit);
      return NextResponse.json({
        recent: recentMetrics,
        count: recentMetrics.length
      });
    }

    // Return aggregated metrics
    const metrics = getMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    logger.error('Unexpected error in GET /api/metrics', {
      endpoint: '/api/metrics',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/metrics' },
      'Failed to fetch metrics'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

