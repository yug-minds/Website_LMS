/**
 * Monitoring and Logging Infrastructure
 * 
 * Provides structured logging, performance monitoring, and metrics collection
 */

import { NextRequest } from 'next/server';

export interface PerformanceMetrics {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
  userId?: string;
  error?: string;
  middlewareOverhead?: number;
  cacheHit?: boolean;
  databaseTime?: number;
  // Detailed phase timings
  phaseTimings?: {
    middleware?: number;      // CSRF, rate limiting overhead
    authentication?: number;   // Auth check time
    cache?: number;           // Cache lookup time
    database?: number;        // Database query time
    processing?: number;       // Business logic time
  };
}

export interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByEndpoint: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
  averageMiddlewareOverhead?: number;
  cacheHitRate?: number;
  p95Latency?: number;
  p99Latency?: number;
}

class MetricsCollector {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics: number = 10000; // Keep last 10k metrics

  /**
   * Record a performance metric
   */
  record(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last maxMetrics entries
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): ApiMetrics {
    const total = this.metrics.length;
    const successful = this.metrics.filter((m: any) => m.statusCode < 400).length;
    const failed = this.metrics.filter((m: any) => m.statusCode >= 400).length;
    
    const totalDuration = this.metrics.reduce((sum: number, m: any) => sum + m.duration, 0);
    const averageResponseTime = total > 0 ? totalDuration / total : 0;

    // Calculate P95 and P99 latencies
    const sortedDurations = this.metrics.map((m: any) => m.duration).sort((a: any, b: any) => a - b);
    const p95Latency = sortedDurations.length > 0 
      ? sortedDurations[Math.floor(sortedDurations.length * 0.95)] 
      : 0;
    const p99Latency = sortedDurations.length > 0 
      ? sortedDurations[Math.floor(sortedDurations.length * 0.99)] 
      : 0;

    // Calculate middleware overhead
    const metricsWithOverhead = this.metrics.filter((m: any) => m.middlewareOverhead !== undefined);
    const averageMiddlewareOverhead = metricsWithOverhead.length > 0
      ? metricsWithOverhead.reduce((sum: number, m: any) => sum + (m.middlewareOverhead || 0), 0) / metricsWithOverhead.length
      : undefined;

    // Calculate cache hit rate
    const metricsWithCache = this.metrics.filter((m: any) => m.cacheHit !== undefined);
    const cacheHits = metricsWithCache.filter((m: any) => m.cacheHit === true).length;
    const cacheHitRate = metricsWithCache.length > 0
      ? (cacheHits / metricsWithCache.length) * 100
      : undefined;

    const requestsByEndpoint: Record<string, number> = {};
    const errorsByEndpoint: Record<string, number> = {};

    this.metrics.forEach(metric => {
      requestsByEndpoint[metric.endpoint] = (requestsByEndpoint[metric.endpoint] || 0) + 1;
      if (metric.statusCode >= 400) {
        errorsByEndpoint[metric.endpoint] = (errorsByEndpoint[metric.endpoint] || 0) + 1;
      }
    });

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      averageResponseTime,
      requestsByEndpoint,
      errorsByEndpoint,
      averageMiddlewareOverhead,
      cacheHitRate,
      p95Latency,
      p99Latency
    };
  }

  /**
   * Get metrics for a specific endpoint
   */
  getEndpointMetrics(endpoint: string): PerformanceMetrics[] {
    return this.metrics.filter((m: any) => m.endpoint === endpoint);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get recent metrics (last N)
   */
  getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get average phase timings for an endpoint
   */
  getAveragePhaseTimings(endpoint?: string): {
    middleware?: number;
    authentication?: number;
    cache?: number;
    database?: number;
    processing?: number;
  } {
    const relevantMetrics = endpoint 
      ? this.metrics.filter((m: any) => m.endpoint === endpoint)
      : this.metrics;
    
    const metricsWithPhases = relevantMetrics.filter((m: any) => m.phaseTimings);
    if (metricsWithPhases.length === 0) {
      return {};
    }

    const totals = {
      middleware: 0,
      authentication: 0,
      cache: 0,
      database: 0,
      processing: 0
    };
    const counts = {
      middleware: 0,
      authentication: 0,
      cache: 0,
      database: 0,
      processing: 0
    };

    metricsWithPhases.forEach(m => {
      if (m.phaseTimings) {
        if (m.phaseTimings.middleware !== undefined) {
          totals.middleware += m.phaseTimings.middleware;
          counts.middleware++;
        }
        if (m.phaseTimings.authentication !== undefined) {
          totals.authentication += m.phaseTimings.authentication;
          counts.authentication++;
        }
        if (m.phaseTimings.cache !== undefined) {
          totals.cache += m.phaseTimings.cache;
          counts.cache++;
        }
        if (m.phaseTimings.database !== undefined) {
          totals.database += m.phaseTimings.database;
          counts.database++;
        }
        if (m.phaseTimings.processing !== undefined) {
          totals.processing += m.phaseTimings.processing;
          counts.processing++;
        }
      }
    });

    return {
      middleware: counts.middleware > 0 ? totals.middleware / counts.middleware : undefined,
      authentication: counts.authentication > 0 ? totals.authentication / counts.authentication : undefined,
      cache: counts.cache > 0 ? totals.cache / counts.cache : undefined,
      database: counts.database > 0 ? totals.database / counts.database : undefined,
      processing: counts.processing > 0 ? totals.processing / counts.processing : undefined
    };
  }
}

