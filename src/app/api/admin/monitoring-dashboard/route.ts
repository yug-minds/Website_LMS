import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';

import { logger } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getCacheHitRate, getCacheOperations } from '../../../../lib/cache';
import { CacheConfig, RefreshConfig } from '../../../../lib/cache-config';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * Comprehensive Monitoring Dashboard Endpoint
 * GET /api/admin/monitoring-dashboard
 * Returns comprehensive monitoring data for materialized views, cache, and system health
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

    const startTime = Date.now();

    // Fetch all monitoring data in parallel
    const [
      refreshStatsResult,
      cacheStatsResult,
      refreshStatusResult
    ] = await Promise.allSettled([
      supabaseAdmin.rpc('get_materialized_view_refresh_stats'),
      Promise.resolve({ data: getCacheHitRate(), error: null }),
      supabaseAdmin.rpc('get_dashboard_refresh_status')
    ]);

    // Process refresh stats
    let refreshStats = null;
    if (refreshStatsResult.status === 'fulfilled' && !refreshStatsResult.value.error) {
      refreshStats = refreshStatsResult.value.data;
    }

    // Process cache stats
    let cacheStats = null;
    if (cacheStatsResult.status === 'fulfilled') {
      cacheStats = cacheStatsResult.value.data;
    }

    // Process refresh status
    let refreshStatus = null;
    if (refreshStatusResult.status === 'fulfilled' && !refreshStatusResult.value.error) {
      refreshStatus = refreshStatusResult.value.data;
    }

    // Get refresh history
    const { data: refreshHistory, error: historyError } = await supabaseAdmin
      .rpc('get_refresh_history', { p_limit: 20 });

    // Get error schools
    const { data: errorSchools } = await supabaseAdmin
      .from('mv_school_refresh_queue')
      .select('school_id, queued_at, last_error, refresh_count')
      .not('last_error', 'is', null)
      .order('queued_at', { ascending: false })
      .limit(10);

    // Get recent cache operations
    const recentOperations = getCacheOperations(50);
    const mvOperations = recentOperations.filter((op: any) => 
      op.key.includes('admin:stats') || 
      op.key.includes('school-admin:stats')
    );

    const duration = Date.now() - startTime;

    // Build comprehensive response
    const dashboard = {
      timestamp: new Date().toISOString(),
      fetchDuration: `${duration}ms`,
      configuration: {
        cache: {
          dashboardStatsTTL: CacheConfig.DASHBOARD_STATS_TTL,
          userDashboardTTL: CacheConfig.USER_DASHBOARD_TTL,
          schoolStatsTTL: CacheConfig.SCHOOL_STATS_TTL,
          adminStatsTTL: CacheConfig.ADMIN_STATS_TTL,
        },
        refresh: {
          incrementalInterval: RefreshConfig.INCREMENTAL_REFRESH_INTERVAL,
          fullRefreshInterval: RefreshConfig.FULL_REFRESH_INTERVAL,
          fullRefreshTime: RefreshConfig.FULL_REFRESH_TIME,
          maxSchoolsPerRefresh: RefreshConfig.MAX_SCHOOLS_PER_REFRESH,
          cacheWarmingInterval: RefreshConfig.CACHE_WARMING_INTERVAL,
        }
      },
      refresh: {
        status: refreshStatus,
        stats: refreshStats,
        history: historyError ? null : refreshHistory,
        errors: errorSchools || []
      },
      cache: {
        hitRate: cacheStats,
        recentOperations: recentOperations.slice(0, 20),
        materializedViewOperations: mvOperations
      },
      health: {
        refreshStatsAvailable: refreshStats !== null,
        cacheStatsAvailable: cacheStats !== null,
        refreshStatusAvailable: refreshStatus !== null,
        hasErrors: (errorSchools?.length || 0) > 0,
        errorCount: errorSchools?.length || 0
      }
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    logger.error('Unexpected error getting monitoring dashboard', {
      endpoint: '/api/admin/monitoring-dashboard',
    }, error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      { 
        error: 'Failed to get monitoring dashboard',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

