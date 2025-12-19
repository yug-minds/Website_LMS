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
 * Global Application State Store
 * 
 * Manages application-wide state including:
 * - Current route/page tracking
 * - Navigation state
 * - User preferences
 * - Active forms tracking
 */

export interface AppState {
  // Current route/page tracking
  currentRoute: string | null;
  previousRoute: string | null;
  navigationHistory: string[];
  
  // Navigation state
  isNavigating: boolean;
  navigationBlocked: boolean;
  
  // User preferences
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  
  // Active forms tracking
  activeForms: Set<string>;
  
  // Actions
  setCurrentRoute: (route: string) => void;
  setPreviousRoute: (route: string) => void;
  addToHistory: (route: string) => void;
  setIsNavigating: (navigating: boolean) => void;
  setNavigationBlocked: (blocked: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  registerForm: (formId: string) => void;
  unregisterForm: (formId: string) => void;
  clearActiveForms: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentRoute: null,
      previousRoute: null,
      navigationHistory: [],
      isNavigating: false,
      navigationBlocked: false,
      sidebarCollapsed: false,
      theme: 'system',
      activeForms: new Set<string>(),

      // Actions
      setCurrentRoute: (route: string) => {
        const current = get().currentRoute;
        set((state) => ({
          previousRoute: current,
          currentRoute: route,
        }));
      },

      setPreviousRoute: (route: string) => {
        set({ previousRoute: route });
      },

      addToHistory: (route: string) => {
        set((state) => {
          const history = [...state.navigationHistory];
          // Avoid duplicates
          const index = history.indexOf(route);
          if (index > -1) {
            history.splice(index, 1);
          }
          // Add to front
          history.unshift(route);
          // Keep only last 50 entries
          return {
            navigationHistory: history.slice(0, 50),
          };
        });
      },

      setIsNavigating: (navigating: boolean) => {
        set({ isNavigating: navigating });
      },

      setNavigationBlocked: (blocked: boolean) => {
        set({ navigationBlocked: blocked });
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },

      setTheme: (theme: 'light' | 'dark' | 'system') => {
        set({ theme });
      },

      registerForm: (formId: string) => {
        set((state) => {
          const newForms = new Set(state.activeForms);
          newForms.add(formId);
          return { activeForms: newForms };
        });
      },

      unregisterForm: (formId: string) => {
        set((state) => {
          const newForms = new Set(state.activeForms);
          newForms.delete(formId);
          return { activeForms: newForms };
        });
      },

      clearActiveForms: () => {
        set({ activeForms: new Set<string>() });
      },
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => getSafeStorage('localStorage')),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);


