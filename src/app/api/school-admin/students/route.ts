import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createStudentSchemaSchoolAdmin, validateRequestBody } from '../../../../lib/validation-schemas';
import { parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';


// GET - Fetch students for the school admin's school
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
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    // Support both cursor and offset pagination for backward compatibility
    const useCursor = searchParams.get('use_cursor') === 'true' || searchParams.has('cursor');
    const cursorParams = parseCursorParams(request);
    const limit = cursorParams.limit || parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';
    const grade = searchParams.get('grade') || '';
    const status = searchParams.get('status') || '';

    // Use admin client to ensure student profile fields are returned even if RLS
    // policies on `profiles` are restrictive. Authorization is still enforced via
    // getSchoolAdminSchoolId() + the school_id filter below.
    let query = supabaseAdmin
      .from('student_schools')
      .select(`
        *,
        profiles:student_id (
          id,
          full_name,
          email,
          phone,
          parent_name,
          parent_phone,
          created_at
        )
      `)
      .eq('school_id', schoolId); // Enforce school_id filtering

    // Apply filters
    if (grade && grade !== 'all') {
      query = query.eq('grade', grade);
    }

    if (status && status !== 'all') {
      query = query.eq('is_active', status === 'active');
    }

    // Apply pagination - use enrolled_at for cursor pagination
    if (useCursor && cursorParams.cursor) {
      query = applyCursorPagination(query, cursorParams.cursor, cursorParams.direction, 'enrolled_at');
      query = query.limit(limit + 1); // Fetch one extra to check if there's more
    } else {
      query = query.order('enrolled_at', { ascending: false });
      if (limit > 0) {
        query = query.range(offset, offset + limit - 1);
      }
    }

    logger.debug('Fetching students for school admin', {
      endpoint: '/api/school-admin/students',
      schoolId,
      search,
      grade,
      status,
    });

    const { data: students, error } = await query;

    if (error) {
      logger.error('Failed to fetch students', {
        endpoint: '/api/school-admin/students',
        schoolId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/school-admin/students', schoolId: schoolId || undefined },
        'Failed to fetch students'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Filter by search term if provided (client-side filtering for nested data)
    // Normalize embedded relationship key to `profile` (frontend expects `profile`)
    let filteredStudents = (students || []).map((s: any) => {
      const { profiles, ...rest } = s || {};
      return { ...rest, profile: profiles || null };
    });
    if (search) {
      const searchLower = search.toLowerCase();
       
      filteredStudents = filteredStudents.filter((student: any) => {
        const profile = student.profile;
        return (
          profile?.full_name?.toLowerCase().includes(searchLower) ||
          profile?.email?.toLowerCase().includes(searchLower) ||
          student.grade?.toLowerCase().includes(searchLower)
        );
      });
    }

    logger.info('Students fetched successfully', {
      endpoint: '/api/school-admin/students',
      schoolId,
      count: students?.length || 0,
      filteredCount: filteredStudents?.length || 0,
    });

    // For cursor pagination, create response with cursor
    let responseData: any;
    if (useCursor) {
      // Map enrolled_at to created_at for cursor response
      const mappedStudents = filteredStudents.map((s: any) => ({
        ...s,
        created_at: s.enrolled_at || s.created_at,
        id: s.id || s.student_id
      }));
      const cursorResponse = createCursorResponse(
        mappedStudents as Array<{ created_at: string; id: string }>,
        limit
      );
      responseData = {
        students: cursorResponse.data.map((s: any) => {
          const { created_at, ...rest } = s;
          return rest;
        }),
        pagination: {
          nextCursor: cursorResponse.nextCursor,
          prevCursor: cursorResponse.prevCursor,
          hasMore: cursorResponse.hasMore
        }
      };
    } else {
      responseData = { students: filteredStudents };
    }

    const requestStartTime = Date.now();
    const response = NextResponse.json(responseData);

    // Add rate limit headers
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add HTTP caching headers (shorter cache for list data)
    addCacheHeaders(response, responseData, {
      ...CachePresets.SEMI_STATIC,
      maxAge: 60, // 1 minute for list data
      staleWhileRevalidate: 120,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/school-admin/students',
        statusCode: 304,
        is304: true,
        hasETag: true,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: 0,
        duration: Date.now() - requestStartTime
      });
      return new NextResponse(null, { status: 304 });
    }

    // Track 200 response
    const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
    recordHttpCacheOperation({
      endpoint: '/api/school-admin/students',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(responseData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/students', {
      endpoint: '/api/school-admin/students',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/students' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST - Create a new student (automatically assigns school_id)
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
    // Get the school admin's school_id
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createStudentSchemaSchoolAdmin, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for student creation', {
        endpoint: '/api/school-admin/students',
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
      full_name,
      email,
      phone,
      grade,
      joining_code,
      password,
      parent_name,
      parent_phone
    } = validation.data;

    // Validate required fields
    if (!full_name || !email || !grade) {
      return NextResponse.json(
        { error: 'Full name, email, and grade are required' },
        { status: 400 }
      );
    }

    // Validate password strength (8+ chars, uppercase, lowercase, number)
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }
    
    const { validatePassword } = await import('../../../../lib/password-validation');
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.errors.join('. ') },
        { status: 400 }
      );
    }

    // Step 1: Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name,
        role: 'student'
      }
    });

    if (authError) {
      logger.error('Failed to create auth user', {
        endpoint: '/api/school-admin/students',
        method: 'POST',
        schoolId,
        email,
      }, authError);
      
      const errorInfo = await handleApiError(
        authError,
        { endpoint: '/api/school-admin/students', method: 'POST', schoolId: schoolId || undefined },
        'Failed to create user account'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    const userId = authData.user.id;

    // Step 2: Create/update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        full_name: full_name,
        email: email,
        role: 'student',
        phone: phone || null,
        parent_name: parent_name || null,
        parent_phone: parent_phone || null
       
      } as any, {
        onConflict: 'id'
      });

    if (profileError) {
      logger.error('Failed to create profile', {
        endpoint: '/api/school-admin/students',
        method: 'POST',
        schoolId,
        userId,
      }, profileError);
      
      // Try to delete auth user on failure
      await supabaseAdmin.auth.admin.deleteUser(userId);
      
      const errorInfo = await handleApiError(
        profileError,
        { endpoint: '/api/school-admin/students', method: 'POST', schoolId, userId },
        'Failed to create profile'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Step 3: Create student_schools record (automatically assigns school_id)
    const { data: studentRecord, error: studentError } = await supabaseAdmin
      .from('student_schools')
      .insert({
        student_id: userId,
        school_id: schoolId, // Automatically assigned from admin's school
        grade: grade,
        joining_code: joining_code || null,
        is_active: true,
        enrolled_at: new Date().toISOString()
       
      } as any)
      .select(`
        *,
        profiles:student_id (
          id,
          full_name,
          email,
          phone,
          parent_name,
          parent_phone
        )
      `)
       
      .single() as any;

    if (studentError) {
      logger.error('Failed to create student record', {
        endpoint: '/api/school-admin/students',
        method: 'POST',
        schoolId,
        userId,
      }, studentError);
      
      // Try to clean up
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      
      const errorInfo = await handleApiError(
        studentError,
        { endpoint: '/api/school-admin/students', method: 'POST', schoolId, userId },
        'Failed to create student record'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Student created successfully', {
      endpoint: '/api/school-admin/students',
      method: 'POST',
      schoolId,
      studentId: userId,
      grade,
    });

    const normalizedStudent = studentRecord
      ? (() => {
          const { profiles, ...rest } = studentRecord as any;
          return { ...rest, profile: profiles || null };
        })()
      : null;

    const successResponse = NextResponse.json({
      success: true,
      student: normalizedStudent,
      message: 'Student created successfully'
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/students', {
      endpoint: '/api/school-admin/students',
      method: 'POST',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/students', method: 'POST' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}







