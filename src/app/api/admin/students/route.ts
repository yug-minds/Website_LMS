import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createStudentSchema, updateStudentSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';


export async function GET(request: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }

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
    // Get access token for authenticated client
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    
    // Create authenticated client with RLS - admin policies will allow access
    const supabase = await createAuthenticatedClient(accessToken);
    
    const { searchParams } = new URL(request.url);
    // Support both cursor and offset pagination for backward compatibility
    const useCursor = searchParams.get('use_cursor') === 'true' || searchParams.has('cursor');
    const cursorParams = parseCursorParams(request);
    const limit = cursorParams.limit || parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search');
    const schoolId = searchParams.get('school_id') || undefined;

    logger.debug('Fetching students', {
      endpoint: '/api/admin/students',
      useCursor,
      limit,
      offset,
      search,
      schoolId,
    });

    let students: any[] | null = null;
    let error: any = null;

    if (schoolId) {
      const { data, error: e } = await supabase
        .from('student_schools')
        .select(`
          student_id,
          grade,
          is_active,
          schools ( id, name ),
          profiles:student_id (
            id,
            full_name,
            email,
            role,
            created_at,
            parent_name,
            parent_phone
          )
        `)
        .eq('school_id', schoolId);
      error = e;
      students = (data || []).map((row: any) => ({
        id: row?.profiles?.id,
        full_name: row?.profiles?.full_name,
        email: row?.profiles?.email,
        role: row?.profiles?.role,
        created_at: row?.profiles?.created_at,
        parent_name: row?.profiles?.parent_name,
        parent_phone: row?.profiles?.parent_phone,
        student_schools: [
          {
            school_id: row?.school_id,
            grade: row?.grade,
            is_active: row?.is_active,
            schools: row?.schools,
          },
        ],
      }));
    } else {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          role,
          created_at,
          parent_name,
          parent_phone,
          student_schools (
            school_id,
            grade,
            is_active,
            schools (
              id,
              name
            )
          )
        `)
        .eq('role', 'student');

      // Apply search filter before pagination
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      // Apply pagination
      if (useCursor && cursorParams.cursor) {
        query = applyCursorPagination(query, cursorParams.cursor, cursorParams.direction);
        query = query.limit(limit + 1); // Fetch one extra to check if there's more
      } else {
        query = query.order('created_at', { ascending: false });
        if (limit > 0 && limit < 10000) {
          query = query.range(offset, offset + limit - 1);
        }
      }

      const { data, error: e } = await query;
      error = e;
      students = data as any[] | null;
    }

    if (error) {
      logger.error('Failed to fetch students', {
        endpoint: '/api/admin/students',
        limit,
        offset,
        search,
        schoolId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/students' },
        'Failed to fetch students'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    const filteredStudents = students || [];

    logger.info('Students fetched successfully', {
      endpoint: '/api/admin/students',
      count: students?.length || 0,
      filteredCount: filteredStudents?.length || 0,
    });

    // For cursor pagination, create response with cursor
    let responseData: any;
    if (useCursor) {
      const cursorResponse = createCursorResponse(
        filteredStudents as Array<{ created_at: string; id: string }>,
        limit
      );
      responseData = {
        students: cursorResponse.data,
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
        endpoint: '/api/admin/students',
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
      endpoint: '/api/admin/students',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(responseData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/students', {
      endpoint: '/api/admin/students',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/students' },
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
    const body = await request.json();
    // Validate request body
    const validation = validateRequestBody(createStudentSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for student creation', {
        endpoint: '/api/admin/students',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
          status: 400,
        },
        { status: 400 }
      );
    }

    const {
      full_name,
      email,
      password,
      school_id,
      grade,
      phone,
      address,
      parent_name,
      parent_phone
    } = validation.data;

    logger.info('Creating new student', {
      endpoint: '/api/admin/students',
      email,
      schoolId: school_id,
    });

    // Check if email already exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
       
      .single() as any;

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Error checking existing profile', {
        endpoint: '/api/admin/students',
        email,
      }, checkError);
      
      const errorInfo = await handleApiError(
        checkError,
        { endpoint: '/api/admin/students', email },
        'Failed to check existing profile'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    if (existingProfile) {
      logger.warn('Email already exists', {
        endpoint: '/api/admin/students',
        email,
        existingUserId: existingProfile.id,
      });
      
      return NextResponse.json(
        { 
          error: 'Email already exists',
          details: `An account with email ${email} already exists`,
          status: 400,
        },
        { status: 400 }
      );
    }

    // Create auth user first
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
        endpoint: '/api/admin/students',
        email,
      }, authError);
      
      const errorInfo = await handleApiError(
        authError,
        { endpoint: '/api/admin/students', email },
        'Failed to create user account'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.debug('Auth user created successfully', {
      endpoint: '/api/admin/students',
      userId: authData.user.id,
      email,
    });

    const userId = authData.user.id;

    // Use transaction function to atomically create profile and enrollment
    // This prevents race conditions and ensures data consistency
    logger.debug('Creating student profile and enrollment atomically', {
      endpoint: '/api/admin/students',
      userId,
      email,
      schoolId: school_id,
    });

    const useRpc = process.env.USE_STUDENT_RPC === 'true';
    let transactionFailed = false;
    if (useRpc) {
      const { data: transactionResult, error: transactionError } = await (supabaseAdmin
        .rpc('create_student_enrollment' as any, {
          p_user_id: userId,
          p_full_name: full_name,
          p_email: email,
          p_phone: phone || null,
          p_address: address || null,
          p_parent_name: parent_name || null,
          p_parent_phone: parent_phone || null,
          p_school_id: school_id,
          p_grade: grade || 'Not Specified',
          p_joining_code: null
        } as any) as any);
      const result = transactionResult as any;
      if (transactionError || !result?.success) {
        transactionFailed = true;
        logger.warn('RPC create_student_enrollment failed, will use direct creation', {
          endpoint: '/api/admin/students',
          userId,
          email,
          schoolId: school_id,
          error: transactionError?.message || result?.error,
        }, transactionError instanceof Error ? transactionError : new Error(String(transactionError || result?.error)));
      } else {
        logger.info('Student enrollment created successfully via RPC', {
          endpoint: '/api/admin/students',
          userId,
          email,
        });
      }
    }

    if (!useRpc || transactionFailed) {
      // Direct creation path
      // Verify school exists
      const { data: schoolExists, error: schoolErr } = await supabaseAdmin
        .from('schools')
        .select('id')
        .eq('id', school_id)
        .maybeSingle() as any;

      if (schoolErr) {
        logger.error('Failed to verify school', { endpoint: '/api/admin/students', schoolId: school_id }, schoolErr);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        const info = await handleApiError(schoolErr, { endpoint: '/api/admin/students', schoolId: school_id }, 'Failed to verify school');
        return NextResponse.json(info, { status: info.status });
      }

      if (!schoolExists) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({
          error: 'Validation failed',
          message: 'Invalid school_id. School not found.',
          status: 400,
        }, { status: 400 });
      }

      // Upsert profile
      const { error: profileErr } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          full_name,
          email,
          role: 'student',
          phone: phone || null,
          address: address || null,
          parent_name: parent_name || null,
          parent_phone: parent_phone || null,
        } as any) as any;

      if (profileErr) {
        logger.error('Profile upsert failed', { endpoint: '/api/admin/students', userId, email }, profileErr);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        const info = await handleApiError(profileErr, { endpoint: '/api/admin/students', userId, email }, 'Failed to create student profile');
        return NextResponse.json(info, { status: info.status });
      }

      // Upsert student_schools
      const { data: enrollment, error: enrollErr } = await supabaseAdmin
        .from('student_schools')
        .upsert({
          student_id: userId,
          school_id,
          grade: grade || 'Not Specified',
          is_active: true,
          enrolled_at: new Date().toISOString(),
        } as any, { onConflict: 'student_id,school_id' } as any) as any;

      if (enrollErr) {
        logger.error('Enrollment upsert failed', { endpoint: '/api/admin/students', userId, schoolId: school_id }, enrollErr);
        // Non-fatal: profile exists; but since enrollment is core, delete user and profile to keep integrity
        await supabaseAdmin.auth.admin.deleteUser(userId);
        const info = await handleApiError(enrollErr, { endpoint: '/api/admin/students', userId, schoolId: school_id }, 'Failed to enroll student to school');
        return NextResponse.json(info, { status: info.status });
      }
    }

    logger.info('Student created and enrolled successfully', {
      endpoint: '/api/admin/students',
      userId,
      email,
      schoolId: school_id,
    });

    // Fetch the created student with relationships
    const { data: student, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        role,
        created_at,
        student_schools (
          school_id,
          grade,
          is_active,
          schools (
            id,
            name
          )
        )
      `)
      .eq('id', userId)
       
      .single() as any;

    if (fetchError) {
      console.error('Error fetching created student:', fetchError);
    }

    const response = NextResponse.json({ 
      student: student || { id: userId, full_name, email, role: 'student' },
      message: 'Student created successfully'
    }, { status: 201 });
    // Add rate limit headers
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    ensureCsrfToken(response, request);
    return response;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/students', {
      endpoint: '/api/admin/students',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/students' },
      'Failed to create student'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
