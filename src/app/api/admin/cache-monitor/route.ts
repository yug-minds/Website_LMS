import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { getHttpCacheHitRate, getCachePerformanceSummary } from '../../../../lib/http-cache-monitor';
import { getCacheStats, getCacheHitRate } from '../../../../lib/cache';
import { logger } from '../../../../lib/logger';

/**
 * Cache Monitor Endpoint
 * GET /api/admin/cache-monitor
 * Returns comprehensive cache performance metrics and recommendations
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('timeWindow');
    const hours = timeWindow ? parseInt(timeWindow, 10) : undefined;
    const windowMs = hours ? hours * 3600000 : undefined;

    // Get HTTP cache statistics
    const httpCacheStats = getHttpCacheHitRate(windowMs);

    // Get Redis/fallback cache statistics
    const redisCacheStats = await getCacheStats();
    const redisHitRate = getCacheHitRate();

    // Combine statistics
    const summary = {
      timestamp: new Date().toISOString(),
      timeWindow: hours ? `${hours} hours` : '1 hour (default)',
      httpCache: {
        overall: httpCacheStats.overall,
        topEndpoints: Object.entries(httpCacheStats.byEndpoint)
          .sort((a: any, b: any) => b[1].totalRequests - a[1].totalRequests)
          .slice(0, 20)
          .map(([endpoint, stats]) => ({
            endpoint,
            ...stats
          })),
        recommendations: httpCacheStats.recommendations
      },
      redisCache: {
        overall: {
          hitRate: redisCacheStats.hitRate || 0,
          totalHits: redisCacheStats.totalHits || 0,
          totalMisses: redisCacheStats.totalMisses || 0,
          totalRequests: (redisCacheStats.totalHits || 0) + (redisCacheStats.totalMisses || 0),
          redisAvailable: redisCacheStats.redisAvailable || false
        },
        bySource: redisHitRate.bySource,
        topKeys: Object.entries(redisHitRate.byKey)
          .sort((a: any, b: any) => (b[1].hits + b[1].misses) - (a[1].hits + a[1].misses))
          .slice(0, 20)
          .map(([key, stats]) => ({
            key,
            ...stats
          }))
      },
      recommendations: {
        httpCache: httpCacheStats.recommendations,
        priority: httpCacheStats.recommendations
          .filter((r: any) => r.endpoint.includes('dashboard') || r.endpoint.includes('stats'))
          .slice(0, 5)
      }
    };

    logger.info('Cache monitor accessed', {
      endpoint: '/api/admin/cache-monitor',
      httpCacheHitRate: httpCacheStats.overall.hitRate,
      redisCacheHitRate: redisCacheStats.hitRate
    });

    return NextResponse.json(summary);
  } catch (error) {
    logger.error('Error in cache monitor', {
      endpoint: '/api/admin/cache-monitor'
    }, error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      { error: 'Failed to fetch cache statistics' },
      { status: 500 }
    );
  }
}


