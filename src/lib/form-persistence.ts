/**
 * Form Data Persistence Utility
 * 
 * Provides automatic form data persistence to prevent data loss
 * when switching tabs or refreshing the page.
 * Supports both localStorage and sessionStorage.
 */

'use client';

import { useFormStore } from '../store/form-store';

const STORAGE_PREFIX = 'form_data_';
const SESSION_STORAGE_PREFIX = 'session_form_data_';
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit

/**
 * Get storage key for a form
 */
function getStorageKey(formId: string, useSession = false): string {
  const prefix = useSession ? SESSION_STORAGE_PREFIX : STORAGE_PREFIX;
  return `${prefix}${formId}`;
}

/**
 * Check if storage is available and has space
 */
function isStorageAvailable(useSession = false): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const storage = useSession ? sessionStorage : localStorage;
    const test = '__storage_test__';
    storage.setItem(test, test);
    storage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current storage size
 */
function getStorageSize(useSession = false): number {
  if (!isStorageAvailable(useSession)) return 0;
  
  const storage = useSession ? sessionStorage : localStorage;
  let total = 0;
  for (const key in storage) {
    if (storage.hasOwnProperty(key)) {
      total += storage[key].length + key.length;
    }
  }
  return total;
}

/**
 * Clear old form data if storage is getting full
 */
function cleanupStorage(useSession = false): void {
  if (!isStorageAvailable(useSession)) return;
  
  const storage = useSession ? sessionStorage : localStorage;
  const prefix = useSession ? SESSION_STORAGE_PREFIX : STORAGE_PREFIX;
  const currentSize = getStorageSize(useSession);
  if (currentSize < MAX_STORAGE_SIZE * 0.8) return; // Only cleanup if > 80% full
  
  // Get all form data keys
  const formKeys: Array<{ key: string; timestamp: number }> = [];
  
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        const data = JSON.parse(storage.getItem(key) || '{}');
        if (data.timestamp) {
          formKeys.push({ key, timestamp: data.timestamp });
        }
      } catch {
        // Invalid data, remove it
        storage.removeItem(key);
      }
    }
  }
  
  // Sort by timestamp (oldest first)
  formKeys.sort((a: any, b: any) => a.timestamp - b.timestamp);
  
  // Remove oldest 25% of forms
  const toRemove = Math.floor(formKeys.length * 0.25);
  for (let i = 0; i < toRemove; i++) {
    storage.removeItem(formKeys[i].key);
  }
}

/**
 * Save form data to storage (localStorage or sessionStorage)
 */
