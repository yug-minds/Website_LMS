/**
 * Connection pool monitoring and health checks
 * Tracks connection pool usage and provides metrics
 */

interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  poolSize: number;
  utilizationPercent: number;
  timestamp: number;
}

class ConnectionPoolMonitor {
  private metrics: PoolMetrics[] = [];
  private maxMetricsHistory = 100;

  /**
   * Record pool metrics
   */
  recordMetrics(metrics: Omit<PoolMetrics, 'timestamp'>): void {
    this.metrics.push({
      ...metrics,
      timestamp: Date.now()
    });

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }
  }

  /**
   * Get current pool metrics
   */
  getCurrentMetrics(): PoolMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit: number = 50): PoolMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get average utilization over time
   */
  getAverageUtilization(): number {
    if (this.metrics.length === 0) return 0;
    
    const sum = this.metrics.reduce((acc: number, m: any) => acc + m.utilizationPercent, 0);
    return Math.round(sum / this.metrics.length);
  }

  /**
   * Check if pool is healthy (utilization < 80%)
   */
  isHealthy(): boolean {
    const current = this.getCurrentMetrics();
    return current ? current.utilizationPercent < 80 : true;
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    healthy: boolean;
    utilization: number;
    warning: boolean;
    critical: boolean;
  } {
    const current = this.getCurrentMetrics();
    if (!current) {
      return { healthy: true, utilization: 0, warning: false, critical: false };
    }

    return {
      healthy: current.utilizationPercent < 70,
      utilization: current.utilizationPercent,
      warning: current.utilizationPercent >= 70 && current.utilizationPercent < 85,
      critical: current.utilizationPercent >= 85
    };
  }
}

export const poolMonitor = new ConnectionPoolMonitor();

/**
 * Get optimal pool size based on environment
 */
export function getOptimalPoolSize(): number {
  const connectionString = process.env.DATABASE_URL || '';
  const isPooler = connectionString.includes(':6543') || connectionString.includes('pooler');
  const env = process.env.NODE_ENV || 'development';
  
  // Check for explicit override
  if (process.env.DB_POOL_SIZE) {
    return parseInt(process.env.DB_POOL_SIZE, 10);
  }

  if (isPooler) {
    // Pooler connection - can handle more connections
    return env === 'production' ? 150 : 100;
  } else {
    // Direct connection - more conservative
    return env === 'production' ? 15 : 10;
  }
}

/**
 * Get connection pool configuration
 */
export function getPoolConfig() {
  const poolSize = getOptimalPoolSize();
  const connectionString = process.env.DATABASE_URL || '';
  const isPooler = connectionString.includes(':6543') || connectionString.includes('pooler');

  return {
    max: poolSize,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30, // 30 minutes
    isPooler,
    connectionType: isPooler ? 'pooler' : 'direct'
  };
}


