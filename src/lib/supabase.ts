import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getRequiredEnv } from './env'

// Type for Supabase client - using Record<string, unknown> as database schema type
type SupabaseClientType = SupabaseClient<Record<string, unknown>>

// Build phase: Next.js sets NEXT_PHASE during 'next build'. Use placeholders so the app can compile.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

// Get environment variables - Next.js automatically exposes NEXT_PUBLIC_* vars to client
// Access them directly via process.env which Next.js replaces at build time
const supabaseUrlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKeyRaw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// During build, use placeholders so createClient and imports don't throw
const urlForNormalize = isBuildPhase ? 'https://placeholder.supabase.co' : supabaseUrlRaw;
const keyForNormalize = isBuildPhase ? 'placeholder-anon-key' : supabaseAnonKeyRaw;

// Ensure URL is properly formatted
let supabaseUrl = urlForNormalize.trim();
// Remove trailing slash if present
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/\/$/, '');
  // Ensure it has http:// or https://
  // For Supabase, always use https:// for security
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    supabaseUrl = `https://${supabaseUrl}`;
  }
  // Force https:// for Supabase URLs (security best practice)
  if (supabaseUrl.includes('.supabase.co') && supabaseUrl.startsWith('http://')) {
    supabaseUrl = supabaseUrl.replace('http://', 'https://');
  }
}

// Validate required environment variables (skip during build so CI/build can complete)
if (!isBuildPhase && (!supabaseUrlRaw || !supabaseAnonKeyRaw)) {
  const missing = [];
  if (!supabaseUrlRaw) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKeyRaw) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  // Only throw in production at runtime, log warning in development
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  } else {
    console.error('⚠️ Missing environment variables:', missing.join(', '));
    console.error('Please check your .env.local file');
  }
}

// Use the validated values (placeholders during build)
const supabaseAnonKey = keyForNormalize;

// Log the URL in development to help debug
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🔧 Supabase URL:', supabaseUrl);
  console.log('🔧 Supabase Anon Key:', supabaseAnonKey ? 'SET' : 'NOT SET');
}

export const supabase = createClient<Record<string, unknown>, 'public'>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-client-info': 'supabase-js-nextjs'
    },
    // Using hosted Supabase - no need for localhost URL interception
    // Connection pooling is handled by Supabase automatically
    fetch: async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      const isAuthRequest = urlStr.includes('/auth/v1/');
      
      // During static generation, use default fetch with cache settings
      const isStaticGeneration = process.env.NODE_ENV === 'production' && 
                               process.env.NEXT_PHASE === 'phase-production-build';
      
      if (isStaticGeneration && !isAuthRequest) {
        // Use default fetch with cache for static generation (non-auth requests)
        return fetch(url, {
          ...options,
          cache: 'force-cache', // Cache during build
          next: { revalidate: 300 } // 5 minutes revalidation
        });
      }
      
      // Helper function to perform fetch with timeout and retry
      const fetchWithRetry = async (maxRetries: number = 2, timeoutMs: number = 45000): Promise<Response> => {
        let lastError: unknown = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          
          try {
            console.log(`🔄 Supabase fetch attempt ${attempt}/${maxRetries}: ${urlStr.substring(0, 80)}...`);
            
            const response = await fetch(url, {
              ...options,
              signal: controller.signal,
              credentials: isAuthRequest ? 'omit' : undefined,
            });
            
            clearTimeout(timeoutId);
            console.log(`✅ Supabase fetch succeeded on attempt ${attempt}`);
            return response;
          } catch (error: unknown) {
            clearTimeout(timeoutId);
            lastError = error;
            
            const errorObj = error as Error & { name?: string };
            const isTimeout = errorObj.name === 'AbortError' || errorObj.name === 'TimeoutError';
            const isNetworkError = error instanceof TypeError && errorObj.message?.includes('Failed to fetch');
            
            console.warn(`⚠️ Supabase fetch attempt ${attempt}/${maxRetries} failed:`, errorObj.message || String(error));
            
            // Only retry on timeout or network errors
            if ((isTimeout || isNetworkError) && attempt < maxRetries) {
              // Wait before retrying (exponential backoff)
              const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
            
            // No more retries, throw the error
            break;
          }
        }
        
        // All retries exhausted
        const lastErrorObj = lastError as Error & { name?: string };
        if (lastErrorObj?.name === 'AbortError' || lastErrorObj?.name === 'TimeoutError') {
          interface TimeoutError extends Error {
            isTimeout: boolean;
          }
          
          const timeoutError = new Error('Request timeout: The authentication server took too long to respond. Please try again.') as TimeoutError;
          timeoutError.isTimeout = true;
          throw timeoutError;
        }
        if (lastError instanceof TypeError && lastError.message.includes('Failed to fetch')) {
          interface NetworkError extends Error {
            isNetworkError: boolean;
          }
          
          const networkError = new Error('Network error: Unable to connect to the authentication server. Please check your internet connection.') as NetworkError;
          networkError.isNetworkError = true;
          throw networkError;
        }
        throw lastError;
      };
      
      // For auth requests, use retry logic with longer timeout
      if (isAuthRequest) {
        return fetchWithRetry(3, 45000); // 3 retries, 45 second timeout each
      }
      
      // For other requests, preserve all existing headers (including apikey that Supabase adds automatically)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for non-auth requests
      
      const existingHeaders = options?.headers;
      let mergedHeaders: HeadersInit;
      
      if (existingHeaders instanceof Headers) {
        // If it's a Headers object, create a new one and copy all entries
        mergedHeaders = new Headers(existingHeaders);
        mergedHeaders.set('Connection', 'keep-alive');
      } else if (existingHeaders) {
        // If it's an object, merge it
        mergedHeaders = {
          ...existingHeaders,
          'Connection': 'keep-alive',
        };
      } else {
        // No existing headers, just add Connection
        mergedHeaders = {
          'Connection': 'keep-alive',
        };
      }
      
      try {
        return await fetch(url, {
          ...options,
          signal: controller.signal,
          // OPTIMIZATION: Keep connections alive for better reuse
          // This reduces connection overhead for repeated requests
          keepalive: true,
          headers: mergedHeaders
        });
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        // Enhanced error handling for network issues
        const errorObj = error as Error & { name?: string };
        if (errorObj.name === 'AbortError') {
          throw new Error('Request timeout: The server took too long to respond.');
        }
        if (error instanceof TypeError && errorObj.message?.includes('Failed to fetch')) {
          console.error('❌ Network error connecting to Supabase:', url);
          console.error('This could indicate:');
          console.error('  1. Supabase instance is down or unreachable');
          console.error('  2. Network connectivity issues');
          console.error('  3. CORS configuration problems');
          console.error('  4. Firewall or proxy blocking the connection');
        }
        throw error;
      }
    }
  }
})

