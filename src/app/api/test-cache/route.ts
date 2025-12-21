import { NextResponse } from 'next/server';
import { logger, handleApiError } from '@/lib/logger';
import {
    getCache,
    setCache,
    invalidateCache,
    invalidateCachePattern,
    getCacheStats,
    clearCache,
    getDebugLogs
} from '@/lib/cache';

/**
 * Test endpoint for distributed caching
 * 
 * Performs a series of cache operations to verify functionality
 * and measure performance.
 */
export async function GET(request: Request) {
    const results: any[] = [];
    const startTotal = performance.now();

    // Check configuration
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceKeyLength = process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0;

    try {
        // 1. Test Set Operation
        const testKey = `test:cache:${Date.now()}`;
        const testValue = { message: 'Hello Distributed Cache', timestamp: Date.now() };

        const startSet = performance.now();
        await setCache(testKey, testValue, 60000); // 1 minute TTL
        const endSet = performance.now();

        results.push({
            operation: 'SET',
            key: testKey,
            success: true,
            latency: `${(endSet - startSet).toFixed(2)}ms`
        });

        // 2. Test Get Operation (Hit)
        const startGet = performance.now();
        const cachedValue = await getCache(testKey);
        const endGet = performance.now();

        const isMatch = JSON.stringify(cachedValue) === JSON.stringify(testValue);

        results.push({
            operation: 'GET (Hit)',
            key: testKey,
            success: isMatch,
            latency: `${(endGet - startGet).toFixed(2)}ms`,
            value: cachedValue
        });

        // 3. Test Invalidate Operation
        const startDel = performance.now();
        await invalidateCache(testKey);
        const endDel = performance.now();

        results.push({
            operation: 'INVALIDATE',
            key: testKey,
            success: true,
            latency: `${(endDel - startDel).toFixed(2)}ms`
        });

        // 4. Test Get Operation (Miss)
        const startMiss = performance.now();
        const missedValue = await getCache(testKey);
        const endMiss = performance.now();

        results.push({
            operation: 'GET (Miss)',
            key: testKey,
            success: missedValue === null,
            latency: `${(endMiss - startMiss).toFixed(2)}ms`,
            value: missedValue
        });

        // 5. Test Pattern Invalidation
        const patternPrefix = `test:pattern:${Date.now()}`;
        await setCache(`${patternPrefix}:1`, 'value1', 60000);
        await setCache(`${patternPrefix}:2`, 'value2', 60000);

        const startPattern = performance.now();
        await invalidateCachePattern(`${patternPrefix}:*`);
        const endPattern = performance.now();

        const check1 = await getCache(`${patternPrefix}:1`);
        const check2 = await getCache(`${patternPrefix}:2`);

        results.push({
            operation: 'INVALIDATE PATTERN',
            pattern: `${patternPrefix}:*`,
            success: check1 === null && check2 === null,
            latency: `${(endPattern - startPattern).toFixed(2)}ms`
        });

        // 6. Get Stats
        const startStats = performance.now();
        const stats = await getCacheStats();
        const endStats = performance.now();

        results.push({
            operation: 'GET STATS',
            success: true,
            latency: `${(endStats - startStats).toFixed(2)}ms`,
            stats
        });

        const endTotal = performance.now();

        return NextResponse.json({
            success: results.every((r: any) => r.success),
            config: {
                hasServiceKey,
                serviceKeyLength
            },
            totalLatency: `${(endTotal - startTotal).toFixed(2)}ms`,
            logs: getDebugLogs(),
            results
        });

    } catch (error) {
        const errorInfo = await handleApiError(
            error,
            { endpoint: '/api/test-cache' },
            'Cache test error'
        );
        logger.error('Cache test error', { endpoint: '/api/test-cache' }, error instanceof Error ? error : new Error(String(error)));
        return NextResponse.json(errorInfo, { status: errorInfo.status });
    }
}
