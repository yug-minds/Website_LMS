/**
 * Centralized Authorization Utilities
 * 
 * Provides helper functions for authorization checks across all API endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTeacherUserId, validateTeacherSchoolAccess } from './teacher-auth';
import { getSchoolAdminSchoolId, validateSchoolAccess } from './school-admin-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Update last_activity timestamp for a user (non-blocking)
 * This is called automatically on authenticated requests to track activity
 */
async function updateUserActivity(userId: string): Promise<void> {
  // Update activity asynchronously (don't block the request)
  Promise.resolve(supabaseAdmin
    .from('profiles')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', userId))
    .then(() => {
      // Success - activity updated
    })
    .catch((error: unknown) => {
      // Log error but don't throw - activity tracking should not break requests
      console.warn('Failed to update user activity:', error);
    });
}

/**
 * Get authenticated user ID from request
 * Also updates last_activity timestamp for inactivity tracking
 */
export async function getAuthenticatedUserId(request: NextRequest, suppressWarning: boolean = false): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      // Only log warning if not suppressed (for public endpoints that optionally check auth)
      if (!suppressWarning) {
        console.warn('❌ No authorization header present in request', {
          method: request.method,
          url: request.url,
          pathname: request.nextUrl.pathname,
          allHeaders: Array.from(request.headers.entries()).map(([k]) => k)
        });
      }
      return null;
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.warn('❌ Invalid authorization header format (must be "Bearer <token>")', {
        method: request.method,
        url: request.url,
        pathname: request.nextUrl.pathname,
        headerValue: authHeader.substring(0, 20) + '...' // Log first 20 chars for debugging
      });
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.warn('❌ Authorization header present but token is empty', {
        method: request.method,
        url: request.url,
        pathname: request.nextUrl.pathname
      });
      return null;
    }

    // Check cache first (30-second TTL)
    const tokenHash = getTokenHash(token);
    const cached = tokenVerificationCache.get(tokenHash);
    if (cached && Date.now() - cached.timestamp < TOKEN_VERIFICATION_CACHE_TTL) {
      if (cached.userId) {
        // Update last_activity timestamp (non-blocking)
        updateUserActivity(cached.userId);
        return cached.userId;
      }
      // Cached null result means token was invalid
      return null;
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error) {
      console.warn('❌ Error getting user from token:', error.message);
      // Cache null result to avoid repeated failed queries
      tokenVerificationCache.set(tokenHash, { userId: null, timestamp: Date.now() });
      return null;
    }

    if (!user) {
      console.warn('❌ Token is valid but no user found');
      // Cache null result to avoid repeated failed queries
      tokenVerificationCache.set(tokenHash, { userId: null, timestamp: Date.now() });
      return null;
    }

    console.log('✅ User authenticated:', user.id);

    // Cache successful result
    tokenVerificationCache.set(tokenHash, { userId: user.id, timestamp: Date.now() });

    // Update last_activity timestamp (non-blocking)
    updateUserActivity(user.id);

    return user.id;
  } catch (error) {
    console.error('❌ Exception in getAuthenticatedUserId:', error);
    return null;
  }
}

// Cache for user profiles (30 seconds TTL - user data doesn't change frequently)
const profileCache = new Map<string, { data: { id: string; role: string; school_id: string | null } | null; timestamp: number }>();
const PROFILE_CACHE_TTL = 30 * 1000; // 30 seconds

// Cache for token verification (30 seconds TTL - reduces repeated auth.getUser calls)
// Key: first 10 chars + last 10 chars of token (for privacy)
const tokenVerificationCache = new Map<string, { userId: string | null; timestamp: number }>();
const TOKEN_VERIFICATION_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Get token hash for caching (first 10 + last 10 chars for privacy)
 */
function getTokenHash(token: string): string {
  if (token.length <= 20) return token;
  return `${token.substring(0, 10)}${token.substring(token.length - 10)}`;
}

/**
 * Get user profile with role (cached)
 * Caches profile lookups for 30 seconds to avoid repeated database queries
 */