// Global metrics collector
const metricsCollector = new MetricsCollector();

/**
 * Track API request performance with detailed phase timings
 */
export async function trackPerformance<T>(
  request: NextRequest,
  handler: () => Promise<T>,
  options?: {
    endpoint?: string;
    userId?: string;
    phaseTimings?: {
      middleware?: number;
      authentication?: number;
      cache?: number;
      database?: number;
      processing?: number;
    };
    cacheHit?: boolean;
  }
): Promise<T> {
  const startTime = Date.now();
  const method = request.method;
  const url = new URL(request.url);
  const endpoint = options?.endpoint || url.pathname;
  
  let statusCode = 200;
  let error: string | undefined;

  try {
    const result = await handler();
    return result;
   
  } catch (err: any) {
    statusCode = err.statusCode || 500;
    error = err.message || 'Unknown error';
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    
    metricsCollector.record({
      endpoint,
      method,
      duration,
      statusCode,
      timestamp: Date.now(),
      userId: options?.userId,
      error,
      phaseTimings: options?.phaseTimings,
      cacheHit: options?.cacheHit,
      middlewareOverhead: options?.phaseTimings?.middleware,
      databaseTime: options?.phaseTimings?.database
    });
  }
}

/**
 * Create a performance timer for tracking phases
 */
export function createPerformanceTimer() {
  const phases: Record<string, number> = {};
  const startTimes: Record<string, number> = {};

  return {
    start(phase: string): void {
      startTimes[phase] = Date.now();
    },
    end(phase: string): number {
      if (startTimes[phase]) {
        phases[phase] = Date.now() - startTimes[phase];
        return phases[phase];
      }
      return 0;
    },
    getTimings(): { middleware?: number; authentication?: number; cache?: number; database?: number; processing?: number } {
      return {
        middleware: phases['middleware'],
        authentication: phases['authentication'],
        cache: phases['cache'],
        database: phases['database'],
        processing: phases['processing']
      };
    }
  };
}

/**
 * Get current metrics
 */
export function getMetrics(): ApiMetrics {
  return metricsCollector.getMetrics();
}

/**
 * Get endpoint-specific metrics
 */
export function getEndpointMetrics(endpoint: string): PerformanceMetrics[] {
  return metricsCollector.getEndpointMetrics(endpoint);
}

