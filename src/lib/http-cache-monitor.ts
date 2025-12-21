/**
 * HTTP Cache Hit Rate Monitoring
 * Tracks 304 Not Modified responses and cache effectiveness
 */

interface HttpCacheOperation {
  timestamp: number;
  endpoint: string;
  statusCode: number;
  is304: boolean;
  hasETag: boolean;
  cacheControl?: string;
  responseSize: number;
  duration: number;
}

interface EndpointCacheStats {
  totalRequests: number;
  requests304: number;
  requests200: number;
  hitRate: number;
  avgResponseTime: number;
  avgResponseSize: number;
  avg304ResponseTime: number;
  avg200ResponseTime: number;
  cacheControl?: string;
  recommendedTTL?: number;
  currentTTL?: number;
}

const httpCacheOperations: HttpCacheOperation[] = [];
const MAX_OPERATIONS = 10000; // Keep last 10k operations

/**
 * Record HTTP cache operation
 */
export function recordHttpCacheOperation(operation: Omit<HttpCacheOperation, 'timestamp'>): void {
  httpCacheOperations.push({
    ...operation,
    timestamp: Date.now()
  });

  // Keep only recent operations
  if (httpCacheOperations.length > MAX_OPERATIONS) {
    httpCacheOperations.shift();
  }
}

/**
 * Get HTTP cache hit rate statistics
 */
export function getHttpCacheHitRate(timeWindow?: number): {
  overall: {
    total: number;
    requests304: number;
    requests200: number;
    hitRate: number;
    avgResponseTime: number;
    avg304ResponseTime: number;
    avg200ResponseTime: number;
    bandwidthSaved: number; // bytes saved from 304 responses
  };
  byEndpoint: Record<string, EndpointCacheStats>;
  recommendations: Array<{
    endpoint: string;
    currentTTL?: number;
    recommendedTTL: number;
    reason: string;
    expectedImprovement: string;
  }>;
} {
  const now = Date.now();
  const window = timeWindow || 3600000; // Default: 1 hour
  const cutoff = now - window;

  // Filter operations within time window
  const recentOps = httpCacheOperations.filter((op: any) => op.timestamp >= cutoff);

  // Overall statistics
  const total = recentOps.length;
  const requests304 = recentOps.filter((op: any) => op.is304).length;
  const requests200 = recentOps.filter((op: any) => op.statusCode === 200 && !op.is304).length;
  const hitRate = total > 0 ? (requests304 / total) * 100 : 0;

  const avgResponseTime = total > 0
    ? recentOps.reduce((sum: number, op: any) => sum + op.duration, 0) / total
    : 0;

  const ops304 = recentOps.filter((op: any) => op.is304);
  const ops200 = recentOps.filter((op: any) => op.statusCode === 200 && !op.is304);
  
  const avg304ResponseTime = ops304.length > 0
    ? ops304.reduce((sum: number, op: any) => sum + op.duration, 0) / ops304.length
    : 0;

  const avg200ResponseTime = ops200.length > 0
    ? ops200.reduce((sum: number, op: any) => sum + op.duration, 0) / ops200.length
    : 0;

  // Calculate bandwidth saved (size of 200 responses that could have been 304)
  const bandwidthSaved = ops200.reduce((sum: number, op: any) => sum + op.responseSize, 0);

  // Statistics by endpoint
  const byEndpoint: Record<string, EndpointCacheStats> = {};
  const endpointGroups = new Map<string, HttpCacheOperation[]>();

  recentOps.forEach(op => {
    if (!endpointGroups.has(op.endpoint)) {
      endpointGroups.set(op.endpoint, []);
    }
    endpointGroups.get(op.endpoint)!.push(op);
  });

  endpointGroups.forEach((ops, endpoint) => {
    const endpointTotal = ops.length;
    const endpoint304 = ops.filter((op: any) => op.is304).length;
    const endpoint200 = ops.filter((op: any) => op.statusCode === 200 && !op.is304).length;
    const endpointHitRate = endpointTotal > 0 ? (endpoint304 / endpointTotal) * 100 : 0;

    const endpointOps304 = ops.filter((op: any) => op.is304);
    const endpointOps200 = ops.filter((op: any) => op.statusCode === 200 && !op.is304);

    const avgResponseTime = endpointTotal > 0
      ? ops.reduce((sum: number, op: any) => sum + op.duration, 0) / endpointTotal
      : 0;

    const avg304ResponseTime = endpointOps304.length > 0
      ? endpointOps304.reduce((sum: number, op: any) => sum + op.duration, 0) / endpointOps304.length
      : 0;

    const avg200ResponseTime = endpointOps200.length > 0
      ? endpointOps200.reduce((sum: number, op: any) => sum + op.duration, 0) / endpointOps200.length
      : 0;

    const avgResponseSize = endpointTotal > 0
      ? ops.reduce((sum: number, op: any) => sum + op.responseSize, 0) / endpointTotal
      : 0;

    // Extract cache control from first operation
    const cacheControl = ops[0]?.cacheControl;

    // Extract current TTL from cache-control header
    let currentTTL: number | undefined;
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        currentTTL = parseInt(maxAgeMatch[1], 10);
      }
    }

    byEndpoint[endpoint] = {
      totalRequests: endpointTotal,
      requests304: endpoint304,
      requests200: endpoint200,
      hitRate: Math.round(endpointHitRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      avgResponseSize: Math.round(avgResponseSize),
      avg304ResponseTime: Math.round(avg304ResponseTime * 100) / 100,
      avg200ResponseTime: Math.round(avg200ResponseTime * 100) / 100,
      cacheControl,
      currentTTL
    };
  });

  // Generate recommendations
  const recommendations = generateTTLRecommendations(byEndpoint);

  return {
    overall: {
      total,
      requests304,
      requests200,
      hitRate: Math.round(hitRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      avg304ResponseTime: Math.round(avg304ResponseTime * 100) / 100,
      avg200ResponseTime: Math.round(avg200ResponseTime * 100) / 100,
      bandwidthSaved
    },
    byEndpoint,
    recommendations
  };
}

