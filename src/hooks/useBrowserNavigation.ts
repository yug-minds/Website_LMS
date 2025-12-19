"use client";

import { useEffect, useCallback, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore } from '../store/app-store';
import { useFormStore } from '../store/form-store';
import { loadComponentState, saveComponentState, getComponentIdFromPath } from '../lib/navigation-preservation';

/**
 * Options for browser navigation hook
 */
export interface UseBrowserNavigationOptions {
  /**
   * Component identifier
   */
  componentId?: string;
  
  /**
   * Callback to get state to save
   */
  getStateToSave?: () => any;
  
  /**
   * Callback when state should be restored
   */
  onStateRestore?: (state: any) => void;
  
  /**
   * Whether to handle popstate events (back/forward buttons) (default: true)
   */
  handlePopState?: boolean;
  
  /**
   * Whether to handle visibility change events (default: true)
   */
  handleVisibilityChange?: boolean;
  
  /**
   * Whether to warn user before leaving with unsaved changes (default: true)
   */
  warnOnUnsavedChanges?: boolean;
}

/**
 * Hook to handle browser navigation events (back/forward buttons, tab switching, etc.)
 * 
 * Features:
 * - Handles popstate events (back/forward buttons)
 * - Handles visibility changes (tab switching)
 * - Warns user before leaving with unsaved changes
 * - Restores component state on navigation
 * 
 * @example
 * ```tsx
 * useBrowserNavigation({
 *   componentId: 'dashboard-page',
 *   getStateToSave: () => ({ formData, filters }),
 *   onStateRestore: (state) => {
 *     setFormData(state.formData);
 *     setFilters(state.filters);
 *   },
 * });
 * ```
 */
export function useBrowserNavigation(options: UseBrowserNavigationOptions = {}) {
  const pathname = usePathname();
  const {
    componentId,
    getStateToSave,
    onStateRestore,
    handlePopState = true,
    handleVisibilityChange = true,
    warnOnUnsavedChanges = true,
  } = options;

  // All hooks must be called unconditionally (React rules)
  const appStore = useAppStore();
  const isDirty = useFormStore((state: any) => state.isDirty);
  const isClient = typeof window !== 'undefined';
  const currentComponentIdRef = useRef<string>(
    isClient ? (componentId || (pathname ? getComponentIdFromPath(pathname) : 'unknown')) : 'server'
  );
  const isNavigatingRef = useRef(false);

  // Update component ID when pathname changes
  useEffect(() => {
    currentComponentIdRef.current = componentId || getComponentIdFromPath(pathname);
  }, [pathname, componentId]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback((): boolean => {
    // Check form store for dirty forms
    if (isDirty && Object.values(isDirty).some((dirty) => dirty === true)) {
      return true;
    }
    
    // Check if component has unsaved state (via callback)
    if (getStateToSave) {
      const state = getStateToSave();
      // If state exists and is not empty, consider it unsaved
      if (state && typeof state === 'object' && Object.keys(state).length > 0) {
        return true;
      }
    }
    
    return false;
  }, [isDirty, getStateToSave]);

  // Handle popstate events (back/forward buttons)
  useEffect(() => {
    if (!handlePopState || !isClient) {
      return;
    }

    const handlePopStateEvent = (event: PopStateEvent) => {
      if (typeof window === 'undefined') return;
      
      isNavigatingRef.current = true;
      
      // Restore state if available
      if (onStateRestore) {
        const savedState = loadComponentState(currentComponentIdRef.current);
        if (savedState) {
          onStateRestore(savedState);
        }
      }
      
      // Update app store
      appStore.setCurrentRoute(window.location.pathname);
      
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 100);
    };

    window.addEventListener('popstate', handlePopStateEvent);
    
    return () => {
      if (isClient) {
        window.removeEventListener('popstate', handlePopStateEvent);
      }
    };
  }, [handlePopState, onStateRestore, appStore, isClient]);

  // Handle visibility change (tab switching)
  useEffect(() => {
    if (!handleVisibilityChange || !isClient) {
      return;
    }

    const handleVisibilityChangeEvent = () => {
      if (typeof document === 'undefined') return;
      
      if (document.visibilityState === 'hidden') {
        // Save state when tab becomes hidden
        if (getStateToSave) {
          const state = getStateToSave();
          if (state !== undefined && state !== null) {
            saveComponentState(currentComponentIdRef.current, state);
          }
        }
      } else if (document.visibilityState === 'visible') {
        // Restore state when tab becomes visible (if needed)
        // This is usually handled by smart refresh, but we can restore here too
        if (onStateRestore) {
          const savedState = loadComponentState(currentComponentIdRef.current);
          if (savedState) {
            // Only restore if we're still on the same component
            const currentId = componentId || getComponentIdFromPath(pathname);
            if (currentId === currentComponentIdRef.current) {
              onStateRestore(savedState);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChangeEvent);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChangeEvent);
    };
  }, [handleVisibilityChange, getStateToSave, onStateRestore, componentId, pathname, isClient]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!warnOnUnsavedChanges || typeof window === 'undefined') {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        // Save state before leaving
        if (getStateToSave) {
          const state = getStateToSave();
          if (state !== undefined && state !== null) {
            saveComponentState(currentComponentIdRef.current, state);
          }
        }
        
        // Show browser warning
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      if (isClient) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [warnOnUnsavedChanges, hasUnsavedChanges, getStateToSave, isClient]);

  // Save state when component unmounts
  useEffect(() => {
    return () => {
      if (getStateToSave && !isNavigatingRef.current) {
        const state = getStateToSave();
        if (state !== undefined && state !== null) {
          saveComponentState(currentComponentIdRef.current, state);
        }
      }
    };
  }, [getStateToSave]);

  const [isNavigating, setIsNavigating] = useState(false);
  
  // Update navigation state when ref changes
  useEffect(() => {
    setIsNavigating(isNavigatingRef.current);
  }, []);

  return {
    hasUnsavedChanges,
    isNavigating,
  };
}