/**
 * Admin client for server-side operations ONLY
 * 
 * SECURITY WARNING: This client uses the service role key which bypasses RLS.
 * NEVER import or use this client in client-side components (files with "use client").
 * 
 * This client should ONLY be used in:
 * - API routes (src/app/api directory)
 * - Server components (without "use client" directive)
 * - Server actions
 * 
 * For client-side operations, use the regular supabase client above.
 */
function createSupabaseAdmin() {
  // Only create on server side
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin can only be used on the server side. Use the regular supabase client for client-side operations.');
  }

  try {
    // During build, use placeholder so module can load; real key required at runtime
    const supabaseServiceKey = isBuildPhase
      ? 'placeholder-service-role-key'
      : getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');

    // Always log connection details (helps with debugging)
    console.log('🔧 [supabaseAdmin] Initializing admin client...')
    console.log('🔧 [supabaseAdmin] Supabase URL:', supabaseUrl)
    
    // Extract and verify project ID
    let projectId = 'unknown'
    try {
      const urlObj = new URL(supabaseUrl)
      projectId = urlObj.hostname.split('.')[0]
      console.log('🔧 [supabaseAdmin] Project ID from URL:', projectId)
      console.log('🔧 [supabaseAdmin] Expected project ID: xyaxjscxqcyqesmmlybh')
      
      if (projectId !== 'xyaxjscxqcyqesmmlybh') {
        console.warn('⚠️ [supabaseAdmin] WARNING: Project ID mismatch! You may be connected to the wrong project.')
      } else {
        console.log('✅ [supabaseAdmin] Project ID matches!')
      }
    } catch (e) {
      console.warn('⚠️ [supabaseAdmin] Could not parse Supabase URL')
    }
    
    console.log('🔧 [supabaseAdmin] Service Key present:', !!supabaseServiceKey)
    console.log('🔧 [supabaseAdmin] Service Key length:', supabaseServiceKey?.length || 0)
    if (supabaseServiceKey && supabaseServiceKey.length < 100) {
      console.warn('⚠️ [supabaseAdmin] WARNING: Service key seems too short. Expected ~200+ characters.')
    } else if (supabaseServiceKey && supabaseServiceKey.length >= 100) {
      console.log('✅ [supabaseAdmin] Service key length looks correct')
    }

    const client = createClient<Record<string, unknown>, 'public'>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      },
      global: {
        // Connection pooling optimized for server-side
        fetch: (url, options) => {
          // During static generation, use default fetch with cache settings
          const isStaticGeneration = process.env.NODE_ENV === 'production' && 
                                   process.env.NEXT_PHASE === 'phase-production-build';
          
          if (isStaticGeneration) {
            // Use default fetch with cache for static generation
            return fetch(url, {
              ...options,
              cache: 'force-cache', // Cache during build
              next: { revalidate: 300 } // 5 minutes revalidation
            });
          }
          
          // Preserve all existing headers (including apikey that Supabase adds automatically)
          const existingHeaders = options?.headers;
          let mergedHeaders: HeadersInit;
          
          if (existingHeaders instanceof Headers) {
            // If it's a Headers object, create a new one and copy all entries
            mergedHeaders = new Headers(existingHeaders);
            mergedHeaders.set('Connection', 'keep-alive');
          } else if (existingHeaders) {
            // If it's an object, merge it
            mergedHeaders = {
              ...existingHeaders,
              'Connection': 'keep-alive',
            };
          } else {
            // No existing headers, just add Connection
            mergedHeaders = {
              'Connection': 'keep-alive',
            };
          }
          
      return fetch(url, {
        ...options,
        cache: 'no-store',
        // OPTIMIZATION: Keep connections alive for better reuse
        // This reduces connection overhead for repeated requests
        keepalive: true,
        headers: mergedHeaders
      }).then(async (response) => {
        return response;
      }).catch((error) => {
        // Enhanced error handling for network issues
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          console.error('❌ Network error connecting to Supabase (admin client):', url);
          console.error('This could indicate:');
          console.error('  1. Supabase instance is down or unreachable');
          console.error('  2. Network connectivity issues');
          console.error('  3. CORS configuration problems');
          console.error('  4. Firewall or proxy blocking the connection');
        }
        throw error;
      });
        }
      }
    });
    
    return client
  } catch (error) {
    throw new Error(`Failed to initialize supabaseAdmin: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Lazy initialization - only create when accessed (and only on server)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

/**
 * Force recreation of supabaseAdmin client
 * Use this if environment variables have changed
 */
export function resetSupabaseAdmin() {
  _supabaseAdmin = null;
  console.log('🔄 [supabaseAdmin] Client cache cleared - will recreate on next access')
}

interface _SupabaseAdminProxy {
  [key: string]: unknown;
}

export const supabaseAdmin = new Proxy({} as SupabaseClientType, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      // @ts-expect-error - Type system limitation with Supabase client proxy types
      _supabaseAdmin = createSupabaseAdmin();
    }

    const value = (_supabaseAdmin as SupabaseClientType)[prop as keyof SupabaseClientType];
    if (typeof value === 'function') {
      return value.bind(_supabaseAdmin);
    }
    return value;
  }
}) as ReturnType<typeof createClient>;

/**
 * Create an authenticated Supabase client for server-side use with RLS
 * This client respects Row Level Security policies based on the user's access token
 * 
 * @param accessToken - The user's access token from Authorization header
 * @returns A Supabase client instance that will use RLS based on the token
 */
export async function createAuthenticatedClient(accessToken: string) {
  // Create client with access token

  const client = createClient<Record<string, unknown>, 'public'>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-client-info': 'supabase-js-nextjs-server'
      },
      // Preserve headers including apikey that Supabase adds automatically
      fetch: (url, options) => {
        const existingHeaders = options?.headers;
        let mergedHeaders: HeadersInit;
        
        if (existingHeaders instanceof Headers) {
          // If it's a Headers object, create a new one and copy all entries
          mergedHeaders = new Headers(existingHeaders);
        } else if (existingHeaders) {
          // If it's an object, merge it
          mergedHeaders = {
            ...existingHeaders,
          };
        } else {
          // No existing headers
          mergedHeaders = {};
        }
        
        return fetch(url, {
          ...options,
          headers: mergedHeaders
        });
      }
    }
  });

  // Set the session with the access token for RLS to work
  // We create a minimal session object with just the access token
  await client.auth.setSession({
    access_token: accessToken,
    refresh_token: '', // Not needed for server-side RLS checks
    expires_in: 3600, // Default expiry
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    token_type: 'bearer',

    user: null, // Will be populated by Supabase
  } as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    user: null;
  });

  return client;
}
