import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { schoolAdminProfileUpdateSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


// Helper to get user_id from auth token
async function getUserIdFromAuth(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return null;
  }

  const { data: userResponse, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userResponse.user) {
    console.error('Error getting user from token:', userError?.message);
    return null;
  }

  return userResponse.user.id;
}

// PUT/PATCH - Update school admin profile
export async function PUT(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

try {
    const userId = await getUserIdFromAuth(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: User ID not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(schoolAdminProfileUpdateSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for school admin profile update', {
        endpoint: '/api/school-admin/profile',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { full_name, email } = validation.data;

    // Update profile (bypasses RLS using admin client)
     
    const { data: profile, error: profileError } = await ((supabaseAdmin as any)
      .from('profiles')
      .update({
        full_name: full_name !== undefined ? full_name : undefined,
        email: email !== undefined ? email : undefined,
        updated_at: new Date().toISOString()
       
      } as any)
      .eq('id', userId)
      .select()
       
      .single() as any) as any;

    if (profileError) {
      logger.error('Failed to update school admin profile', {
        endpoint: '/api/school-admin/profile',
        userId,
      }, profileError);
      
      const errorInfo = await handleApiError(
        profileError,
        { endpoint: '/api/school-admin/profile', userId },
        'Failed to update profile'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    if (!profile) {
      logger.warn('Profile not found after update', {
        endpoint: '/api/school-admin/profile',
        userId,
      });
      
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    logger.info('School admin profile updated successfully', {
      endpoint: '/api/school-admin/profile',
      userId,
    });

    const successResponse = NextResponse.json({ 
      success: true,
      message: 'Profile updated successfully',
      profile 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/school-admin/profile', {
      endpoint: '/api/school-admin/profile',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/profile' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}







