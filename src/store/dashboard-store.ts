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
 * Dashboard State Store
 * 
 * Manages dashboard-specific state including:
 * - Dashboard filters and selections
 * - Tab states
 * - Search terms
 * - Pagination states
 * - Expanded/collapsed states
 */

interface DashboardState {
  // Filter states per dashboard
  filters: Record<string, any>;
  
  // Search terms per dashboard
  searchTerms: Record<string, string>;
  
  // Tab states per dashboard
  activeTabs: Record<string, string>;
  
  // Pagination states per dashboard
  pagination: Record<string, { page: number; pageSize: number }>;
  
  // Expanded/collapsed states
  expandedItems: Record<string, Set<string>>;
  
  // Selected items per dashboard
  selectedItems: Record<string, Set<string>>;
  
  // Actions
  setFilter: (dashboardId: string, filter: any) => void;
  clearFilter: (dashboardId: string) => void;
  setSearchTerm: (dashboardId: string, term: string) => void;
  clearSearchTerm: (dashboardId: string) => void;
  setActiveTab: (dashboardId: string, tab: string) => void;
  setPagination: (dashboardId: string, page: number, pageSize?: number) => void;
  toggleExpanded: (dashboardId: string, itemId: string) => void;
  setExpanded: (dashboardId: string, itemId: string, expanded: boolean) => void;
  toggleSelected: (dashboardId: string, itemId: string) => void;
  setSelected: (dashboardId: string, itemId: string, selected: boolean) => void;
  clearSelected: (dashboardId: string) => void;
  clearDashboardState: (dashboardId: string) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      filters: {},
      searchTerms: {},
      activeTabs: {},
      pagination: {},
      expandedItems: {},
      selectedItems: {},

      // Actions
      setFilter: (dashboardId: string, filter: any) => {
        set((state: DashboardState) => ({
          filters: {
            ...state.filters,
            [dashboardId]: filter,
          },
        }));
      },

      clearFilter: (dashboardId: string) => {
        set((state: DashboardState) => {
          const newFilters = { ...state.filters };
          delete newFilters[dashboardId];
          return { filters: newFilters };
        });
      },

      setSearchTerm: (dashboardId: string, term: string) => {
        set((state: DashboardState) => ({
          searchTerms: {
            ...state.searchTerms,
            [dashboardId]: term,
          },
        }));
      },

      clearSearchTerm: (dashboardId: string) => {
        set((state: DashboardState) => {
          const newSearchTerms = { ...state.searchTerms };
          delete newSearchTerms[dashboardId];
          return { searchTerms: newSearchTerms };
        });
      },

      setActiveTab: (dashboardId: string, tab: string) => {
        set((state: DashboardState) => ({
          activeTabs: {
            ...state.activeTabs,
            [dashboardId]: tab,
          },
        }));
      },

      setPagination: (dashboardId: string, page: number, pageSize?: number) => {
        set((state: DashboardState) => ({
          pagination: {
            ...state.pagination,
            [dashboardId]: {
              page,
              pageSize: pageSize || state.pagination[dashboardId]?.pageSize || 10,
            },
          },
        }));
      },

      toggleExpanded: (dashboardId: string, itemId: string) => {
        set((state: DashboardState) => {
          const expanded = state.expandedItems[dashboardId] || new Set<string>();
          const newExpanded = new Set(expanded);
          
          if (newExpanded.has(itemId)) {
            newExpanded.delete(itemId);
          } else {
            newExpanded.add(itemId);
          }
          
          return {
            expandedItems: {
              ...state.expandedItems,
              [dashboardId]: newExpanded,
            },
          };
        });
      },

      setExpanded: (dashboardId: string, itemId: string, expanded: boolean) => {
        set((state: DashboardState) => {
          const currentExpanded = state.expandedItems[dashboardId] || new Set<string>();
          const newExpanded = new Set(currentExpanded);
          
          if (expanded) {
            newExpanded.add(itemId);
          } else {
            newExpanded.delete(itemId);
          }
          
          return {
            expandedItems: {
              ...state.expandedItems,
              [dashboardId]: newExpanded,
            },
          };
        });
      },

