"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshMonitor } from '../lib/refresh-monitor';
import { useFormStore } from '../store/form-store';

/**
 * Configuration for smart refresh behavior
 */
interface SmartRefreshOptions {
  /**
   * Minimum time (ms) between refreshes when switching tabs
   * Default: 30 seconds - prevents excessive refreshes
   */
  minRefreshInterval?: number;
  
  /**
   * Whether to refresh on visibility change
   * Default: true
   */
  refreshOnVisibility?: boolean;
  
  /**
   * Whether to refresh on window focus
   * Default: true
   */
  refreshOnFocus?: boolean;
  
  /**
   * Callback to check if form has unsaved data
   * If returns true, refresh will be skipped to prevent data loss
   */
  hasUnsavedData?: () => boolean;
  
  /**
   * Callback when refresh is triggered
   */
  onRefresh?: () => void | Promise<void>;
  
  /**
   * Query keys to invalidate on refresh
   * If not provided, no queries will be invalidated
   */
  queryKeys?: Array<readonly unknown[]>;
  
  /**
   * Custom refresh function
   * If provided, this will be called instead of query invalidation
   */
  customRefresh?: () => void | Promise<void>;
}

/**
 * Hook for smart tab switching and refresh management
 * 
 * This hook provides intelligent refresh behavior that:
 * - Debounces rapid tab switches
 * - Prevents refreshes when forms have unsaved data
 * - Coordinates multiple refresh requests to avoid conflicts
 * - Only refreshes when necessary (not on every tab switch)
 * 
 * @example
 * ```tsx
 * useSmartRefresh({
 *   queryKeys: [['teacher', 'reports', schoolId]],
 *   hasUnsavedData: () => formData.isDirty,
 *   minRefreshInterval: 60000, // 1 minute
 * });
 * ```
 */
export function useSmartRefresh(options: SmartRefreshOptions = {}) {
  const {
    minRefreshInterval = 30000, // 30 seconds default
    refreshOnVisibility = true,
    refreshOnFocus = true,
    hasUnsavedData,
    onRefresh,
    queryKeys = [],
    customRefresh,
  } = options;

  const queryClient = useQueryClient();
  const formStore = useFormStore();
  const lastRefreshRef = useRef<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef<boolean>(false);
  const componentNameRef = useRef<string>(
    typeof window !== 'undefined' 
      ? window.location.pathname.split('/').pop() || 'unknown'
      : 'unknown'
  );

  // Store options in refs to avoid recreating callbacks
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  /**
   * Perform the actual refresh operation
   */
  const performRefresh = useCallback(async (eventType: 'visibility' | 'focus' | 'manual' = 'manual') => {
    const opts = optionsRef.current;
    // Prevent concurrent refreshes
    if (isRefreshingRef.current) {
      return;
    }

    // Check if form has unsaved data (from callback or Zustand store)
    const hasUnsavedCallback = opts.hasUnsavedData && opts.hasUnsavedData();
    const hasUnsavedInStore = formStore.hasUnsavedForms();
    const hasUnsaved = hasUnsavedCallback || hasUnsavedInStore;
    
    if (hasUnsaved) {
      console.log('⏸️ Refresh skipped - form has unsaved data', {
        fromCallback: hasUnsavedCallback,
        fromStore: hasUnsavedInStore,
        unsavedForms: formStore.getUnsavedFormIds(),
      });
      refreshMonitor.logRefresh(
        eventType,
        componentNameRef.current,
        false,
        true
      );
      return;
    }

    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshRef.current;
    const interval = opts.minRefreshInterval || 30000;

    // Throttle refreshes
    if (timeSinceLastRefresh < interval) {
      const remainingTime = interval - timeSinceLastRefresh;
      console.log(`⏳ Refresh throttled - waiting ${Math.round(remainingTime / 1000)}s`);
      
      // Log throttled event
      refreshMonitor.logRefresh(
        eventType,
        componentNameRef.current,
        true,
        false
      );
      
      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Schedule refresh for later
      refreshTimeoutRef.current = setTimeout(() => {
        performRefresh(eventType);
      }, remainingTime);
      return;
    }

    try {
      isRefreshingRef.current = true;
      lastRefreshRef.current = now;

      console.log('🔄 Performing smart refresh...');

      // Call custom refresh if provided
      if (opts.customRefresh) {
        await opts.customRefresh();
      } else if (opts.queryKeys && opts.queryKeys.length > 0) {
        // Invalidate queries
        for (const key of opts.queryKeys) {
          queryClient.invalidateQueries({ queryKey: key as readonly unknown[] });
        }
      }

      // Call optional onRefresh callback
      if (opts.onRefresh) {
        await opts.onRefresh();
      }
      
      // Log successful refresh
      refreshMonitor.logRefresh(
        eventType,
        componentNameRef.current,
        false,
        false
      );
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [queryClient, formStore]); // Include formStore for unsaved data checks

  /**
   * Handle visibility change
   */
  useEffect(() => {
    if (!refreshOnVisibility) return;

    const handleVisibilityChange = () => {
      // Only refresh when becoming visible (not when hiding)
      if (document.visibilityState === 'visible') {
        performRefresh('visibility');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshOnVisibility, performRefresh]);

  /**
   * Handle window focus
   */
  useEffect(() => {
    if (!refreshOnFocus) return;

    const handleFocus = () => {
      performRefresh('focus');
    };

    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [refreshOnFocus, performRefresh]);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(() => {
    performRefresh('manual');
  }, [performRefresh]);

  return { refresh };
}