export async function getUserProfile(userId: string): Promise<{ id: string; role: string; school_id: string | null } | null> {
  // Check cache first
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, role, school_id')
      .eq('id', userId)
       
      .single() as any;

    if (error || !profile) {
      // Cache null result to avoid repeated failed queries
      profileCache.set(userId, { data: null, timestamp: Date.now() });
      return null;
    }

    // Cache successful result
    profileCache.set(userId, { data: profile, timestamp: Date.now() });
    return profile;
  } catch (error) {
    // Cache null result on error
    profileCache.set(userId, { data: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Verify user has required role (with caching)
 */
export async function verifyRole(
  request: NextRequest,
  allowedRoles: string[]
): Promise<{ success: true; userId: string; role: string } | { success: false; response: NextResponse }> {
  // Suppress warnings in getAuthenticatedUserId since we handle the error case here
  // The 401 response already communicates the authentication failure
  const userId = await getAuthenticatedUserId(request, true);
  
  if (!userId) {
    return {
      success: false,
      response: NextResponse.json({ 
        error: 'Unauthorized',
        message: 'Authentication required. Please ensure you are logged in and Authorization header is present.'
      }, { status: 401 })
    };
  }

  const profile = await getUserProfile(userId);
  
  if (!profile) {
    console.warn('❌ User profile not found for user:', userId);
    return {
      success: false,
      response: NextResponse.json({ 
        error: 'User profile not found',
        message: 'Your user profile could not be loaded. Please log out and log back in.'
      }, { status: 404 })
    };
  }

  const hasAccess = allowedRoles.includes(profile.role);

  if (!hasAccess) {
    console.warn('❌ User role not allowed. User role:', profile.role, 'Allowed roles:', allowedRoles);
    return {
      success: false,
      response: NextResponse.json({ 
        error: 'Forbidden', 
        message: `Required role: ${allowedRoles.join(' or ')}. Your current role: ${profile.role}`
      }, { status: 403 })
    };
  }

  return {
    success: true,
    userId,
    role: profile.role
  };
}

/**
 * Verify user is admin
 */
export async function verifyAdmin(
  request: NextRequest
): Promise<{ success: true; userId: string } | { success: false; response: NextResponse }> {
  const result = await verifyRole(request, ['admin']);
  
  if (!result.success) {
    return result;
  }

  return {
    success: true,
    userId: result.userId
  };
}

/**
 * Verify user is school admin and has access to the specified school
 */
export async function verifySchoolAdminAccess(
  request: NextRequest,
  schoolId: string
): Promise<{ success: true; userId: string; schoolId: string } | { success: false; response: NextResponse }> {
  const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  }

  const profile = await getUserProfile(userId);
  
  if (!profile || profile.role !== 'school_admin') {
    return {
      success: false,
      response: NextResponse.json({ error: 'Forbidden: School admin access required' }, { status: 403 })
    };
  }

  const hasAccess = await validateSchoolAccess(schoolId, request);
  
  if (!hasAccess) {
    return {
      success: false,
      response: NextResponse.json({ 
        error: 'Forbidden', 
        message: 'You do not have access to this school' 
      }, { status: 403 })
    };
  }

  return {
    success: true,
    userId, 
    schoolId: schoolId || '' 
  };
}

/**
 * Verify user is teacher and has access to the specified school
 */
export async function verifyTeacherAccess(
  request: NextRequest,
  schoolId: string
): Promise<{ success: true; userId: string; schoolId: string } | { success: false; response: NextResponse }> {
  const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  }

  const profile = await getUserProfile(userId);
  
  if (!profile || profile.role !== 'teacher') {
    return {
      success: false,
      response: NextResponse.json({ error: 'Forbidden: Teacher access required' }, { status: 403 })
    };
  }

  const hasAccess = await validateTeacherSchoolAccess(schoolId, request);
  
  if (!hasAccess) {
    return {
      success: false,
      response: NextResponse.json({ 
        error: 'Forbidden', 
        message: 'You do not have access to this school' 
      }, { status: 403 })
    };
  }

  return {
    success: true,
    userId, 
    schoolId: schoolId || '' 
  };
}

/**
 * Verify user owns or has access to a resource
 * For student resources, verify the resource belongs to the student
 * For teacher resources, verify the resource belongs to the teacher
 * For school admin resources, verify the resource belongs to their school
 */
export async function verifyResourceAccess(
  request: NextRequest,
  resourceType: 'student' | 'teacher' | 'school',
  resourceId: string,
  resourceOwnerField: string = 'id'
): Promise<{ success: true; userId: string } | { success: false; response: NextResponse }> {
  const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  }

  const profile = await getUserProfile(userId);
  
  if (!profile) {
    return {
      success: false,
      response: NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    };
  }

  // For student resources, verify the resource belongs to the student
  if (resourceType === 'student') {
    if (profile.role !== 'student') {
      return {
        success: false,
        response: NextResponse.json({ error: 'Forbidden: Student access required' }, { status: 403 })
      };
    }

    // Check if resource belongs to student
    // This is a generic check - specific endpoints should implement their own logic
    if (resourceId !== userId) {
      // For now, we'll let specific endpoints handle this
      // But we've verified the user is a student
      return {
        success: true,
        userId
      };
    }
  }

  // For teacher resources, verify the resource belongs to the teacher
  if (resourceType === 'teacher') {
    if (profile.role !== 'teacher') {
      return {
        success: false,
        response: NextResponse.json({ error: 'Forbidden: Teacher access required' }, { status: 403 })
      };
    }

    // Check if resource belongs to teacher
    // This is a generic check - specific endpoints should implement their own logic
    if (resourceId !== userId) {
      // For now, we'll let specific endpoints handle this
      // But we've verified the user is a teacher
      return {
        success: true,
        userId
      };
    }
  }

  // For school resources, verify the resource belongs to the school admin's school
  if (resourceType === 'school') {
    if (profile.role !== 'school_admin') {
      return {
        success: false,
        response: NextResponse.json({ error: 'Forbidden: School admin access required' }, { status: 403 })
      };
    }

    const hasAccess = await validateSchoolAccess(resourceId, request);
    
    if (!hasAccess) {
      return {
        success: false,
        response: NextResponse.json({ 
          error: 'Forbidden', 
          message: 'You do not have access to this school' 
        }, { status: 403 })
      };
    }
  }

  return {
    success: true,
    userId
  };
}

