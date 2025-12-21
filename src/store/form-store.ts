import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Safe storage adapter for SSR
const getSafeStorage = (storageType: 'localStorage' | 'sessionStorage') => {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      length: 0,
      clear: () => {},
      key: () => null,
    } as unknown as Storage;
  }
  return storageType === 'localStorage' ? localStorage : sessionStorage;
};

/**
 * Form State Store
 * 
 * Centralized form state management:
 * - All form states across the application
 * - Auto-save status
 * - Form dirty flags
 * - Validation states
 */

interface FormState {
  // Form data per form ID
  formData: Record<string, any>;
  
  // Dirty flags per form ID
  isDirty: Record<string, boolean>;
  
  // Validation states per form ID
  validationErrors: Record<string, Record<string, string>>;
  
  // Auto-save status per form ID
  autoSaveStatus: Record<string, {
    lastSaved: number | null;
    isSaving: boolean;
    hasError: boolean;
    errorMessage?: string;
  }>;
  
  // Registered forms (active forms)
  registeredForms: Record<string, boolean>;
  
  // Actions
  setFormData: <T>(formId: string, data: T) => void;
  getFormData: <T>(formId: string) => T | null;
  clearFormData: (formId: string) => void;
  setDirty: (formId: string, dirty: boolean) => void;
  isFormDirty: (formId: string) => boolean;
  setValidationErrors: (formId: string, errors: Record<string, string>) => void;
  getValidationErrors: (formId: string) => Record<string, string>;
  clearValidationErrors: (formId: string) => void;
  setAutoSaveStatus: (formId: string, status: Partial<FormState['autoSaveStatus'][string]>) => void;
  getAutoSaveStatus: (formId: string) => FormState['autoSaveStatus'][string] | null;
  registerForm: (formId: string) => void;
  unregisterForm: (formId: string) => void;
  clearAllForms: () => void;
  hasUnsavedForms: () => boolean;
  getUnsavedFormIds: () => string[];
}

const initialAutoSaveStatus = {
  lastSaved: null,
  isSaving: false,
  hasError: false,
};

export const useFormStore = create<FormState>()(
  persist(
    (set, get) => ({
      // Initial state
      formData: {},
      isDirty: {},
      validationErrors: {},
      autoSaveStatus: {},
      registeredForms: {},

      // Actions
      setFormData: <T>(formId: string, data: T) => {
        set((state) => ({
          formData: {
            ...state.formData,
            [formId]: data,
          },
          isDirty: {
            ...state.isDirty,
            [formId]: true,
          },
        }));
      },

      getFormData: <T>(formId: string): T | null => {
        return (get().formData[formId] as T) || null;
      },

      clearFormData: (formId: string) => {
        set((state) => {
          const newFormData = { ...state.formData };
          const newIsDirty = { ...state.isDirty };
          const newValidationErrors = { ...state.validationErrors };
          const newAutoSaveStatus = { ...state.autoSaveStatus };
          
          delete newFormData[formId];
          delete newIsDirty[formId];
          delete newValidationErrors[formId];
          delete newAutoSaveStatus[formId];
          
          return {
            formData: newFormData,
            isDirty: newIsDirty,
            validationErrors: newValidationErrors,
            autoSaveStatus: newAutoSaveStatus,
          };
        });
      },

      setDirty: (formId: string, dirty: boolean) => {
        set((state) => ({
          isDirty: {
            ...state.isDirty,
            [formId]: dirty,
          },
        }));
      },

      isFormDirty: (formId: string): boolean => {
        return get().isDirty[formId] || false;
      },

      setValidationErrors: (formId: string, errors: Record<string, string>) => {
        set((state) => ({
          validationErrors: {
            ...state.validationErrors,
            [formId]: errors,
          },
        }));
      },

      getValidationErrors: (formId: string): Record<string, string> => {
        return get().validationErrors[formId] || {};
      },

      clearValidationErrors: (formId: string) => {
        set((state) => {
          const newValidationErrors = { ...state.validationErrors };
          delete newValidationErrors[formId];
          return { validationErrors: newValidationErrors };
        });
      },

      setAutoSaveStatus: (formId: string, status: Partial<FormState['autoSaveStatus'][string]>) => {
        set((state) => {
          const currentStatus = state.autoSaveStatus[formId] || initialAutoSaveStatus;
          return {
            autoSaveStatus: {
              ...state.autoSaveStatus,
              [formId]: {
                ...currentStatus,
                ...status,
              },
            },
          };
        });
      },

      getAutoSaveStatus: (formId: string): FormState['autoSaveStatus'][string] | null => {
        return get().autoSaveStatus[formId] || null;
      },

      registerForm: (formId: string) => {
        set((state) => ({
          registeredForms: {
            ...state.registeredForms,
            [formId]: true,
          },
        }));
      },

      unregisterForm: (formId: string) => {
        set((state) => {
          const newRegisteredForms = { ...state.registeredForms };
          delete newRegisteredForms[formId];
          return { registeredForms: newRegisteredForms };
        });
      },

      clearAllForms: () => {
        set({
          formData: {},
          isDirty: {},
          validationErrors: {},
          autoSaveStatus: {},
          registeredForms: {},
        });
      },

      hasUnsavedForms: (): boolean => {
        const isDirty = get().isDirty;
        return Object.values(isDirty).some((dirty) => dirty === true);
      },

      getUnsavedFormIds: (): string[] => {
        const isDirty = get().isDirty;
        return Object.keys(isDirty).filter((formId) => isDirty[formId] === true);
      },
    }),
    {
      name: 'form-store',
      storage: createJSONStorage(() => getSafeStorage('sessionStorage')),
      partialize: (state) => ({
        formData: state.formData,
        isDirty: state.isDirty,
      }),
    }
  )
);


