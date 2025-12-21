"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ErrorBoundary } from "./error-boundary";
import { frontendLogger } from "../lib/frontend-logger";
import { ToastProvider } from "../components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  frontendLogger.debug('Providers component rendering', {
    component: 'Providers',
  });
  
  try {
    // Create a QueryClient instance for React Query with optimized settings
    // Configured for navigation persistence and minimal refetches
    const [queryClient] = useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: {
              staleTime: 10 * 60 * 1000, // 10 minutes - increased for dashboard data persistence
              gcTime: 15 * 60 * 1000, // 15 minutes (formerly cacheTime) - keep cache longer
              refetchOnWindowFocus: false, // Disabled to prevent refreshes on tab switch
              refetchOnMount: false, // Disabled to preserve cache during navigation
              refetchOnReconnect: true, // Refetch on reconnect (network restored)
              retry: 1, // Retry once on failure
              retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
              // Enable structural sharing to prevent unnecessary re-renders
              structuralSharing: true,
            },
            mutations: {
              retry: 0, // Don't retry mutations
            },
          },
        })
    );

    frontendLogger.debug('QueryClient created successfully', {
      component: 'Providers',
    });

    // Session backup initialization is handled by session-storage-manager
    // Stores will hydrate automatically on client-side

    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            {children || (
              <div style={{ padding: '20px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
                <p>No content to display</p>
              </div>
            )}
          </ToastProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    );
   
  } catch (error: any) {
    frontendLogger.error('Error in Providers component', {
      component: 'Providers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    // Fallback if ErrorBoundary fails
    return (
      <div style={{ padding: '20px', backgroundColor: '#fee', minHeight: '100vh' }}>
        <h1>Error Loading App</h1>
        <p>{error?.message || 'Unknown error'}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

