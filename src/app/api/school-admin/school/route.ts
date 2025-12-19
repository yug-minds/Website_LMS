import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { getOrSetCache, CacheKeys, CacheTTL, invalidateCache } from '../../../../lib/cache';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { schoolAdminSchoolUpdateSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET - Get school admin's school info
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
    // Get the school admin's school_id
    let schoolId: string | null = null;
    try {
      schoolId = await getSchoolAdminSchoolId(request);
    } catch (schoolIdError: any) {
      logger.error('Error getting school admin school_id', {
        endpoint: '/api/school-admin/school',
        error: schoolIdError?.message || String(schoolIdError),
      });
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Failed to get school_id' },
        { status: 401 }
      );
    }
    
    if (!schoolId) {
      logger.warn('School admin school_id is null', {
        endpoint: '/api/school-admin/school',
      });
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    // Get school info with caching (bypasses RLS using admin client)
    let school = null;
    try {
      school = await getOrSetCache(
        CacheKeys.school(schoolId),
        async () => {
          const { data, error } = await supabaseAdmin
            .from('schools')
            .select('id, name, address, contact_phone, contact_email, principal_name, created_at, updated_at')
            .eq('id', schoolId)
            .single() as any;
          
          if (error) {
            logger.error('Error fetching school from database', {
              endpoint: '/api/school-admin/school',
              schoolId,
              error: error.message,
            });
            throw error;
          }
          
          if (!data) {
            throw new Error('School not found in database');
          }
          
          return data;
        },
        CacheTTL.LONG // Cache for 15 minutes
      );
    } catch (cacheError: any) {
      const errorMessage = cacheError?.message || String(cacheError);
      const errorDetails = cacheError?.code || cacheError?.hint || '';
      logger.error('Error in cache operation for school', {
        endpoint: '/api/school-admin/school',
        schoolId,
        error: errorMessage,
        details: errorDetails,
        stack: cacheError?.stack,
      });
      return NextResponse.json(
        { 
          error: 'Failed to fetch school', 
          details: errorMessage,
          code: cacheError?.code,
          hint: cacheError?.hint,
        },
        { status: 500 }
      );
    }

    if (!school) {
      logger.warn('School not found', {
        endpoint: '/api/school-admin/school',
        schoolId,
      });
      return NextResponse.json(
        { error: 'School not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ school });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    logger.error('Unexpected error in GET /api/school-admin/school', {
      endpoint: '/api/school-admin/school',
      error: errorMessage,
      stack: error?.stack,
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/school' },
      'Failed to fetch school'
    );
    
    // Add more details for debugging
    return NextResponse.json({
      ...errorInfo,
      details: errorMessage,
      code: error?.code,
    }, { status: errorInfo.status });
  }
}

// PUT/PATCH - Update school information
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
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.error('Failed to parse request body', {
        endpoint: '/api/school-admin/school',
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return NextResponse.json(
        { 
          error: 'Invalid request body',
          details: 'Request body must be valid JSON',
        },
        { status: 400 }
      );
    }
    
    // Validate request body
    const validation = validateRequestBody(schoolAdminSchoolUpdateSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for school update', {
        endpoint: '/api/school-admin/school',
        schoolId,
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

    const { name, address, contact_email, contact_phone, principal_name, joining_codes } = validation.data;

    // Update school info (bypasses RLS using admin client)
     
    const { data: school, error: schoolError } = await ((supabaseAdmin as any)
      .from('schools')
      .update({
        name,
        address,
        contact_email,
        contact_phone,
        principal_name,
        joining_codes,
        updated_at: new Date().toISOString()
       
      } as any)
      .eq('id', schoolId)
      .select()
       
      .single() as any) as any;

    if (schoolError) {
      console.error('Error updating school:', schoolError);
      return NextResponse.json(
        { error: 'Failed to update school', details: schoolError.message },
        { status: 500 }
      );
    }

    if (!school) {
      return NextResponse.json(
        { error: 'School not found' },
        { status: 404 }
      );
    }

    // Invalidate cache after update
    invalidateCache(CacheKeys.school(schoolId));

    const successResponse = NextResponse.json({ 
      success: true,
      message: 'School information updated successfully',
      school 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/school-admin/school', {
      endpoint: '/api/school-admin/school',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/school' },
      'Failed to update school'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

