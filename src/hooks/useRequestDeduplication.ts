/**
 * Request Deduplication Hook
 * 
 * Prevents duplicate API calls within a short time window
 * Uses React Query's built-in deduplication as primary mechanism
 * Provides additional client-side deduplication for edge cases
 */

import { useRef, useCallback, useEffect } from 'react';

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

/**
 * Global request deduplication map
 * Tracks in-flight requests by key
 */
const pendingRequests = new Map<string, PendingRequest>();

/**
 * Cleanup old requests (older than 5 seconds)
 */
function cleanupOldRequests(): void {
  const now = Date.now();
  const maxAge = 5000; // 5 seconds

  for (const [key, request] of pendingRequests.entries()) {
    if (now - request.timestamp > maxAge) {
      pendingRequests.delete(key);
    }
  }
}

/**
 * Deduplicate request by key
 * If a request with the same key is already in flight, returns the existing promise
 * Otherwise, executes the request function and caches the promise
 * 
 * @param key - Unique key for the request
 * @param requestFn - Function that returns a promise
 * @returns Promise that resolves to the request result
 */
export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // Cleanup old requests periodically
  if (Math.random() < 0.1) { // 10% chance to cleanup
    cleanupOldRequests();
  }

  // Check if request is already in flight
  const existing = pendingRequests.get(key);
  if (existing) {
    // Request already in flight - return existing promise
    return existing.promise as Promise<T>;
  }

  // Create new request
  const promise = requestFn();
  pendingRequests.set(key, {
    promise,
    timestamp: Date.now()
  });

  // Clean up after request completes
  promise
    .finally(() => {
      pendingRequests.delete(key);
    })
    .catch(() => {
      // Ignore errors - cleanup already handled
    });

  return promise;
}

/**
 * React hook for request deduplication
 * Provides a deduplicated version of a request function
 * 
 * @param requestFn - Function that makes an API call
 * @param getKey - Function that generates a unique key for the request
 * @returns Deduplicated version of the request function
 */
export function useRequestDeduplication<TArgs extends any[], TReturn>(
  requestFn: (...args: TArgs) => Promise<TReturn>,
  getKey: (...args: TArgs) => string
): (...args: TArgs) => Promise<TReturn> {
  const requestRef = useRef(requestFn);
  
  useEffect(() => {
    requestRef.current = requestFn;
  }, [requestFn]);

  return useCallback(
    async (...args: TArgs): Promise<TReturn> => {
      const key = getKey(...args);
      return deduplicateRequest(key, () => requestRef.current(...args));
    },
    [getKey]
  );
}

/**
 * Clear all pending requests (useful for testing or cleanup)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}



