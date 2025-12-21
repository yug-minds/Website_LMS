import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId, validateTeacherSchoolAccess } from '../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createTeacherAttendanceSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


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
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = searchParams.get('limit') || '30';

    // If school_id is provided, validate that teacher is assigned to that school
    if (schoolId) {
      const hasAccess = await validateTeacherSchoolAccess(schoolId, request);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Forbidden: Teacher is not assigned to this school' },
          { status: 403 }
        );
      }
    }

    // Build query - filter by teacher_id and optionally by school_id
    let query = supabaseAdmin
      .from('attendance')
      .select(`
        *,
        schools (
          id,
          name,
          school_code
        )
      `)
      .eq('user_id', teacherId)
      .order('date', { ascending: false })
      .limit(parseInt(limit));

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch teacher attendance', {
        endpoint: '/api/teacher/attendance',
        teacherId,
        schoolId: schoolId || undefined,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/attendance', teacherId, schoolId: schoolId || undefined },
        'Failed to fetch attendance'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher attendance fetched successfully', {
      endpoint: '/api/teacher/attendance',
      teacherId,
      count: data?.length || 0,
    });

    return NextResponse.json({ attendance: data });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/attendance', {
      endpoint: '/api/teacher/attendance',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/attendance' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

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
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createTeacherAttendanceSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher attendance creation', {
        endpoint: '/api/teacher/attendance',
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

    const {
      school_id,
      class_id,
      date,
      status,
      remarks
    } = validation.data;

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(school_id, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
      );
    }

    // Insert or update attendance record (using admin client to bypass RLS)
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert({
        user_id: teacherId, // Use authenticated teacher_id
        school_id,
        class_id,
        date,
        status,
        remarks,
        recorded_by: teacherId,
        recorded_at: new Date().toISOString()
       
      } as any, {
        onConflict: 'user_id,school_id,date',
        ignoreDuplicates: false
       
      } as any) as any;

    if (error) {
      logger.error('Failed to create/update teacher attendance', {
        endpoint: '/api/teacher/attendance',
        teacherId,
        schoolId: school_id,
        date,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/attendance', teacherId, schoolId: school_id, date },
        'Failed to update attendance'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher attendance created/updated successfully', {
      endpoint: '/api/teacher/attendance',
      teacherId,
      attendanceId: (data as { id?: string } | null)?.id,
    });

    const successResponse = NextResponse.json({ attendance: data }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/teacher/attendance', {
      endpoint: '/api/teacher/attendance',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/attendance' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
