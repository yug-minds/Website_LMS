import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { getMetrics, getEndpointMetrics } from '../../../../lib/monitoring';

/**
 * Performance Monitor Endpoint
 * GET /api/performance/monitor
 * Returns performance metrics and monitoring data
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
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    if (endpoint) {
      // Return metrics for specific endpoint
      const endpointMetrics = getEndpointMetrics(endpoint);
      return NextResponse.json({
        endpoint,
        metrics: endpointMetrics.slice(0, limit),
        count: endpointMetrics.length
      });
    }

    // Return aggregated metrics
    const metrics = getMetrics();
    return NextResponse.json({
      ...metrics,
      timestamp: Date.now()
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to get performance metrics',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

