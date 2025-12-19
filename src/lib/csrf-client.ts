import { supabase } from './supabase';

/**
 * Client-side CSRF Token Helper
 * 
 * This utility helps frontend code include CSRF tokens in API requests.
 * The CSRF token is automatically set in a cookie by the middleware,
 * and this helper extracts it and includes it in request headers.
 */

// Cache for CSRF token to reduce API calls
// Token is valid for 5 minutes, cache for 4 minutes to ensure freshness
let csrfTokenCache: { token: string; expiresAt: number } | null = null;
const CSRF_TOKEN_CACHE_TTL = 4 * 60 * 1000; // 4 minutes

// Request queue to prevent duplicate CSRF token fetches
let csrfTokenPromise: Promise<string | null> | null = null;
let broadcastChannel: BroadcastChannel | null = null;

// Initialize BroadcastChannel for cross-tab token sharing
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('csrf-token');
    broadcastChannel.onmessage = (event) => {
      if (event.data.type === 'csrf-token' && event.data.token) {
        csrfTokenCache = {
          token: event.data.token,
          expiresAt: Date.now() + CSRF_TOKEN_CACHE_TTL,
        };
        csrfTokenPromise = null; // Reset promise so others can use cached token
      }
    };
  } catch (e) {
    // BroadcastChannel not supported, continue without it
  }
}

/**
 * Get CSRF token from cookie
 * Note: This only works if the cookie is NOT httpOnly
 * Since our CSRF token cookie IS httpOnly, we need to get it from the server
 * 
 * @returns CSRF token or null
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null; // Server-side
  }

  // Try to read from cookie (only works if not httpOnly)
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'csrf-token') {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/**
 * Get authentication token from Supabase session
 * 
 * @returns Promise that resolves to auth token or null
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Internal function to fetch CSRF token with request batching
 * Prevents multiple simultaneous requests for the same token
 */
async function fetchCsrfTokenInternal(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (csrfTokenCache && now < csrfTokenCache.expiresAt) {
    return csrfTokenCache.token;
  }

  // If there's already a request in progress, wait for it
  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  // Create new request
  csrfTokenPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const token = data.token;

        if (token) {
          // Update cache
          csrfTokenCache = {
            token,
            expiresAt: now + CSRF_TOKEN_CACHE_TTL,
          };

          // Broadcast to other tabs
          if (broadcastChannel) {
            try {
              broadcastChannel.postMessage({
                type: 'csrf-token',
                token,
              });
            } catch (e) {
              // Ignore broadcast errors
            }
          }

          return token;
        }
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.warn('Could not fetch CSRF token:', error);
      }
      return null;
    } finally {
      // Clear promise after a short delay to allow queued requests
      setTimeout(() => {
        csrfTokenPromise = null;
      }, 100);
    }
  })();

  return csrfTokenPromise;
}

/**
 * Get CSRF token from cache or fetch if needed
 * This function batches requests to prevent duplicate fetches
 * 
 * @returns Promise that resolves to CSRF token
 */
export async function getCsrfTokenCached(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (csrfTokenCache && now < csrfTokenCache.expiresAt) {
    return csrfTokenCache.token;
  }

  // Fetch if not cached
  return fetchCsrfTokenInternal();
}

/**
 * Get CSRF token from server (legacy - use getCsrfTokenCached)
 * Makes a request to get the CSRF token (which is set in cookie)
 * 
 * @returns Promise that resolves to CSRF token
 */
export async function getCsrfToken(): Promise<string | null> {
  return getCsrfTokenCached();
}

/**
 * Add both authentication and CSRF tokens to fetch request headers
 * 
 * @param headers - Headers object to add tokens to
 * @returns Headers with tokens added
 */
export async function addTokensToHeaders(
  headers: HeadersInit = {}
): Promise<HeadersInit> {
  const headersObj = headers instanceof Headers ? headers : new Headers(headers);
  
  // Add authentication token from Supabase session
  const authToken = await getAuthToken();
  if (authToken) {
    headersObj.set('Authorization', `Bearer ${authToken}`);
  }
  
  // Add CSRF token from server - use cached token if available
  const token = await getCsrfTokenCached();
  if (token) {
    headersObj.set('x-csrf-token', token);
  }
  
  return headersObj;
}

/**
 * Add CSRF token to fetch request headers (legacy, use addTokensToHeaders instead)
 * 
 * @param headers - Headers object to add CSRF token to
 * @returns Headers with CSRF token added
 */
export async function addCsrfTokenToHeaders(
  headers: HeadersInit = {}
): Promise<HeadersInit> {
  // Delegate to addTokensToHeaders for consistency
  return addTokensToHeaders(headers);
}

/**
 * Create fetch options with both authentication and CSRF tokens
 * Helper function to add tokens to any fetch request
 * 
 * @param options - Fetch options
 * @returns Fetch options with tokens in headers
 */
export async function withCsrfToken(
  options: RequestInit = {}
): Promise<RequestInit> {
  // Check if body is FormData - browser needs to set Content-Type automatically
  const isFormData = options.body instanceof FormData;
  
  // Always create a Headers object to ensure consistent handling
  const headersObj = new Headers(options.headers);
  
  // When using FormData, we must NOT set Content-Type manually
  // The browser will automatically set it with the correct boundary
  if (isFormData) {
    headersObj.delete('Content-Type'); // Remove if present, let browser set it
  }
  
  // Always ensure Authorization header is set
  const authToken = await getAuthToken();
  if (authToken) {
    headersObj.set('Authorization', `Bearer ${authToken}`);
  } else {
    console.warn('⚠️ No auth token available for request. Authentication may fail.');
  }
  
  // Always ensure CSRF token is set
  // Use cached/batched token fetching to prevent duplicate requests
  const csrfToken = await getCsrfTokenCached();
  
  if (csrfToken) {
    headersObj.set('x-csrf-token', csrfToken);
  }
  
  return {
    ...options,
    headers: headersObj,
    credentials: 'include', // Ensure cookies are sent
  };
}

/**
 * Wrapper for fetch that automatically includes CSRF token
 * 
 * @param url - Request URL
 * @param options - Fetch options
 * @returns Promise that resolves to Response
 */
export async function fetchWithCsrf(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const optionsWithCsrf = await withCsrfToken(options);
  return fetch(url, optionsWithCsrf);
}










