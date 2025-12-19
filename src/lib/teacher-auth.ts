/**
 * Teacher Authentication and Authorization Utilities
 * 
 * Provides helper functions to get the current teacher's assigned schools
 * and validate access to school-specific data.
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { getUserProfile } from './auth-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cache for teacher user IDs (30 seconds TTL - reduces auth overhead)
const teacherIdCache = new Map<string, { userId: string | null; timestamp: number }>();
const TEACHER_ID_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Get the authenticated teacher's user ID (cached)
 * Caches results for 30 seconds to reduce auth verification overhead
 * @param request - Next.js request object (required for API routes)
 * @returns Promise<string | null> - The teacher's user ID or null if not found/not authorized
 */
export async function getTeacherUserId(request: NextRequest): Promise<string | null> {
  try {
    // Get auth token from request headers first
    let authToken: string | null = null;
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      authToken = authHeader.replace('Bearer ', '');
      if (authToken) {
        console.log('✅ Found auth token in Authorization header');
      }
    }
    
    // If not in headers, try to get from cookies using @supabase/ssr (Supabase stores session in cookies)
    if (!authToken) {
      // First, try to get user from session using @supabase/ssr
      try {
        const { createServerClient } = await import('@supabase/ssr');
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: () => {}
          }
        });

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!sessionError && session?.access_token) {
          authToken = session.access_token;
          console.log('✅ Found auth token from Supabase SSR session');
        }
      } catch (ssrError) {
        console.log('SSR session check failed, trying cookie parsing:', ssrError);
      }

      // Fallback: Parse cookies manually if SSR didn't work
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
          
          // Try various Supabase cookie name patterns
          const possibleCookieNames = [
            `sb-${projectRef}-auth-token`,
            `sb-${projectRef}-access-token`,
            'sb-access-token',
            'sb-access_token',
            'supabase-auth-token',
            'session_token'
          ];
          
          for (const cookieName of possibleCookieNames) {
            if (cookies[cookieName]) {
              // If it's a JSON cookie, try to parse it
              try {
                const parsed = JSON.parse(cookies[cookieName]);
                if (parsed.access_token) {
                  authToken = parsed.access_token;
                  console.log(`✅ Found auth token in ${cookieName} cookie (parsed JSON)`);
                  break;
                }
              } catch {
                // Not JSON, might be the token directly
                if (cookies[cookieName].length > 50) {
                  authToken = cookies[cookieName];
                  console.log(`✅ Found auth token in ${cookieName} cookie (direct)`);
                  break;
                }
              }
            }
          }
        }
      }
    }

    if (!authToken) {
      console.warn('No auth token found in request headers or cookies', {
        method: request.method,
        url: request.url,
        hasAuthHeader: !!request.headers.get('authorization'),
        hasCookies: !!request.headers.get('cookie')
      });
      return null;
    }

    // Check cache first (use token hash as key for privacy)
    const tokenHash = authToken.length > 20 
      ? `${authToken.substring(0, 10)}${authToken.substring(authToken.length - 10)}`
      : authToken;
    const cacheKey = `teacher:${tokenHash}`;
    const cached = teacherIdCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TEACHER_ID_CACHE_TTL) {
      return cached.userId;
    }

    // Verify the token and get user using Supabase Admin
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authToken);

    if (userError || !user) {
      console.warn('Failed to verify auth token:', userError?.message);
      // Cache null result to avoid repeated failed queries
      teacherIdCache.set(cacheKey, { userId: null, timestamp: Date.now() });
      return null;
    }

    // Use cached getUserProfile instead of direct query (already cached in auth-utils)
    const profile = await getUserProfile(user.id);

    if (!profile) {
      console.warn('Failed to get profile for user:', user.id);
      // Cache null result
      teacherIdCache.set(cacheKey, { userId: null, timestamp: Date.now() });
      return null;
    }

    // Verify user is a teacher
    if (profile.role !== 'teacher') {
      console.warn('User is not a teacher:', profile.role);
      // Cache null result
      teacherIdCache.set(cacheKey, { userId: null, timestamp: Date.now() });
      return null;
    }

    // Cache successful result
    teacherIdCache.set(cacheKey, { userId: user.id, timestamp: Date.now() });
    return user.id;
  } catch (error) {
    console.error('Error getting teacher user ID:', error);
    return null;
  }
}

/**
 * Get the authenticated teacher's assigned school IDs
 * @param request - Next.js request object (required for API routes)
 * @returns Promise<string[]> - Array of school IDs the teacher is assigned to
 */
export async function getTeacherAssignedSchools(request: NextRequest): Promise<string[]> {
  try {
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return [];
    }

    // Get teacher's assigned schools from teacher_schools table
    const { data: teacherSchools, error } = await supabaseAdmin
      .from('teacher_schools')
      .select('school_id')
       
      .eq('teacher_id', teacherId) as any;

    if (error || !teacherSchools) {
      console.warn('Failed to get teacher assigned schools:', error?.message);
      return [];
    }

    return teacherSchools.map((ts: { school_id: string }) => ts.school_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting teacher assigned schools:', error);
    return [];
  }
}

/**
 * Validate that a school_id belongs to the authenticated teacher's assigned schools
 * @param requestSchoolId - The school_id to validate
 * @param request - Next.js request object (required for API routes)
 * @returns Promise<boolean> - True if valid, false otherwise
 */
export async function validateTeacherSchoolAccess(
  requestSchoolId: string,
  request: NextRequest
): Promise<boolean> {
  const teacherId = await getTeacherUserId(request);
  
  if (!teacherId) {
    console.warn('validateTeacherSchoolAccess: No teacher ID found');
    return false;
  }

  const assignedSchools = await getTeacherAssignedSchools(request);
  
  console.log('validateTeacherSchoolAccess:', {
    teacherId,
    requestSchoolId,
    assignedSchools,
    hasAccess: assignedSchools.includes(requestSchoolId)
  });
  
  if (assignedSchools.length === 0) {
    console.warn('validateTeacherSchoolAccess: Teacher has no assigned schools', { teacherId });
    return false;
  }

  const hasAccess = assignedSchools.includes(requestSchoolId);
  
  if (!hasAccess) {
    console.warn('validateTeacherSchoolAccess: School not in assigned schools', {
      teacherId,
      requestSchoolId,
      assignedSchools
    });
  }

  return hasAccess;
}

/**
 * Get the authenticated teacher's user ID and assigned schools
 * @param request - Next.js request object (required for API routes)
 * @returns Promise with teacher ID and assigned schools or null
 */
export async function getTeacherAuthInfo(request: NextRequest): Promise<{
  teacherId: string;
  assignedSchools: string[];
} | null> {
  try {
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return null;
    }

    const assignedSchools = await getTeacherAssignedSchools(request);
    
    if (assignedSchools.length === 0) {
      console.warn('Teacher has no assigned schools');
      return null;
    }

    return {
      teacherId,
      assignedSchools
    };
  } catch (error) {
    console.error('Error getting teacher auth info:', error);
    return null;
  }
}

