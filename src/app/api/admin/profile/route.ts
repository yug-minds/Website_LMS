import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { adminProfileUpdateSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


// GET: Get current user's profile
export async function GET(request: NextRequest) {
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
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
    // Get user ID from auth token (would need to extract from request)
    // For now, this is a placeholder - in production, extract from auth session
    const authHeader = request.headers.get('authorization');
    
    // Note: In production, you would extract the user ID from the JWT token
    // For admin operations, we can use the service role, but need user context
    // This endpoint is primarily for profile updates, so GET might not be needed
    
    return NextResponse.json({ 
      message: 'Use POST to update profile' 
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/profile', {
      endpoint: '/api/admin/profile',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/profile' },
      'Failed to fetch admin profile'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST/PATCH: Update current user's profile
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(adminProfileUpdateSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for admin profile update', {
        endpoint: '/api/admin/profile',
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

    const { user_id, full_name, email } = validation.data;

    // Update profile using admin client
     
    const updateData: any = {};
    if (full_name !== undefined) {
      updateData.full_name = full_name;
    }
    if (email !== undefined) {
      updateData.email = email;
    }

     
    const { data: updatedProfile, error: updateError } = await ((supabaseAdmin as any)
      .from('profiles')
       
      .update(updateData as any)
      .eq('id', user_id)
      .select()
       
      .single() as any) as any;

    if (updateError) {
      logger.error('Failed to update admin profile', {
        endpoint: '/api/admin/profile',
        userId: user_id,
      }, updateError);
      
      const errorInfo = await handleApiError(
        updateError,
        { endpoint: '/api/admin/profile', userId: user_id },
        'Failed to update profile'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Admin profile updated successfully', {
      endpoint: '/api/admin/profile',
      userId: user_id,
    });

    return NextResponse.json({
      profile: updatedProfile,
      message: 'Profile updated successfully'
    });
   
  } catch (error: any) {
    logger.error('Unexpected error in POST /api/admin/profile', {
      endpoint: '/api/admin/profile',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/profile' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PATCH: Same as POST
export async function PATCH(request: NextRequest) {
  
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
    return await POST(request);
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/profile', {
      endpoint: '/api/admin/profile',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/profile' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}