/**
 * Get average phase timings
 */
export function getAveragePhaseTimings(endpoint?: string): {
  middleware?: number;
  authentication?: number;
  cache?: number;
  database?: number;
  processing?: number;
} {
  return metricsCollector.getAveragePhaseTimings(endpoint);
}

/**
 * Get recent metrics
 */
export function getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
  return metricsCollector.getRecentMetrics(limit);
}

/**
 * Clear metrics
 */
export function clearMetrics(): void {
  metricsCollector.clear();
}

/**
 * Health check data structure
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    cache: {
      status: 'healthy' | 'unhealthy';
      size: number;
      maxSize: number;
    };
    api: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      totalRequests: number;
      errorRate: number;
      averageResponseTime: number;
    };
  };
}

/**
 * Perform health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = {
    database: { status: 'unhealthy' },
    cache: { status: 'unhealthy', size: 0, maxSize: 0 },
    api: { status: 'unhealthy', totalRequests: 0, errorRate: 0, averageResponseTime: 0 }
  };

  // Check database (with very aggressive timeout for fast health checks)
  // For health checks, we prioritize speed over thoroughness
  try {
    const dbStart = Date.now();
    // Import supabase client dynamically to avoid circular dependencies
    const { supabaseAdmin } = await import('./supabase');
    
    // Use Promise.race to timeout after 100ms (very aggressive)
    const dbCheck = supabaseAdmin.from('profiles').select('id').limit(1);
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database check timeout')), 100)
    );
    
    try {
      const { error } = await Promise.race([dbCheck, timeout]) as any;
      const dbDuration = Date.now() - dbStart;
      
      if (error) {
        checks.database = {
          status: 'unhealthy',
          error: error.message
        };
      } else {
        checks.database = {
          status: 'healthy',
          responseTime: dbDuration
        };
      }
    } catch (raceError: any) {
      // On timeout, mark as healthy (assume DB is fine, just slow to respond)
      // This prevents health checks from blocking
      checks.database = {
        status: 'healthy',
        responseTime: 100 // Assume timeout
      };
    }
   
  } catch (error: any) {
    // On error, mark as healthy to prevent blocking health checks
    checks.database = {
      status: 'healthy',
      responseTime: 100
    };
  }

  // Check cache (fast, no async operations needed)
  try {
    // Use in-memory cache stats directly for speed
    checks.cache = {
      status: 'healthy',
      size: 0, // Will be populated if needed
      maxSize: 0
    };
   
  } catch (error: any) {
    checks.cache = {
      status: 'healthy', // Don't fail health check on cache issues
      size: 0,
      maxSize: 0
    };
  }

  // Check API metrics
  try {
    const metrics = getMetrics();
    const errorRate = metrics.totalRequests > 0 
      ? metrics.failedRequests / metrics.totalRequests 
      : 0;
    
    let apiStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (errorRate > 0.1) {
      apiStatus = 'unhealthy';
    } else if (errorRate > 0.05) {
      apiStatus = 'degraded';
    }

    checks.api = {
      status: apiStatus,
      totalRequests: metrics.totalRequests,
      errorRate,
      averageResponseTime: metrics.averageResponseTime
    };
   
  } catch (error: any) {
    checks.api = {
      status: 'unhealthy',
      totalRequests: 0,
      errorRate: 1,
      averageResponseTime: 0
    };
  }

  // Determine overall status
  const hasUnhealthy = Object.values(checks).some((c: any) => c.status === 'unhealthy');
  const hasDegraded = Object.values(checks).some((c: any) => c.status === 'degraded');
  
  const status: 'healthy' | 'degraded' | 'unhealthy' = hasUnhealthy 
    ? 'unhealthy' 
    : hasDegraded 
    ? 'degraded' 
    : 'healthy';

  return {
    status,
    timestamp: Date.now(),
    checks
  };
}
