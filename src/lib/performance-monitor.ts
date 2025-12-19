/**
 * Performance Monitoring Utilities
 * Tracks Core Web Vitals and dashboard-specific performance metrics
 */

import { frontendLogger } from './frontend-logger';

export interface WebVitals {
  name: string;
  value: number;
  id: string;
  delta?: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
}

export interface DashboardMetrics {
  tabSwitchTime: number;
  dataLoadTime: number;
  renderTime: number;
  componentName: string;
}

/**
 * Track Core Web Vitals
 */
export function trackWebVitals(metric: WebVitals) {
  // Send to Sentry if available
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.metrics.distribution(`web_vitals.${metric.name}`, metric.value, {
      tags: {
        rating: metric.rating || 'unknown',
      },
      unit: 'millisecond',
    });
  }

  // Log for debugging
  frontendLogger.info('Web Vital tracked', {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
  });
}

/**
 * Track dashboard-specific performance metrics
 */
export function trackDashboardMetric(metrics: DashboardMetrics) {
  // Send to Sentry if available
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.metrics.distribution('dashboard.tab_switch_time', metrics.tabSwitchTime, {
      tags: {
        component: metrics.componentName,
      },
      unit: 'millisecond',
    });

    (window as any).Sentry.metrics.distribution('dashboard.data_load_time', metrics.dataLoadTime, {
      tags: {
        component: metrics.componentName,
      },
      unit: 'millisecond',
    });

    (window as any).Sentry.metrics.distribution('dashboard.render_time', metrics.renderTime, {
      tags: {
        component: metrics.componentName,
      },
      unit: 'millisecond',
    });
  }

  // Log for debugging
  frontendLogger.info('Dashboard metric tracked', {
    component: metrics.componentName,
    tabSwitchTime: metrics.tabSwitchTime,
    dataLoadTime: metrics.dataLoadTime,
    renderTime: metrics.renderTime,
  });
}

/**
 * Measure performance of an async operation
 */
export async function measurePerformance<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    trackDashboardMetric({
      tabSwitchTime: 0,
      dataLoadTime: duration,
      renderTime: 0,
      componentName: operationName,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    frontendLogger.error(`Performance measurement failed for ${operationName}`, {
      operation: operationName,
      duration,
    }, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Initialize Web Vitals tracking
 */
export function initWebVitalsTracking() {
  if (typeof window === 'undefined') return;

  // Track LCP (Largest Contentful Paint)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            const lcpEntry = entry as PerformanceEntry & { renderTime?: number; loadTime?: number };
            const value = lcpEntry.renderTime || lcpEntry.loadTime || 0;
            trackWebVitals({
              name: 'LCP',
              value,
              id: entry.name,
              rating: value < 2500 ? 'good' : value < 4000 ? 'needs-improvement' : 'poor',
            });
          }
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // PerformanceObserver not supported
    }

    // Track FID (First Input Delay)
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'first-input') {
            const fidEntry = entry as PerformanceEventTiming;
            trackWebVitals({
              name: 'FID',
              value: fidEntry.processingStart - fidEntry.startTime,
              id: entry.name,
              rating: fidEntry.processingStart - fidEntry.startTime < 100 ? 'good' : 'needs-improvement',
            });
          }
        }
      });
      observer.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // PerformanceObserver not supported
    }
  }
}


