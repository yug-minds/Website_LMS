import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';

import { logger } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * Get Materialized View Statistics Endpoint
 * GET /api/admin/materialized-view-stats
 * Returns detailed statistics about materialized view refresh status
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

    // Get refresh statistics
    const { data: statsData, error: statsError } = await supabaseAdmin
      .rpc('get_materialized_view_refresh_stats');

    if (statsError) {
      logger.error('Failed to get materialized view stats', {
        endpoint: '/api/admin/materialized-view-stats',
        error: statsError.message
      });

      return NextResponse.json(
        { 
          error: 'Failed to get materialized view stats',
          details: statsError.message
        },
        { status: 500 }
      );
    }

    // Get refresh history (optional limit parameter)
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    const { data: historyData, error: historyError } = await supabaseAdmin
      .rpc('get_refresh_history', { p_limit: limit });

    if (historyError) {
      logger.warn('Failed to get refresh history', {
        endpoint: '/api/admin/materialized-view-stats',
        error: historyError.message
      });
    }

    // Check for refresh failures (alerts)
    const { data: errorSchools, error: errorQueryError } = await supabaseAdmin
      .from('mv_school_refresh_queue')
      .select('school_id, queued_at, last_error, refresh_count')
      .not('last_error', 'is', null)
      .order('queued_at', { ascending: false })
      .limit(20);

    const alerts = {
      hasErrors: (errorSchools?.length || 0) > 0,
      errorCount: errorSchools?.length || 0,
      errors: errorQueryError ? [] : (errorSchools || []).map((e: any) => ({
        schoolId: e.school_id,
        queuedAt: e.queued_at,
        error: e.last_error,
        retryCount: e.refresh_count
      }))
    };

    return NextResponse.json({
      stats: statsData,
      history: historyError ? null : historyData,
      alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Unexpected error getting materialized view stats', {
      endpoint: '/api/admin/materialized-view-stats',
    }, error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      { 
        error: 'Failed to get materialized view stats',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