/**
 * Generate TTL recommendations based on hit rates
 */
function generateTTLRecommendations(
  endpointStats: Record<string, EndpointCacheStats>
): Array<{
  endpoint: string;
  currentTTL?: number;
  recommendedTTL: number;
  reason: string;
  expectedImprovement: string;
}> {
  const recommendations: Array<{
    endpoint: string;
    currentTTL?: number;
    recommendedTTL: number;
    reason: string;
    expectedImprovement: string;
  }> = [];

  Object.entries(endpointStats).forEach(([endpoint, stats]) => {
    // Need at least 10 requests to make recommendations
    if (stats.totalRequests < 10) {
      return;
    }

    const hitRate = stats.hitRate;
    const currentTTL = stats.currentTTL;

    // Low hit rate (< 50%) - increase TTL
    if (hitRate < 50 && currentTTL) {
      const recommendedTTL = Math.min(currentTTL * 2, 3600); // Max 1 hour
      if (recommendedTTL > currentTTL) {
        recommendations.push({
          endpoint,
          currentTTL,
          recommendedTTL,
          reason: `Low hit rate (${hitRate.toFixed(1)}%). Increasing TTL may improve cache effectiveness.`,
          expectedImprovement: `Expected hit rate: ${Math.min(hitRate * 1.5, 95).toFixed(1)}%`
        });
      }
    }

    // Very high hit rate (> 95%) - can increase TTL if it's short
    if (hitRate > 95 && currentTTL && currentTTL < 600) {
      const recommendedTTL = Math.min(currentTTL * 1.5, 1800); // Max 30 minutes
      if (recommendedTTL > currentTTL) {
        recommendations.push({
          endpoint,
          currentTTL,
          recommendedTTL,
          reason: `Excellent hit rate (${hitRate.toFixed(1)}%). Can safely increase TTL for better performance.`,
          expectedImprovement: `Maintain high hit rate while reducing server load`
        });
      }
    }

    // High miss rate with frequent requests - decrease TTL for freshness
    if (hitRate < 30 && stats.totalRequests > 50 && currentTTL && currentTTL > 300) {
      const recommendedTTL = Math.max(currentTTL * 0.5, 60); // Min 1 minute
      if (recommendedTTL < currentTTL) {
        recommendations.push({
          endpoint,
          currentTTL,
          recommendedTTL,
          reason: `Low hit rate (${hitRate.toFixed(1)}%) with high request volume. Data may be changing frequently.`,
          expectedImprovement: `Better data freshness, may improve user experience`
        });
      }
    }

    // No TTL set but high request volume - recommend adding caching
    if (!currentTTL && stats.totalRequests > 20) {
      let recommendedTTL = 60; // Default 1 minute
      
      // Adjust based on endpoint type
      if (endpoint.includes('dashboard') || endpoint.includes('stats')) {
        recommendedTTL = 300; // 5 minutes for dashboards
      } else if (endpoint.includes('list') || endpoint.includes('students') || endpoint.includes('teachers')) {
        recommendedTTL = 120; // 2 minutes for lists
      } else if (endpoint.includes('static') || endpoint.includes('logos') || endpoint.includes('stories')) {
        recommendedTTL = 3600; // 1 hour for static content
      }

      recommendations.push({
        endpoint,
        recommendedTTL,
        reason: `High request volume (${stats.totalRequests} requests) but no caching configured.`,
        expectedImprovement: `Expected hit rate: 60-80% after implementing cache`
      });
    }
  });

  return recommendations.sort((a: any, b: any) => {
    // Prioritize endpoints with more requests
    const aStats = endpointStats[a.endpoint];
    const bStats = endpointStats[b.endpoint];
    return (bStats?.totalRequests || 0) - (aStats?.totalRequests || 0);
  });
}

/**
 * Get cache performance summary
 */
export function getCachePerformanceSummary(): {
  httpCache: ReturnType<typeof getHttpCacheHitRate>;
  timestamp: string;
} {
  return {
    httpCache: getHttpCacheHitRate(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Clear old operations (keep only last N hours)
 */
export function clearOldOperations(hoursToKeep: number = 24): void {
  const cutoff = Date.now() - (hoursToKeep * 3600000);
  const initialLength = httpCacheOperations.length;
  
  // Remove operations older than cutoff
  while (httpCacheOperations.length > 0 && httpCacheOperations[0].timestamp < cutoff) {
    httpCacheOperations.shift();
  }

  const removed = initialLength - httpCacheOperations.length;
  if (removed > 0) {
    console.log(`[HTTP Cache Monitor] Cleared ${removed} old operations`);
  }
}