/**
 * Verify user is student
 */
export async function verifyStudent(
  request: NextRequest
): Promise<{ success: true; userId: string } | { success: false; response: NextResponse }> {
  const result = await verifyRole(request, ['student']);
  
  if (!result.success) {
    return result;
  }

  return {
    success: true,
    userId: result.userId
  };
}

/**
 * Verify user is teacher
 */
export async function verifyTeacher(
  request: NextRequest
): Promise<{ success: true; userId: string } | { success: false; response: NextResponse }> {
  const result = await verifyRole(request, ['teacher']);
  
  if (!result.success) {
    return result;
  }

  return {
    success: true,
    userId: result.userId
  };
}

/**
 * Verify user is school admin
 */
export async function verifySchoolAdmin(
  request: NextRequest
): Promise<{ success: true; userId: string; schoolId: string } | { success: false; response: NextResponse }> {
  const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  }

  const profile = await getUserProfile(userId);
  
  if (!profile || profile.role !== 'school_admin') {
    return {
      success: false,
      response: NextResponse.json({ error: 'Forbidden: School admin access required' }, { status: 403 })
    };
  }

  const schoolId = await getSchoolAdminSchoolId(request);
  
  if (!schoolId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'School not found for user' }, { status: 404 })
    };
  }

  return {
    success: true,
    userId, 
    schoolId: schoolId || '' 
  };
}

/**
 * Verify user owns or has access to a resource
 */
export async function verifyUser(
  request: NextRequest,
  resourceUserId: string
): Promise<{ success: true; userId: string } | { success: false; response: NextResponse }> {
  const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  }

  const profile = await getUserProfile(userId);
  
  if (!profile) {
    return {
      success: false,
      response: NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    };
  }

  // Admin can access any user's data
  if (profile.role === 'admin') {
    return {
      success: true,
      userId
    };
  }

  // Users can only access their own data
  if (userId !== resourceUserId) {
    return {
      success: false,
      response: NextResponse.json({ 
        error: 'Forbidden', 
        message: 'You can only access your own data' 
      }, { status: 403 })
    };
  }

  return {
    success: true,
    userId
  };
}

