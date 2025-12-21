/**
 * API Client Utilities for School Admin
 * 
 * Provides helper functions to make authenticated API requests
 */

import { supabase } from './supabase';

/**
 * Get authenticated fetch function with auth token
 * Use this for making API requests that require authentication
 */
export async function getAuthenticatedFetch() {
  const { data: { session } } = await supabase.auth.getSession();
  
  const token = session?.access_token || null;
  
  return async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(url, {
      ...options,
      headers,
    });
  };
}

/**
 * Make authenticated API request for school admin endpoints
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const fetchWithAuth = await getAuthenticatedFetch();
  return fetchWithAuth(url, options);
}

