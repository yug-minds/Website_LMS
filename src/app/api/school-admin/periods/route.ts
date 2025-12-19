import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { periodSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET /api/school-admin/periods
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    const { data: periods, error } = await supabaseAdmin
      .from('periods')
      .select('id, school_id, period_number, start_time, end_time, is_active, created_at, updated_at')
      .eq('school_id', schoolId)
       
      .order('period_number', { ascending: true }) as any;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch periods', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ periods: periods || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/periods', {
      endpoint: '/api/school-admin/periods',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/periods' },
      'Failed to fetch periods'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST /api/school-admin/periods
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(periodSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { period_number, start_time, end_time, is_active } = { ...validation.data, ...body };

    if (!period_number || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'Missing required fields', details: 'period_number, start_time, and end_time are required' },
        { status: 400 }
      );
    }

    const { data: period, error } = await (supabaseAdmin
      .from('periods')
      .insert({
        school_id: schoolId,
        period_number,
        start_time,
        end_time,
        is_active: is_active !== undefined ? is_active : true
       
      } as any)
      .select()
       
      .single() as any);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create period', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ period }, { status: 201 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/periods', {
      endpoint: '/api/school-admin/periods',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/periods' },
      'Failed to process period request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}






