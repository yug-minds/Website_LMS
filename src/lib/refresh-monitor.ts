/**
 * Refresh Monitoring Utility
 * 
 * Monitors and logs refresh behavior to help identify issues
 * and optimize refresh patterns.
 */

interface RefreshEvent {
  timestamp: number;
  type: 'visibility' | 'focus' | 'manual';
  component: string;
  wasThrottled: boolean;
  hadUnsavedData: boolean;
}

class RefreshMonitor {
  private events: RefreshEvent[] = [];
  private maxEvents = 100; // Keep last 100 events
  private enabled = true;

  /**
   * Log a refresh event
   */
  logRefresh(
    type: 'visibility' | 'focus' | 'manual',
    component: string,
    wasThrottled: boolean,
    hadUnsavedData: boolean
  ): void {
    if (!this.enabled) return;

    const event: RefreshEvent = {
      timestamp: Date.now(),
      type,
      component,
      wasThrottled,
      hadUnsavedData,
    };

    this.events.push(event);

    // Keep only last N events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      const status = wasThrottled
        ? '⏳ THROTTLED'
        : hadUnsavedData
        ? '⏸️ SKIPPED (unsaved data)'
        : '✅ EXECUTED';
      
      console.log(`[RefreshMonitor] ${status} - ${type} in ${component}`);
    }
  }

  /**
   * Get refresh statistics
   */
  getStats(): {
    total: number;
    executed: number;
    throttled: number;
    skipped: number;
    byType: Record<string, number>;
    byComponent: Record<string, number>;
  } {
    const stats = {
      total: this.events.length,
      executed: 0,
      throttled: 0,
      skipped: 0,
      byType: {} as Record<string, number>,
      byComponent: {} as Record<string, number>,
    };

    this.events.forEach(event => {
      // Count by type
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      
      // Count by component
      stats.byComponent[event.component] = (stats.byComponent[event.component] || 0) + 1;

      // Count by status
      if (event.wasThrottled) {
        stats.throttled++;
      } else if (event.hadUnsavedData) {
        stats.skipped++;
      } else {
        stats.executed++;
      }
    });

    return stats;
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 10): RefreshEvent[] {
    return this.events.slice(-limit).reverse();
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Export events for analysis
   */
  exportEvents(): string {
    return JSON.stringify({
      events: this.events,
      stats: this.getStats(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }
}

// Singleton instance
export const refreshMonitor = new RefreshMonitor();

/**
 * Hook to use refresh monitoring in components
 */
export function useRefreshMonitoring(componentName: string) {
  return {
    logRefresh: (
      type: 'visibility' | 'focus' | 'manual',
      wasThrottled: boolean,
      hadUnsavedData: boolean
    ) => {
      refreshMonitor.logRefresh(type, componentName, wasThrottled, hadUnsavedData);
    },
    getStats: () => refreshMonitor.getStats(),
    getRecentEvents: (limit?: number) => refreshMonitor.getRecentEvents(limit),
  };
}

// Expose to window for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).refreshMonitor = refreshMonitor;
}



