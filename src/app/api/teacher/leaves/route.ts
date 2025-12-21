import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId, validateTeacherSchoolAccess } from '../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createTeacherLeaveSchema, validateRequestBody } from '../../../../lib/validation-schemas';
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
    const schoolId = searchParams.get('school_id') || undefined;
    const status = searchParams.get('status');

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
      .from('teacher_leaves')
      .select(`
        *,
        schools (
          id,
          name,
          school_code
        )
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch teacher leaves', {
        endpoint: '/api/teacher/leaves',
        teacherId,
        schoolId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/leaves', teacherId, schoolId },
        'Failed to fetch leaves'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher leaves fetched successfully', {
      endpoint: '/api/teacher/leaves',
      teacherId,
      count: data?.length || 0,
    });

    return NextResponse.json({ leaves: data });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/leaves', {
      endpoint: '/api/teacher/leaves',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/leaves' },
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
    const validation = validateRequestBody(createTeacherLeaveSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher leave creation', {
        endpoint: '/api/teacher/leaves',
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
      start_date,
      end_date,
      leave_type,
      reason,
      substitute_required
    } = validation.data;

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(school_id, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
      );
    }

    // Calculate total days
    const start = new Date(start_date);
    const end = new Date(end_date);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (totalDays <= 0) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Insert the leave request (using admin client to bypass RLS)
     
    const { data, error } = await ((supabaseAdmin as any)
      .from('teacher_leaves')
      .insert({
        teacher_id: teacherId, // Use authenticated teacher_id
        school_id,
        // Backward compatibility: legacy schema had a required single-day `leave_date`.
        // Keep it populated to satisfy NOT NULL constraint while also storing the range.
        leave_date: start_date,
        start_date,
        end_date,
        leave_type: leave_type || 'Personal',
        reason,
        substitute_required: substitute_required || false,
        total_days: totalDays,
        status: 'Pending'
       
      } as any)
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('Failed to create teacher leave', {
        endpoint: '/api/teacher/leaves',
        teacherId,
        schoolId: school_id,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/leaves', teacherId, schoolId: school_id },
        'Failed to create leave request'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher leave created successfully', {
      endpoint: '/api/teacher/leaves',
      teacherId,
      leaveId: data?.id,
    });

    const successResponse = NextResponse.json({ leave: data }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/teacher/leaves', {
      endpoint: '/api/teacher/leaves',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/leaves' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
