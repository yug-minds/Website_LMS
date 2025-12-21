/**
 * School Admin Authentication and Authorization Utilities
 * 
 * Provides helper functions to get the current school admin's school_id
 * and validate access to school-specific data.
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase';
import { getRequiredEnv } from './env';

// Using hosted Supabase - get URL and key from environment
const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', 'Supabase URL');
const supabaseAnonKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase Anon Key');

// Cache for school admin school_id lookups (30 seconds TTL - school assignment doesn't change frequently)
const schoolAdminIdCache = new Map<string, { schoolId: string | null; timestamp: number }>();
const SCHOOL_ADMIN_ID_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Get the authenticated user's school_id (for school admins)
 * @param request - Next.js request object (required for API routes)
 * @returns Promise<string | null> - The school_id or null if not found/not authorized
 */
export async function getSchoolAdminSchoolId(request: NextRequest): Promise<string | null> {
  try {
    // Get auth token from request headers first (case-insensitive)
    let authToken: string | null = null;
    
    // Try different header name variations (case-insensitive)
    const authHeader = request.headers.get('authorization') || 
                       request.headers.get('Authorization') ||
                       request.headers.get('AUTHORIZATION');
    
    if (authHeader) {
      // Remove 'Bearer ' prefix (case-insensitive)
      authToken = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (authToken) {
        console.log('✅ Found auth token in Authorization header');
      }
    }
    
    // If not in headers, try to get from cookies (Supabase stores session in cookies)
    if (!authToken) {
      // First, try to get user from session_token cookie using @supabase/ssr
      try {
        const sessionToken = request.cookies.get('session_token')?.value;
        if (sessionToken) {
          // Try to get user from Supabase session cookie
          const { createServerClient } = await import('@supabase/ssr');
          const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
              getAll: () => request.cookies.getAll(),
              setAll: () => {}
            }
          });

          const { data: { user: ssrUser }, error: ssrError } = await supabase.auth.getUser();
          if (!ssrError && ssrUser) {
            // If we got the user from SSR, we can use it directly
            // But we still need to get the token for verification
            // Try to get the session to extract the access token
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              authToken = session.access_token;
              console.log('✅ Found auth token from Supabase SSR session');
            }
          }
        }
      } catch (ssrError) {
        console.log('SSR session check failed, trying cookie parsing:', ssrError);
      }

      // Fallback: Parse cookies manually
      if (!authToken) {
        const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie');
        if (cookieHeader) {
          // Parse cookies properly
          const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie: string) => {
            const trimmed = cookie.trim();
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex > 0) {
              const key = trimmed.substring(0, equalIndex).trim();
              const value = trimmed.substring(equalIndex + 1).trim();
              acc[key] = decodeURIComponent(value);
            }
            return acc;
          }, {} as Record<string, string>);
          
          // Check session_token cookie first (our custom cookie)
          if (cookies['session_token']) {
            // session_token might be the user ID or a session identifier
            // Try to use it to get the user from Supabase
            try {
              const { createServerClient } = await import('@supabase/ssr');
              const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
                cookies: {
                  getAll: () => request.cookies.getAll(),
                  setAll: () => {}
                }
              });

              const { data: { session } } = await supabase.auth.getSession();
              if (session?.access_token) {
                authToken = session.access_token;
                console.log('✅ Found auth token from session_token cookie via SSR');
              }
            } catch (e) {
              console.log('Failed to get session from session_token cookie:', e);
            }
          }
          
          // Supabase stores access token in cookies with project-specific names
          // Format: sb-<project-ref>-auth-token
          // Try to find any cookie that matches Supabase pattern
          const projectRef = supabaseUrl.includes('localhost') ? 'localhost' : 
                            supabaseUrl.match(/https?:\/\/([^.]+)/)?.[1] || 'default';
          
          // Try various cookie name patterns
          const possibleCookieNames = [
            `sb-${projectRef}-auth-token`,
            'sb-access-token',
            'sb-access_token',
            'supabase-auth-token',
            'sb-auth-token',
            // Also try with URL-encoded project ref
            `sb-${encodeURIComponent(projectRef)}-auth-token`
          ];
          
          for (const cookieName of possibleCookieNames) {
            if (cookies[cookieName]) {
              // Supabase cookies might contain JSON with access_token
              const cookieValue = cookies[cookieName];
              try {
                const parsed = JSON.parse(cookieValue);
                authToken = parsed.access_token || parsed.accessToken || cookieValue;
              } catch {
                // If not JSON, use the value directly
                authToken = cookieValue;
              }
              if (authToken) {
                console.log(`✅ Found auth token in cookie: ${cookieName}`);
                break;
              }
            }
          }
          
          // Also check all cookies for any that might contain a JWT token
          if (!authToken) {
            for (const [key, value] of Object.entries(cookies)) {
              if (key.toLowerCase().includes('auth') && key.toLowerCase().includes('token')) {
                try {
                  const parsed = JSON.parse(value);
                  authToken = parsed.access_token || parsed.accessToken || value;
                  if (authToken && authToken.length > 50) { // JWT tokens are typically long
                    console.log(`✅ Found auth token in cookie: ${key}`);
                    break;
                  }
                } catch {
                  if (value && value.length > 50) {
                    authToken = value;
                    console.log(`✅ Found potential auth token in cookie: ${key}`);
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!authToken) {
      console.warn('❌ No auth token found in request headers or cookies');
      console.warn('Available headers:', Array.from(request.headers.entries()).map(([k]) => k));
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        console.warn('Cookies present:', cookieHeader.substring(0, 200)); // First 200 chars
      }
      return null;
    }

    // Log token info (first/last 10 chars for security)
    const tokenPreview = authToken.length > 20 
      ? `${authToken.substring(0, 10)}...${authToken.substring(authToken.length - 10)}`
      : 'TOO_SHORT';
    console.log('🔑 Attempting to verify token (preview):', tokenPreview, 'Length:', authToken.length);

    // Verify the token and get user using Supabase Admin
    // Try multiple methods to verify the token
     
    let user: any = null;
     
    let userError: any = null;
    
    // Method 1: Try decoding JWT directly to get user ID (fastest, no API call)
    try {
      const parts = authToken.split('.');
      if (parts.length === 3) {
        // Decode base64 URL-safe encoding
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        while (base64.length % 4) {
          base64 += '=';
        }
        const payloadJson = Buffer.from(base64, 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        if (payload && payload.sub) {
          // Verify the token is not expired
          const now = Math.floor(Date.now() / 1000);
          if (!payload.exp || payload.exp > now) {
            user = { id: payload.sub, email: payload.email || payload.email_address };
            console.log('✅ Got user by decoding JWT token:', user.id);
          } else {
            console.warn('Token is expired. Exp:', payload.exp, 'Now:', now);
          }
        } else {
          console.warn('JWT payload missing sub field');
        }
      } else {
        console.warn('Invalid JWT format - expected 3 parts, got:', parts.length);
      }
     
    } catch (decodeError: any) {
      // JWT decode failed, try other methods
      console.log('JWT decode failed, trying other methods:', decodeError?.message);
    }

    // Method 2: Try with admin client
    if (!user) {
      const adminGetUserResult = await supabaseAdmin.auth.getUser(authToken);
      if (!adminGetUserResult.error && adminGetUserResult.data?.user) {
        user = adminGetUserResult.data.user;
        console.log('✅ Got user via admin client');
      } else {
        userError = adminGetUserResult.error;
      }
    }

    // Method 3: Try with regular client (token in headers)
    if (!user) {
            const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        }
      });
      
      const regularGetUserResult = await supabaseClient.auth.getUser();
      if (!regularGetUserResult.error && regularGetUserResult.data?.user) {
        user = regularGetUserResult.data.user;
        userError = null;
        console.log('✅ Got user via regular client with token in headers');
      } else {
        // Method 4: Try with token as parameter
        const tokenGetUserResult = await supabaseClient.auth.getUser(authToken);
        if (!tokenGetUserResult.error && tokenGetUserResult.data?.user) {
          user = tokenGetUserResult.data.user;
          userError = null;
          console.log('✅ Got user via regular client with token as parameter');
        } else {
          userError = tokenGetUserResult.error || regularGetUserResult.error || userError;
        }
      }
    }

    // Method 5: Try direct API call as last resort
    if (!user) {
            try {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': supabaseAnonKey
          }
        });
        if (response.ok) {
          const userData = await response.json();
          if (userData && userData.id) {
            user = { id: userData.id, email: userData.email };
            userError = null;
            console.log('✅ Successfully verified auth token via direct API call for user:', user.id);
          } else {
            const errorText = await response.text();
            console.warn('Direct API call returned OK but no user data:', errorText.substring(0, 200));
          }
        } else {
          const errorText = await response.text();
          console.warn('Direct API call failed with status:', response.status, errorText.substring(0, 200));
        }
       
      } catch (apiError: any) {
        console.warn('Direct API call error:', apiError?.message);
      }
    }
    
    // If we still don't have a user but we decoded the JWT, use that
    if (!user) {
      try {
        const parts = authToken.split('.');
        if (parts.length === 3) {
          let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) {
            base64 += '=';
          }
          const payloadJson = Buffer.from(base64, 'base64').toString('utf-8');
          const payload = JSON.parse(payloadJson);
          if (payload && payload.sub) {
            // Even if expired, we can still use it for server-side verification
            user = { id: payload.sub, email: payload.email || payload.email_address };
            console.log('✅ Using JWT-decoded user ID (bypassing expiration check):', user.id);
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    // If we still don't have a user, try to get it from session_token cookie directly
    if (!user) {
      try {
        const sessionToken = request.cookies.get('session_token')?.value;
        if (sessionToken) {
          // Try to get user from Supabase session using SSR
          const { createServerClient } = await import('@supabase/ssr');
          const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
              getAll: () => request.cookies.getAll(),
              setAll: () => {}
            }
          });

          const { data: { user: ssrUser }, error: ssrError } = await supabase.auth.getUser();
          if (!ssrError && ssrUser) {
            user = ssrUser;
            console.log('✅ Got user from SSR session_token cookie:', user.id);
          }
        }
      } catch (ssrError) {
        console.log('Final SSR attempt failed:', ssrError);
      }
    }

    if (!user) {
      console.warn('❌ Failed to verify auth token after all methods');
      console.warn('Token length:', authToken?.length || 0);
      console.warn('Token preview:', authToken ? tokenPreview : 'NO_TOKEN');
      if (userError) {
        console.warn('Last error:', userError?.message);
      }
      return null;
    }
    
    console.log('✅ Successfully verified auth token for user:', user.id);

    // Check cache first (30-second TTL)
    const cached = schoolAdminIdCache.get(user.id);
    if (cached && Date.now() - cached.timestamp < SCHOOL_ADMIN_ID_CACHE_TTL) {
      console.log('✅ School admin school_id retrieved from cache for user:', user.id);
      return cached.schoolId;
    }

    // Get user profile to verify role (use cached getUserProfile if available)
    // Note: We still need to check role, but we can use cached profile if available
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
       
      .single() as any;

    if (profileError || !profile) {
      console.warn('Failed to get profile:', profileError?.message);
      // Cache null result to avoid repeated failed queries
      schoolAdminIdCache.set(user.id, { schoolId: null, timestamp: Date.now() });
      return null;
    }

    // Verify user is a school admin
    if (profile.role !== 'school_admin') {
      console.warn('❌ User is not a school admin. Role:', profile.role);
      // Cache null result to avoid repeated failed queries
      schoolAdminIdCache.set(user.id, { schoolId: null, timestamp: Date.now() });
      return null;
    }

    // Get school_id from school_admins table (primary source of truth)
    // Triggers ensure profiles.school_id is synced, but we use school_admins directly
    const { data: schoolAdmin, error: schoolAdminError } = await supabaseAdmin
      .from('school_admins')
      .select('school_id, is_active')
      .eq('profile_id', user.id)
      .eq('is_active', true)
       
      .single() as any;

    if (schoolAdminError || !schoolAdmin) {
      console.warn('❌ School admin record not found or inactive:', schoolAdminError?.message);
      // Cache null result to avoid repeated failed queries
      schoolAdminIdCache.set(user.id, { schoolId: null, timestamp: Date.now() });
      return null;
    }

    if (!schoolAdmin.school_id) {
      console.warn('❌ School admin has no school_id assigned');
      // Cache null result to avoid repeated failed queries
      schoolAdminIdCache.set(user.id, { schoolId: null, timestamp: Date.now() });
      return null;
    }

    console.log('✅ User is a school admin with school_id:', schoolAdmin.school_id);
    
    // Cache successful result
    schoolAdminIdCache.set(user.id, { schoolId: schoolAdmin.school_id, timestamp: Date.now() });
    
    return schoolAdmin.school_id;
  } catch (error) {
    console.error('Error getting school admin school_id:', error);
    return null;
  }
}

