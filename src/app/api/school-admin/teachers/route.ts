import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createTeacherSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';


// GET - Fetch teachers for the school admin's school
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

    // Step 1: Get teacher_schools records for this school
    // Note: teacher_schools.teacher_id references profiles.id, not teachers.id
    let query = supabaseAdmin
      .from('teacher_schools')
      .select(`
        *,
        profile:profiles!teacher_schools_teacher_id_fkey (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('school_id', schoolId);

    // Apply pagination - use assigned_at for cursor pagination
    if (useCursor && cursorParams.cursor) {
      query = applyCursorPagination(query, cursorParams.cursor, cursorParams.direction, 'assigned_at') as any;
      query = query.limit(limit + 1) as any; // Fetch one extra to check if there's more
    } else {
      query = query.order('assigned_at', { ascending: false }) as any;
      if (limit > 0) {
        query = query.range(offset, offset + limit - 1) as any;
      }
    }

    const { data: teacherSchools, error: teacherSchoolsError } = await query;

    logger.debug('Fetching teachers for school admin', {
      endpoint: '/api/school-admin/teachers',
      schoolId,
      search,
    });

    if (teacherSchoolsError) {
      logger.error('Failed to fetch teacher_schools', {
        endpoint: '/api/school-admin/teachers',
        schoolId,
      }, teacherSchoolsError);
      
      const errorInfo = await handleApiError(
        teacherSchoolsError,
        { endpoint: '/api/school-admin/teachers', schoolId: schoolId || undefined },
        'Failed to fetch teachers'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    if (!teacherSchools || teacherSchools.length === 0) {
      logger.info('No teacher_schools found for school', {
        endpoint: '/api/school-admin/teachers',
        schoolId,
      });
      return NextResponse.json({ teachers: [] });
    }

    logger.debug('Teacher schools found', {
      endpoint: '/api/school-admin/teachers',
      schoolId,
      count: teacherSchools.length,
    });

    // Step 2: For each teacher_schools record, fetch the corresponding teacher record
    // We need to find the teacher record using the profile's email
    const mergedData = await Promise.all(
       
      teacherSchools.map(async (ts: any) => {
        // Handle joined data - Supabase joins can return arrays or objects
        const profile = Array.isArray(ts.profile) ? ts.profile[0] : ts.profile;
        
        if (!profile || !profile.email) {
          console.warn('⚠️ No profile or email found for teacher_schools record:', ts.id);
          return {
            ...ts,
            teacher: null,
            profile: profile
          };
        }

        // Find teacher record by email (since teachers table has email)
        const { data: teacherRecord, error: teacherError } = await supabaseAdmin
          .from('teachers')
          .select('id, teacher_id, full_name, email, phone, qualification, experience_years, specialization, address, temp_password, status, created_at, updated_at')
          .eq('email', profile.email)
           
          .maybeSingle() as any;

        if (teacherError) {
          console.warn(`⚠️ Error fetching teacher record for ${profile.email}:`, teacherError);
        }

        // Use teacher record if found, otherwise create a fallback from profile
        const teacher = teacherRecord || {
          id: profile.id,
          profile_id: profile.id,
          teacher_id: `TCH-${profile.id.slice(0, 8).toUpperCase()}`,
          full_name: profile.full_name || 'Unknown',
          email: profile.email || '',
          phone: profile.phone || '',
          qualification: '',
          experience_years: 0,
          specialization: '',
          status: 'Active',
          created_at: ts.assigned_at
        };

        return {
          ...ts,
          teacher: teacher,
          profile: profile
        };
      })
    );

    // Filter by search term if provided
    let filteredTeachers = mergedData || [];
    if (search) {
      const searchLower = search.toLowerCase();
       
      filteredTeachers = filteredTeachers.filter((ts: any) => {
        const teacher = ts.teacher || ts.profile;
        return (
          teacher?.full_name?.toLowerCase().includes(searchLower) ||
          teacher?.email?.toLowerCase().includes(searchLower)
        );
      });
    }

    logger.info('Teachers fetched successfully for school admin', {
      endpoint: '/api/school-admin/teachers',
      schoolId,
      count: filteredTeachers?.length || 0,
    });

    // For cursor pagination, create response with cursor
    let responseData: any;
    if (useCursor) {
      // Map assigned_at to created_at for cursor response
      const mappedTeachers = filteredTeachers.map((t: any) => ({
        ...t,
        created_at: t.assigned_at || t.created_at,
        id: t.id || t.teacher_id
      }));
      const cursorResponse = createCursorResponse(
        mappedTeachers as Array<{ created_at: string; id: string }>,
        limit
      );
      responseData = {
        teachers: cursorResponse.data.map((t: any) => {
          const { created_at, ...rest } = t;
          return rest;
        }),
        pagination: {
          nextCursor: cursorResponse.nextCursor,
          prevCursor: cursorResponse.prevCursor,
          hasMore: cursorResponse.hasMore
        }
      };
    } else {
      responseData = { teachers: filteredTeachers };
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
        endpoint: '/api/school-admin/teachers',
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
      endpoint: '/api/school-admin/teachers',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(responseData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/teachers', {
      endpoint: '/api/school-admin/teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/teachers' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST - Create a new teacher (automatically assigns school_id)
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
    const validation = validateRequestBody(createTeacherSchema, body);
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

    const {
      full_name,
      email,
      phone,
      qualification,
      experience_years,
      specialization,
      grades_assigned,
      subjects,
      password
    } = body;

    // Validate required fields
    if (!full_name || !email) {
      return NextResponse.json(
        { error: 'Full name and email are required' },
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

    // Step 1: Check if user already exists
    let userId: string | null = null;
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
     
    const existingAuthUser = authUsers?.users?.find((user: any) => user.email === email);
    
    if (existingAuthUser) {
      userId = existingAuthUser.id;
    } else {
      // Step 2: Create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name,
          role: 'teacher'
        }
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        return NextResponse.json(
          { error: 'Failed to create user account', details: authError.message },
          { status: 500 }
        );
      }

      userId = authData.user.id;
    }

    // Step 3: Create/update profile
     
    const { error: profileError } = await ((supabaseAdmin as any)
      .from('profiles')
      .upsert({
        id: userId,
        full_name: full_name,
        email: email,
        role: 'teacher',
        phone: phone || null
       
      } as any, {
        onConflict: 'id'
       
      } as any)) as any;

    if (profileError) {
      logger.error('Error creating profile', {
        endpoint: '/api/school-admin/teachers',
      }, profileError);
      
      const errorInfo = await handleApiError(
        profileError,
        { endpoint: '/api/school-admin/teachers' },
        'Failed to create profile'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Step 4: Create teacher record
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
     
    const { error: teacherError } = await ((supabaseAdmin as any)
      .from('teachers')
      .upsert({
        profile_id: userId,
        teacher_id: `TCH-${userId.slice(0, 8).toUpperCase()}`,
        full_name: full_name,
        email: email,
        phone: phone || '',
        qualification: qualification || '',
        experience_years: experience_years || 0,
        specialization: specialization || '',
        status: 'Active'
       
      } as any, {
        onConflict: 'profile_id'
       
      } as any)) as any;

    if (teacherError) {
      logger.error('Error creating teacher record', {
        endpoint: '/api/school-admin/teachers',
      }, teacherError);
      
      const errorInfo = await handleApiError(
        teacherError,
        { endpoint: '/api/school-admin/teachers' },
        'Failed to create teacher record'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Step 5: Create teacher_schools record (automatically assigns school_id)
    const { data: teacherSchool, error: teacherSchoolError } = await supabaseAdmin
      .from('teacher_schools')
      .insert({
        teacher_id: userId,
        school_id: schoolId, // Automatically assigned from admin's school
        grades_assigned: grades_assigned || [],
        subjects: subjects || [],
        working_days_per_week: 5,
        max_students_per_session: 30,
        is_primary: true,
        assigned_at: new Date().toISOString()
       
      } as any)
      .select(`
        *,
        teacher:teachers!teacher_schools_teacher_id_fkey (
          id,
          full_name,
          email,
          phone,
          qualification,
          experience_years,
          specialization
        )
      `)
       
      .single() as any;

    if (teacherSchoolError) {
      logger.error('Failed to create teacher_schools record', {
        endpoint: '/api/school-admin/teachers',
        schoolId,
        teacherId: userId,
      }, teacherSchoolError);
      
      const errorInfo = await handleApiError(
        teacherSchoolError,
        { endpoint: '/api/school-admin/teachers', schoolId, teacherId: userId },
        'Failed to assign teacher to school'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    const successResponse = NextResponse.json({
      success: true,
      teacher: teacherSchool,
      message: 'Teacher created and assigned to school successfully'
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/teachers', {
      endpoint: '/api/school-admin/teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/teachers' },
      'Failed to create teacher'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

