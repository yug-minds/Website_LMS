"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useFormStore } from '../store/form-store';
import { saveFormData, loadFormData, clearFormData } from '../lib/form-persistence';

/**
 * Options for auto-save form hook
 */
export interface UseAutoSaveFormOptions<T> {
  /**
   * Form identifier (must be unique)
   */
  formId: string;
  
  /**
   * Form data to persist
   */
  formData: T;
  
  /**
   * Whether auto-save is enabled (default: true)
   */
  autoSave?: boolean;
  
  /**
   * Auto-save interval in milliseconds (default: 2000)
   */
  autoSaveInterval?: number;
  
  /**
   * Use sessionStorage instead of localStorage (default: false)
   * Session storage is cleared when tab is closed
   */
  useSession?: boolean;
  
  /**
   * Debounce delay in milliseconds (default: 500)
   * Waits this long after user stops typing before saving
   */
  debounceDelay?: number;
  
  /**
   * Callback when form data is loaded from storage
   */
  onLoad?: (data: T) => void;
  
  /**
   * Callback when form data is saved
   */
  onSave?: (data: T) => void;
  
  /**
   * Callback when save fails
   */
  onError?: (error: Error) => void;
  
  /**
   * Whether to mark form as dirty on changes (default: true)
   */
  markDirty?: boolean;
  
  /**
   * Custom function to determine if form has changes worth saving
   */
  hasChanges?: (data: T) => boolean;
}

/**
 * Hook for automatic form data persistence with debouncing and Zustand integration
 * 
 * Features:
 * - Automatic saving to localStorage/sessionStorage
 * - Debounced saves (waits for user to stop typing)
 * - Integration with Zustand form store
 * - Loads saved data on mount
 * - Tracks dirty state
 * - Auto-save status tracking
 * 
 * @example
 * ```tsx
 * const [formData, setFormData] = useState({ name: '', email: '' });
 * 
 * useAutoSaveForm({
 *   formId: 'user-profile-form',
 *   formData,
 *   autoSaveInterval: 3000,
 *   debounceDelay: 800,
 *   onLoad: (data) => setFormData(data),
 * });
 * ```
 */
export function useAutoSaveForm<T extends Record<string, any>>(
  options: UseAutoSaveFormOptions<T>
) {
  const {
    formId,
    formData,
    autoSave = true,
    autoSaveInterval = 2000,
    useSession = false,
    debounceDelay = 500,
    onLoad,
    onSave,
    onError,
    markDirty = true,
    hasChanges,
  } = options;

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<T | null>(null);
  const isInitialLoadRef = useRef(true);
  const formDataRef = useRef<T>(formData);
  const formStore = useFormStore();
  
  // Use refs for callbacks to prevent saveForm from being recreated
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);
  const hasChangesRef = useRef(hasChanges);
  
  // Update refs when callbacks change
  useEffect(() => {
    onSaveRef.current = onSave;
    onErrorRef.current = onError;
    hasChangesRef.current = hasChanges;
  }, [onSave, onError, hasChanges]);

  // Keep formDataRef in sync with formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Register form in store
  useEffect(() => {
    formStore.registerForm(formId);
    return () => {
      formStore.unregisterForm(formId);
      // Clear timers on unmount
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]); // formStore is stable, no need to include in deps

  // Load saved data on mount
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      
      try {
        // Try to load from store first
        let savedData = formStore.getFormData<T>(formId);
        
        // If not in store, try loading from storage
        if (!savedData) {
          savedData = loadFormData<T>(formId, useSession);
          if (savedData) {
            // Restore to store
            formStore.setFormData(formId, savedData);
          }
        }
        
        if (savedData && onLoad) {
          // Use setTimeout to avoid state updates during render
          setTimeout(() => {
            onLoad(savedData!);
          }, 0);
        }
        
        previousDataRef.current = savedData || formData;
      } catch (error) {
        console.error('Error loading form data:', error);
        if (onError && error instanceof Error) {
          onError(error);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - formStore and callbacks are stable or handled separately

  // Debounced save function
  const saveForm = useCallback(
    (data: T, immediate = false) => {
      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const performSave = () => {
        try {
          // Check if form has changes worth saving
          if (hasChangesRef.current && !hasChangesRef.current(data)) {
            return;
          }

          formStore.setAutoSaveStatus(formId, { isSaving: true });
          
          const saved = saveFormData(formId, data, useSession);
          
          if (saved) {
            previousDataRef.current = data;
            
            if (markDirty) {
              formStore.setDirty(formId, true);
            }
            
            formStore.setAutoSaveStatus(formId, {
              lastSaved: Date.now(),
              isSaving: false,
              hasError: false,
            });
            
            if (onSaveRef.current) {
              onSaveRef.current(data);
            }
          } else {
            throw new Error('Failed to save form data');
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          
          formStore.setAutoSaveStatus(formId, {
            isSaving: false,
            hasError: true,
            errorMessage: err.message,
          });
          
          if (onErrorRef.current) {
            onErrorRef.current(err);
          } else {
            console.error('Error saving form data:', err);
          }
        }
      };

      if (immediate) {
        performSave();
      } else {
        debounceTimerRef.current = setTimeout(performSave, debounceDelay);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formId, useSession, debounceDelay, markDirty] // formStore and callbacks accessed via refs
  );

  // Auto-save on form data changes
  useEffect(() => {
    if (!autoSave || isInitialLoadRef.current) {
      return;
    }

    // Compare with previous data to avoid unnecessary saves
    const previousData = previousDataRef.current;
    if (previousData && JSON.stringify(previousData) === JSON.stringify(formData)) {
      return;
    }

    // Debounced save
    saveForm(formData, false);
  }, [formData, autoSave, saveForm]);

  // Periodic auto-save (as backup)
  useEffect(() => {
    if (!autoSave) {
      return;
    }

    intervalTimerRef.current = setInterval(() => {
      // Only save if form is dirty and data has changed
      // Use formDataRef to get current value without causing re-renders
      const currentFormData = formDataRef.current;
      if (formStore.isFormDirty(formId)) {
        const previousData = previousDataRef.current;
        if (previousData && JSON.stringify(previousData) !== JSON.stringify(currentFormData)) {
          saveForm(currentFormData, true);
        }
      }
    }, autoSaveInterval);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, autoSaveInterval, formId]); // formData accessed via ref, saveForm and formStore are stable

  // Manual save function
  const manualSave = useCallback(() => {
    saveForm(formData, true);
  }, [formData, saveForm]);

  // Clear form data
  const clearSavedData = useCallback(() => {
    clearFormData(formId, useSession);
    formStore.clearFormData(formId);
    formStore.setDirty(formId, false);
    previousDataRef.current = null;
  }, [formId, useSession, formStore]);

  // Get auto-save status
  const autoSaveStatus = formStore.getAutoSaveStatus(formId);
  const isDirty = formStore.isFormDirty(formId);

  return {
    manualSave,
    clearSavedData,
    autoSaveStatus,
    isDirty,
    isSaving: autoSaveStatus?.isSaving || false,
    lastSaved: autoSaveStatus?.lastSaved || null,
    hasError: autoSaveStatus?.hasError || false,
    errorMessage: autoSaveStatus?.errorMessage,
  };
}