export function saveFormData<T extends Record<string, any>>(
  formId: string,
  data: T,
  useSession = false
): boolean {
  if (!isStorageAvailable(useSession)) {
    console.warn(`${useSession ? 'sessionStorage' : 'localStorage'} not available for form persistence`);
    return false;
  }

  try {
    const storage = useSession ? sessionStorage : localStorage;
    const storageKey = getStorageKey(formId, useSession);
    const dataToStore = {
      data,
      timestamp: Date.now(),
      formId,
    };

    // Check storage size before saving
    cleanupStorage(useSession);

    storage.setItem(storageKey, JSON.stringify(dataToStore));
    
    // Also update Zustand store for real-time access
    if (typeof window !== 'undefined') {
      try {
        useFormStore.getState().setFormData(formId, data);
        useFormStore.getState().setAutoSaveStatus(formId, {
          lastSaved: Date.now(),
          isSaving: false,
          hasError: false,
        });
      } catch (error) {
        // Store update failed, but storage save succeeded
        console.warn('Failed to update form store:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error saving form data:', error);
    
    // Update store with error status
    if (typeof window !== 'undefined') {
      try {
        useFormStore.getState().setAutoSaveStatus(formId, {
          isSaving: false,
          hasError: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch {
        // Ignore store update errors
      }
    }
    
    return false;
  }
}

/**
 * Load form data from storage (localStorage or sessionStorage)
 * Tries sessionStorage first, then localStorage, then Zustand store
 */
export function loadFormData<T extends Record<string, any>>(
  formId: string,
  useSession = false
): T | null {
  // First try Zustand store (fastest, in-memory)
  if (typeof window !== 'undefined') {
    try {
      const storeData = useFormStore.getState().getFormData<T>(formId);
      if (storeData) {
        return storeData;
      }
    } catch {
      // Ignore store errors
    }
  }
  
  // Try sessionStorage if requested
  if (useSession && isStorageAvailable(true)) {
    try {
      const storageKey = getStorageKey(formId, true);
      const stored = sessionStorage.getItem(storageKey);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.data as T;
      }
    } catch (error) {
      console.warn('Error loading from sessionStorage:', error);
    }
  }
  
  // Try localStorage
  if (!isStorageAvailable(false)) return null;

  try {
    const storageKey = getStorageKey(formId, false);
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    
    // Check if data is too old (older than 24 hours) - only for localStorage
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - parsed.timestamp > maxAge) {
      localStorage.removeItem(storageKey);
      return null;
    }

    const data = parsed.data as T;
    
    // Update store with loaded data
    if (typeof window !== 'undefined') {
      try {
        useFormStore.getState().setFormData(formId, data);
      } catch {
        // Ignore store update errors
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error loading form data:', error);
    return null;
  }
}

/**
 * Clear form data from storage (both localStorage and sessionStorage)
 */
export function clearFormData(formId: string, useSession = false): void {
  // Clear from Zustand store
  if (typeof window !== 'undefined') {
    try {
      useFormStore.getState().clearFormData(formId);
    } catch {
      // Ignore store errors
    }
  }
  
  // Clear from sessionStorage if requested
  if (useSession && isStorageAvailable(true)) {
    try {
      const sessionKey = getStorageKey(formId, true);
      sessionStorage.removeItem(sessionKey);
    } catch (error) {
      console.error('Error clearing form data from sessionStorage:', error);
    }
  }
  
  // Clear from localStorage
  if (!isStorageAvailable(false)) return;

  try {
    const storageKey = getStorageKey(formId, false);
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.error('Error clearing form data from localStorage:', error);
  }
}

/**
 * Clear all form data (from both localStorage and sessionStorage)
 */
export function clearAllFormData(): void {
  // Clear Zustand store
  if (typeof window !== 'undefined') {
    try {
      useFormStore.getState().clearAllForms();
    } catch {
      // Ignore store errors
    }
  }
  
  // Clear localStorage
  if (isStorageAvailable(false)) {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Error clearing all form data from localStorage:', error);
    }
  }
  
  // Clear sessionStorage
  if (isStorageAvailable(true)) {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(SESSION_STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      console.error('Error clearing all form data from sessionStorage:', error);
    }
  }
}

/**
 * Check if form has saved data (checks store, sessionStorage, and localStorage)
 */
export function hasFormData(formId: string): boolean {
  // Check Zustand store
  if (typeof window !== 'undefined') {
    try {
      const storeData = useFormStore.getState().getFormData(formId);
      if (storeData) return true;
    } catch {
      // Ignore store errors
    }
  }
  
  // Check sessionStorage
  if (isStorageAvailable(true)) {
    try {
      const sessionKey = getStorageKey(formId, true);
      if (sessionStorage.getItem(sessionKey) !== null) return true;
    } catch {
      // Ignore errors
    }
  }
  
  // Check localStorage
  if (!isStorageAvailable(false)) return false;

  try {
    const storageKey = getStorageKey(formId, false);
    return localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}

/**
 * React hook for form data persistence
 * Enhanced with Zustand store integration and session storage support
 */
export function useFormPersistence<T extends Record<string, any>>(
  formId: string,
  formData: T,
  options: {
    autoSave?: boolean;
    autoSaveInterval?: number;
    useSession?: boolean;
    onLoad?: (data: T) => void;
    onSave?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const { 
    autoSave = true, 
    autoSaveInterval = 5000,
    useSession = false,
    onLoad,
    onSave,
    onError,
  } = options;

  // Register form in store on mount
  if (typeof window !== 'undefined') {
    try {
      useFormStore.getState().registerForm(formId);
    } catch {
      // Ignore registration errors
    }
  }

  // Load data on mount
  if (typeof window !== 'undefined') {
    const savedData = loadFormData<T>(formId, useSession);
    if (savedData && onLoad) {
      // Use setTimeout to avoid state updates during render
      setTimeout(() => onLoad(savedData), 0);
    }
  }

  // Auto-save form data
  if (autoSave && typeof window !== 'undefined') {
    const saveInterval = setInterval(() => {
      try {
        useFormStore.getState().setAutoSaveStatus(formId, { isSaving: true });
        const saved = saveFormData(formId, formData, useSession);
        if (saved && onSave) {
          onSave(formData);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (onError) {
          onError(err);
        }
        useFormStore.getState().setAutoSaveStatus(formId, {
          isSaving: false,
          hasError: true,
          errorMessage: err.message,
        });
      }
    }, autoSaveInterval);

    // Cleanup on unmount
    return () => {
      clearInterval(saveInterval);
      // Unregister form
      try {
        useFormStore.getState().unregisterForm(formId);
      } catch {
        // Ignore unregistration errors
      }
    };
  }
  
  // Return cleanup function even if auto-save is disabled
  return () => {
    try {
      useFormStore.getState().unregisterForm(formId);
    } catch {
      // Ignore unregistration errors
    }
  };
}

