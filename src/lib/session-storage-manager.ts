/**
 * Session Storage Manager
 * 
 * Provides backup and recovery for critical application state
 * on page refresh. Uses sessionStorage which persists across
 * page reloads but is cleared when the tab is closed.
 */

'use client';

import { useAppStore } from '../store/app-store';
import { useDashboardStore } from '../store/dashboard-store';
import { useFormStore } from '../store/form-store';

const SESSION_STORAGE_KEY = 'app_session_backup';
const BACKUP_INTERVAL = 5000; // Backup every 5 seconds

interface SessionBackup {
  timestamp: number;
  appState: {
    currentRoute: string | null;
    previousRoute: string | null;
    navigationHistory: string[];
    sidebarCollapsed: boolean;
  };
  dashboardState: {
    filters: Record<string, any>;
    searchTerms: Record<string, string>;
    activeTabs: Record<string, string>;
    pagination: Record<string, { page: number; pageSize: number }>;
  };
  formState: {
    formData: Record<string, any>;
    isDirty: Record<string, boolean>;
  };
}

/**
 * Check if sessionStorage is available
 */
function isSessionStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const test = '__session_storage_test__';
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save current application state to sessionStorage
 */
export function saveSessionBackup(): boolean {
  if (!isSessionStorageAvailable()) {
    console.warn('sessionStorage not available for backup');
    return false;
  }

  try {
    const appStore = useAppStore.getState();
    const dashboardStore = useDashboardStore.getState();
    const formStore = useFormStore.getState();

    const backup: SessionBackup = {
      timestamp: Date.now(),
      appState: {
        currentRoute: appStore.currentRoute,
        previousRoute: appStore.previousRoute,
        navigationHistory: appStore.navigationHistory,
        sidebarCollapsed: appStore.sidebarCollapsed,
      },
      dashboardState: {
        filters: dashboardStore.filters,
        searchTerms: dashboardStore.searchTerms,
        activeTabs: dashboardStore.activeTabs,
        pagination: dashboardStore.pagination,
      },
      formState: {
        formData: formStore.formData,
        isDirty: formStore.isDirty,
      },
    };

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(backup));
    return true;
  } catch (error) {
    console.error('Error saving session backup:', error);
    return false;
  }
}

/**
 * Load application state from sessionStorage backup
 */
export function loadSessionBackup(): SessionBackup | null {
  if (!isSessionStorageAvailable()) {
    return null;
  }

  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const backup: SessionBackup = JSON.parse(stored);
    
    // Check if backup is too old (older than 1 hour)
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - backup.timestamp > maxAge) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return backup;
  } catch (error) {
    console.error('Error loading session backup:', error);
    return null;
  }
}

/**
 * Restore application state from backup
 */
export function restoreSessionBackup(backup: SessionBackup): void {
  try {
    // Restore app state
    if (backup.appState) {
      const appStore = useAppStore.getState();
      if (backup.appState.currentRoute) {
        appStore.setCurrentRoute(backup.appState.currentRoute);
      }
      if (backup.appState.previousRoute) {
        appStore.setPreviousRoute(backup.appState.previousRoute);
      }
      if (backup.appState.navigationHistory) {
        backup.appState.navigationHistory.forEach((route) => {
          appStore.addToHistory(route);
        });
      }
      if (typeof backup.appState.sidebarCollapsed === 'boolean') {
        appStore.setSidebarCollapsed(backup.appState.sidebarCollapsed);
      }
    }

    // Restore dashboard state
    if (backup.dashboardState) {
      const dashboardStore = useDashboardStore.getState();
      if (backup.dashboardState.filters) {
        Object.keys(backup.dashboardState.filters).forEach((dashboardId) => {
          dashboardStore.setFilter(dashboardId, backup.dashboardState.filters[dashboardId]);
        });
      }
      if (backup.dashboardState.searchTerms) {
        Object.keys(backup.dashboardState.searchTerms).forEach((dashboardId) => {
          dashboardStore.setSearchTerm(dashboardId, backup.dashboardState.searchTerms[dashboardId]);
        });
      }
      if (backup.dashboardState.activeTabs) {
        Object.keys(backup.dashboardState.activeTabs).forEach((dashboardId) => {
          dashboardStore.setActiveTab(dashboardId, backup.dashboardState.activeTabs[dashboardId]);
        });
      }
      if (backup.dashboardState.pagination) {
        Object.keys(backup.dashboardState.pagination).forEach((dashboardId) => {
          const pagination = backup.dashboardState.pagination[dashboardId];
          dashboardStore.setPagination(dashboardId, pagination.page, pagination.pageSize);
        });
      }
    }

    // Restore form state
    if (backup.formState) {
      const formStore = useFormStore.getState();
      if (backup.formState.formData) {
        Object.keys(backup.formState.formData).forEach((formId) => {
          formStore.setFormData(formId, backup.formState.formData[formId]);
        });
      }
      if (backup.formState.isDirty) {
        Object.keys(backup.formState.isDirty).forEach((formId) => {
          formStore.setDirty(formId, backup.formState.isDirty[formId]);
        });
      }
    }
  } catch (error) {
    console.error('Error restoring session backup:', error);
  }
}

/**
 * Clear session backup
 */
export function clearSessionBackup(): void {
  if (!isSessionStorageAvailable()) {
    return;
  }

  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing session backup:', error);
  }
}

/**
 * Initialize session backup system
 * Should be called once when the app starts
 */
export function initSessionBackup(): () => void {
  if (typeof window === 'undefined') {
    return () => {}; // No-op for SSR
  }

  // Try to restore previous backup on load
  const backup = loadSessionBackup();
  if (backup) {
    restoreSessionBackup(backup);
  }

  // Set up periodic backups
  const backupInterval = setInterval(() => {
    saveSessionBackup();
  }, BACKUP_INTERVAL);

  // Save backup on beforeunload (page refresh/close)
  const handleBeforeUnload = () => {
    saveSessionBackup();
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  // Return cleanup function
  return () => {
    clearInterval(backupInterval);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}