      toggleSelected: (dashboardId: string, itemId: string) => {
        set((state: DashboardState) => {
          const selected = state.selectedItems[dashboardId] || new Set<string>();
          const newSelected = new Set(selected);
          
          if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
          } else {
            newSelected.add(itemId);
          }
          
          return {
            selectedItems: {
              ...state.selectedItems,
              [dashboardId]: newSelected,
            },
          };
        });
      },

      setSelected: (dashboardId: string, itemId: string, selected: boolean) => {
        set((state: DashboardState) => {
          const currentSelected = state.selectedItems[dashboardId] || new Set<string>();
          const newSelected = new Set(currentSelected);
          
          if (selected) {
            newSelected.add(itemId);
          } else {
            newSelected.delete(itemId);
          }
          
          return {
            selectedItems: {
              ...state.selectedItems,
              [dashboardId]: newSelected,
            },
          };
        });
      },

      clearSelected: (dashboardId: string) => {
        set((state: DashboardState) => ({
          selectedItems: {
            ...state.selectedItems,
            [dashboardId]: new Set<string>(),
          },
        }));
      },

      clearDashboardState: (dashboardId: string) => {
        set((state: DashboardState) => {
          const newFilters = { ...state.filters };
          const newSearchTerms = { ...state.searchTerms };
          const newActiveTabs = { ...state.activeTabs };
          const newPagination = { ...state.pagination };
          const newExpandedItems = { ...state.expandedItems };
          const newSelectedItems = { ...state.selectedItems };
          
          delete newFilters[dashboardId];
          delete newSearchTerms[dashboardId];
          delete newActiveTabs[dashboardId];
          delete newPagination[dashboardId];
          delete newExpandedItems[dashboardId];
          delete newSelectedItems[dashboardId];
          
          return {
            filters: newFilters,
            searchTerms: newSearchTerms,
            activeTabs: newActiveTabs,
            pagination: newPagination,
            expandedItems: newExpandedItems,
            selectedItems: newSelectedItems,
          };
        });
      },
    }),
    {
      name: 'dashboard-store',
      storage: createJSONStorage(() => getSafeStorage('sessionStorage')),
      partialize: (state) => {
        // Convert Sets to Arrays for serialization
        const partialized: any = {
          currentTab: state.currentTab,
          filters: state.filters,
          searchTerm: state.searchTerm,
          pagination: state.pagination,
          version: state.version,
        };
        
        // Convert Sets to Arrays
        if (state.expandedItems) {
          partialized.expandedItems = Object.keys(state.expandedItems).reduce((acc: any, key: string) => {
            acc[key] = Array.from(state.expandedItems[key]);
            return acc;
          }, {});
        }
        
        if (state.selectedItems) {
          partialized.selectedItems = Object.keys(state.selectedItems).reduce((acc: any, key: string) => {
            acc[key] = Array.from(state.selectedItems[key]);
            return acc;
          }, {});
        }
        
        return partialized;
      },
      merge: (persistedState: any, currentState: any) => {
        // Convert Arrays back to Sets
        const merged = { ...currentState, ...persistedState };
        
        if (persistedState?.expandedItems) {
          merged.expandedItems = Object.keys(persistedState.expandedItems).reduce((acc: any, key: string) => {
            acc[key] = new Set(persistedState.expandedItems[key]);
            return acc;
          }, {});
        }
        
        if (persistedState?.selectedItems) {
          merged.selectedItems = Object.keys(persistedState.selectedItems).reduce((acc: any, key: string) => {
            acc[key] = new Set(persistedState.selectedItems[key]);
            return acc;
          }, {});
        }
        
        return merged;
      },
    }
  )
);


