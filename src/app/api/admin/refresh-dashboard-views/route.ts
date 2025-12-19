import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { logger } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';

/**
 * Refresh Dashboard Views Endpoint
 * POST /api/admin/refresh-dashboard-views
 * Manually refreshes materialized views for dashboard statistics
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

    // Check if incremental refresh is requested
    const { searchParams } = new URL(request.url);
    const incremental = searchParams.get('incremental') === 'true';
    
    // Refresh materialized views (incremental or full)
    const { data, error } = await supabaseAdmin
      .rpc('refresh_dashboard_views', { p_incremental: incremental });

    const duration = Date.now() - startTime;

    if (error) {
      logger.error('Failed to refresh dashboard views', {
        endpoint: '/api/admin/refresh-dashboard-views',
        error: error.message,
        incremental
      });

      // Check for schools with errors in refresh queue
      const { data: errorSchools } = await supabaseAdmin
        .from('mv_school_refresh_queue')
        .select('school_id, last_error, refresh_count')
        .not('last_error', 'is', null)
        .order('queued_at', { ascending: false })
        .limit(10);

      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to refresh dashboard views',
          details: error.message,
          incremental,
          errorSchools: errorSchools || []
        },
        { status: 500 }
      );
    }

    // Get refresh status
    const { data: statusData, error: statusError } = await supabaseAdmin
      .rpc('get_dashboard_refresh_status');

    logger.info('Dashboard views refreshed successfully', {
      endpoint: '/api/admin/refresh-dashboard-views',
      duration: `${duration}ms`,
      incremental,
      refreshResult: data
    });

    return NextResponse.json({
      success: true,
      message: 'Dashboard views refreshed successfully',
      duration: `${duration}ms`,
      incremental,
      refreshResult: data,
      status: statusError ? null : statusData
    });
  } catch (error) {
    logger.error('Unexpected error refreshing dashboard views', {
      endpoint: '/api/admin/refresh-dashboard-views',
    }, error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to refresh dashboard views',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * Get Refresh Status Endpoint
 * GET /api/admin/refresh-dashboard-views
 * Returns the status of the materialized view refresh schedule
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

    // Get refresh status
    const { data, error } = await supabaseAdmin
      .rpc('get_dashboard_refresh_status');

    if (error) {
      return NextResponse.json(
        { 
          error: 'Failed to get refresh status',
          details: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: data
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to get refresh status',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}


