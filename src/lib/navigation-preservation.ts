/**
 * Navigation Preservation Utilities
 * 
 * Provides utilities to preserve component state during Next.js navigation
 * and restore it when returning to a page.
 */

'use client';

import { useAppStore } from '../store/app-store';
import { useDashboardStore } from '../store/dashboard-store';

/**
 * State cache for preserving component state during navigation
 */
const stateCache = new Map<string, any>();

/**
 * Save component state before navigation
 */
export function saveComponentState<T>(componentId: string, state: T): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Prevent saving empty state during initial load
    if (!state || (typeof state === 'object' && Object.keys(state).length === 0)) {
      return;
    }

    stateCache.set(componentId, {
      state,
      timestamp: Date.now(),
    });
    
    // Update app store navigation history with additional error handling
    try {
      const appStore = useAppStore.getState();
      if (appStore && typeof appStore.addToHistory === 'function') {
        appStore.addToHistory(componentId);
      }
    } catch (historyError) {
      // Don't break the app if history tracking fails
      console.warn('Error adding to navigation history (non-critical):', historyError);
    }
  } catch (error) {
    // Prevent errors from breaking the app
    console.error('Error saving component state:', error);
  }
}

/**
 * Load component state after navigation
 */
export function loadComponentState<T>(componentId: string): T | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = stateCache.get(componentId);
    if (!cached) {
      return null;
    }
    
    // Check if cache is too old (older than 30 minutes)
    const maxAge = 30 * 60 * 1000; // 30 minutes
    if (Date.now() - cached.timestamp > maxAge) {
      stateCache.delete(componentId);
      return null;
    }
    
    return cached.state as T;
  } catch (error) {
    console.error('Error loading component state:', error);
    return null;
  }
}

/**
 * Clear component state from cache
 */
export function clearComponentState(componentId: string): void {
  stateCache.delete(componentId);
}

/**
 * Clear all cached component states
 */
export function clearAllComponentStates(): void {
  stateCache.clear();
}

/**
 * Get all cached component IDs
 */
export function getCachedComponentIds(): string[] {
  return Array.from(stateCache.keys());
}

/**
 * Generate a component ID from route path
 */
export function getComponentIdFromPath(path: string): string {
  // Remove leading/trailing slashes and replace slashes with dashes
  return path.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'root';
}

/**
 * Generate a component ID from route path and params
 */
export function getComponentIdFromRoute(
  path: string,
  params?: Record<string, string | string[]>
): string {
  const baseId = getComponentIdFromPath(path);
  
  if (!params || Object.keys(params).length === 0) {
    return baseId;
  }
  
  // Add params to ID
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}:${Array.isArray(params[key]) ? params[key].join(',') : params[key]}`)
    .join('|');
  
  return `${baseId}__${paramString}`;
}

/**
 * Save dashboard-specific state before navigation
 */
export function saveDashboardState(
  dashboardId: string,
  state: {
    filters?: any;
    searchTerm?: string;
    activeTab?: string;
    pagination?: { page: number; pageSize: number };
    expandedItems?: string[];
    selectedItems?: string[];
  }
): void {
  try {
    const dashboardStore = useDashboardStore.getState();
    
    if (state.filters) {
      dashboardStore.setFilter(dashboardId, state.filters);
    }
    
    if (state.searchTerm !== undefined) {
      dashboardStore.setSearchTerm(dashboardId, state.searchTerm);
    }
    
    if (state.activeTab) {
      dashboardStore.setActiveTab(dashboardId, state.activeTab);
    }
    
    if (state.pagination) {
      dashboardStore.setPagination(
        dashboardId,
        state.pagination.page,
        state.pagination.pageSize
      );
    }
    
    if (state.expandedItems) {
      state.expandedItems.forEach((itemId) => {
        dashboardStore.setExpanded(dashboardId, itemId, true);
      });
    }
    
    if (state.selectedItems) {
      state.selectedItems.forEach((itemId) => {
        dashboardStore.setSelected(dashboardId, itemId, true);
      });
    }
  } catch (error) {
    console.error('Error saving dashboard state:', error);
  }
}

/**
 * Load dashboard-specific state after navigation
 */
export function loadDashboardState(dashboardId: string): {
  filters?: any;
  searchTerm?: string;
  activeTab?: string;
  pagination?: { page: number; pageSize: number };
  expandedItems?: Set<string>;
  selectedItems?: Set<string>;
} {
  try {
    const dashboardStore = useDashboardStore.getState();
    
    return {
      filters: dashboardStore.filters[dashboardId],
      searchTerm: dashboardStore.searchTerms[dashboardId],
      activeTab: dashboardStore.activeTabs[dashboardId],
      pagination: dashboardStore.pagination[dashboardId],
      expandedItems: dashboardStore.expandedItems[dashboardId],
      selectedItems: dashboardStore.selectedItems[dashboardId],
    };
  } catch (error) {
    console.error('Error loading dashboard state:', error);
    return {};
  }
}

/**
 * Clear dashboard state
 */
export function clearDashboardState(dashboardId: string): void {
  try {
    const dashboardStore = useDashboardStore.getState();
    dashboardStore.clearDashboardState(dashboardId);
  } catch (error) {
    console.error('Error clearing dashboard state:', error);
  }
}