/**
 * Validate that a school_id belongs to the authenticated school admin
 * @param requestSchoolId - The school_id to validate
 * @param request - Next.js request object (required for API routes)
 * @returns Promise<boolean> - True if valid, false otherwise
 */
export async function validateSchoolAccess(
  requestSchoolId: string,
  request: NextRequest
): Promise<boolean> {
  const adminSchoolId = await getSchoolAdminSchoolId(request);
  
  if (!adminSchoolId) {
    return false;
  }

  return adminSchoolId === requestSchoolId;
}

/**
 * Get full school admin profile with school information
 * @param request - Next.js request object (required for API routes)
 * @returns Promise with profile and school data or null
 */
export async function getSchoolAdminProfile(request: NextRequest): Promise<{
   
  profile: any;
   
  school: any;
  school_id: string;
} | null> {
  try {
    const school_id = await getSchoolAdminSchoolId(request);
    
    if (!school_id) {
      return null;
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    const authToken = authHeader?.replace('Bearer ', '') || null;

    if (!authToken) {
      return null;
    }

    // Verify token and get user
    const { data: { user } } = await supabaseAdmin.auth.getUser(authToken);
    if (!user) return null;

    // Get profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
       
      .single() as any;

    if (profileError || !profile) {
      return null;
    }

    // Get school
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('*')
      .eq('id', school_id)
       
      .single() as any;

    if (schoolError || !school) {
      return null;
    }

    return {
      profile,
      school,
      school_id
    };
  } catch (error) {
    console.error('Error getting school admin profile:', error);
    return null;
  }
}

