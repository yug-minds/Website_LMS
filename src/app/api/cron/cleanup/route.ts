import { NextResponse } from 'next/server';
import { cleanupExpiredCache } from '@/lib/cache';
import { cleanupExpiredRateLimits } from '@/lib/rate-limit';
import { logger, handleApiError } from '@/lib/logger';

/**
 * Cron endpoint for periodic cleanup of expired cache entries
 * 
 * This should be called periodically (e.g., daily) via:
 * - Vercel Cron Jobs (vercel.json)
 * - GitHub Actions scheduled workflow
 * - External cron service (e.g., cron-job.org)
 * 
 * Requires CRON_SECRET environment variable for authentication
 */
export async function GET(request: Request) {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error('CRON_SECRET environment variable is not set', { endpoint: '/api/cron/cleanup' });
        return NextResponse.json(
            { error: 'Server configuration error' },
            { status: 500 }
        );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn('Unauthorized cron cleanup attempt', { endpoint: '/api/cron/cleanup' });
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        // Cleanup expired cache entries
        const cacheDeleted = await cleanupExpiredCache();

        // Also cleanup expired rate limits (bonus!)
        const rateLimitsDeleted = await cleanupExpiredRateLimits();

        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            cacheEntriesDeleted: cacheDeleted,
            rateLimitEntriesDeleted: rateLimitsDeleted,
        };
        logger.info('Cleanup cron job completed', { endpoint: '/api/cron/cleanup', result });


        return NextResponse.json(result);

    } catch (error) {
        const errorInfo = await handleApiError(
            error,
            { endpoint: '/api/cron/cleanup' },
            'Cleanup failed'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
    }
}

// Allow POST as well for flexibility
export async function POST(request: Request) {
    return GET(request);
}
