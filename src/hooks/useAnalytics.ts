'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  trackEvent,
  trackFeatureUsage,
  trackError as trackErrorAnalytics,
  setUserProperties,
  trackUserRole,
  AnalyticsEvents,
} from '@/lib/analytics';

/**
 * Custom hook for Google Analytics tracking
 * 
 * Provides easy-to-use functions for tracking events throughout the application
 */
export function useAnalytics() {
  const pathname = usePathname();

  const track = useCallback((eventName: string, params?: Record<string, any>) => {
    trackEvent(eventName, {
      page_path: pathname,
      ...params,
    });
  }, [pathname]);

  const trackFeature = useCallback((featureName: string, metadata?: Record<string, any>) => {
    trackFeatureUsage(featureName, {
      page_path: pathname,
      ...metadata,
    });
  }, [pathname]);

  const trackError = useCallback((error: Error, context?: Record<string, any>) => {
    trackErrorAnalytics(error, {
      page_path: pathname,
      ...context,
    });
  }, [pathname]);

  const setUser = useCallback((userId: string, properties?: Record<string, any>) => {
    setUserProperties(userId, properties);
  }, []);

  const setRole = useCallback((role: string) => {
    trackUserRole(role);
  }, []);

  return {
    track,
    trackFeature,
    trackError,
    setUser,
    setRole,
    events: AnalyticsEvents,
  };
}


