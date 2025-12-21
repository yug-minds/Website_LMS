import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createCourseSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';


// GET - Fetch courses for the school admin's school
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
    const status = searchParams.get('status') || '';
    const grade = searchParams.get('grade') || '';

    // Build query - only fetch courses from the admin's school
    // Simplified select to avoid nested query issues - fetch chapters separately if needed
    // Fetch courses - chapters are fetched separately if needed
    let query = supabaseAdmin
      .from('courses')
      .select('id, course_name, title, description, subject, grade, status, is_published, school_id, created_by, created_at, updated_at')
      .eq('school_id', schoolId); // Enforce school_id filtering

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Note: grades filter removed - courses table may not have a grades array field
    // Grade filtering is handled via course_access table in the expansion logic below

    // Apply pagination
    if (useCursor && cursorParams.cursor) {
      query = applyCursorPagination(query, cursorParams.cursor, cursorParams.direction);
      query = query.limit(limit + 1); // Fetch one extra to check if there's more
    } else {
      query = query.order('created_at', { ascending: false });
      if (limit > 0) {
        query = query.range(offset, offset + limit - 1);
      }
    }

    const { data: courses, error } = await query;

    if (error) {
      logger.error('Failed to fetch courses', {
        endpoint: '/api/school-admin/courses',
        method: 'GET',
        schoolId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/school-admin/courses', method: 'GET', schoolId: schoolId || undefined },
        'Failed to fetch courses'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Helper to normalize a single grade value to "Grade X" format
     
    const normalizeGradeValue = (g: any): string => {
      if (!g && g !== 0) return '';
      const str = String(g).trim();
      const numMatch = str.match(/(\d{1,2})/);
      if (numMatch) {
        return `Grade ${numMatch[1]}`;
      }
      return str;
    };

    // Helper to extract all grades from a course record
     
    const extractGrades = (c: any): string[] => {
      // 1) If grades is an array (text[] or jsonb array)
      if (Array.isArray(c.grades)) {
        const arr = c.grades
           
          .map((v: any) => normalizeGradeValue(v))
          .filter((v: string) => v.length > 0);
        if (arr.length > 0) return Array.from(new Set(arr));
      }

      // 2) If grades is a JSONB object or string array representation
      if (c.grades && typeof c.grades === 'string') {
        try {
          const parsed = JSON.parse(c.grades);
          if (Array.isArray(parsed)) {
            const arr = parsed
               
              .map((v: any) => normalizeGradeValue(v))
              .filter((v: string) => v.length > 0);
            if (arr.length > 0) return Array.from(new Set(arr));
          }
        } catch (e) {
          logger.warn('Error parsing grades JSON (non-critical)', {
            endpoint: '/api/school-admin/courses',
          }, e instanceof Error ? e : new Error(String(e)));
          // Not JSON, treat as comma-separated string
          const parts = c.grades.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (parts.length > 0) {
            return Array.from(new Set(parts.map((p: string) => normalizeGradeValue(p))));
          }
        }
      }

      // 3) If there's a single grade field (TEXT)
      if (c.grade) {
        const gradeStr = String(c.grade).trim();
        // Check if it contains a range like "4-9" or "Grade 4 to Grade 9"
        const rangeMatch = gradeStr.match(/(\d{1,2})\s*(?:to|-|–)\s*(\d{1,2})/i);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1], 10);
          const max = parseInt(rangeMatch[2], 10);
          if (min && max && max >= min) {
            return Array.from({ length: (max - min + 1) }, (_, i) => `Grade ${min + i}`);
          }
        }
        // Check if it's comma-separated like "4,5,6,7,8,9"
        const parts = gradeStr.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (parts.length > 1) {
          return Array.from(new Set(parts.map((p: string) => normalizeGradeValue(p))));
        }
        // Single grade
        return [normalizeGradeValue(c.grade)];
      }

      return [];
    };

    // Prefer authoritative mapping from course_access (one row per grade per school)
     
    let perGrade: any[] = [];
    try {
      const { data: accessRows, error: accessError } = await supabaseAdmin
        .from('course_access')
        .select(`
          grade,
          course:course_id (
            * ,
            chapters (
              id,
              order_number,
              order_index,
              name,
              title,
              learning_outcomes,
              content_type,
              content_url,
              is_published,
              created_at
            )
          )
        `)
         
        .eq('school_id', schoolId) as any;

      if (!accessError && Array.isArray(accessRows) && accessRows.length > 0) {
         
        perGrade = accessRows.map((row: any) => ({
          ...(row.course || {}),
          grade: normalizeGradeValue(row.grade)
        }));
      }
    } catch (e) {
      logger.warn('Error fetching course_access (non-critical)', {
        endpoint: '/api/school-admin/courses',
      }, e instanceof Error ? e : new Error(String(e)));
      // Table may not exist in some environments; ignore and fallback
    }

    // Fallback: Expand each course into multiple rows (one per grade) using inline fields
    if (perGrade.length === 0) {
       
      perGrade = (courses || []).flatMap((c: any) => {
      const gradesArr = extractGrades(c);
      
      logger.debug('Processing course for grade expansion', {
        endpoint: '/api/school-admin/courses',
        method: 'GET',
        schoolId,
        courseId: c.id,
        courseTitle: c.title || c.course_name,
        grades_field: c.grades,
        grade_field: c.grade,
        extracted_grades: gradesArr
      });

      if (gradesArr.length === 0) {
        // No grades found, return single row with existing grade or N/A
        return [{ ...c, grade: c.grade ? normalizeGradeValue(c.grade) : 'N/A' }];
      }

      // Return one row per grade
      return gradesArr.map((g: string) => ({
        ...c,
        grade: g // Set the specific grade for this row
      }));
      });
    }

    logger.debug('Expanded courses into grade-specific rows', {
      endpoint: '/api/school-admin/courses',
      method: 'GET',
      schoolId,
      originalCount: courses?.length || 0,
      expandedCount: perGrade.length,
    });

    // Filter by search term if provided
    let filteredCourses = perGrade || [];
    if (search) {
      const searchLower = search.toLowerCase();
       
      filteredCourses = filteredCourses.filter((course: any) => {
        return (
          course.title?.toLowerCase().includes(searchLower) ||
          course.description?.toLowerCase().includes(searchLower) ||
          course.subject?.toLowerCase().includes(searchLower)
        );
      });
    }

    logger.info('Courses fetched successfully', {
      endpoint: '/api/school-admin/courses',
      method: 'GET',
      schoolId,
      count: filteredCourses.length,
    });

    // For cursor pagination, create response with cursor
    let responseData: any;
    if (useCursor) {
      const cursorResponse = createCursorResponse(
        filteredCourses as Array<{ created_at: string; id: string }>,
        limit
      );
      responseData = {
        courses: cursorResponse.data,
        pagination: {
          nextCursor: cursorResponse.nextCursor,
          prevCursor: cursorResponse.prevCursor,
          hasMore: cursorResponse.hasMore
        }
      };
    } else {
      responseData = { courses: filteredCourses };
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
        endpoint: '/api/school-admin/courses',
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
      endpoint: '/api/school-admin/courses',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(responseData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/courses', {
      endpoint: '/api/school-admin/courses',
      method: 'GET',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/courses', method: 'GET' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST - Create a new course (automatically assigns school_id)
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
    const validation = validateRequestBody(createCourseSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for course creation', {
        endpoint: '/api/school-admin/courses',
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
      title,
      description,
      subject,
      grades,
      status,
      chapters
    } = body;

    // Validate required fields
    if (!title || !subject) {
      return NextResponse.json(
        { error: 'Title and subject are required' },
        { status: 400 }
      );
    }

    // Step 1: Create course record (automatically assigns school_id)
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .insert({
        school_id: schoolId, // Automatically assigned from admin's school
        title: title,
        description: description || '',
        subject: subject,
        grades: grades || [],
        status: status || 'Draft',
        created_at: new Date().toISOString()
       
      } as any)
      .select()
       
      .single() as any;

    if (courseError) {
      logger.error('Failed to create course', {
        endpoint: '/api/school-admin/courses',
        method: 'POST',
        schoolId,
      }, courseError);
      
      const errorInfo = await handleApiError(
        courseError,
        { endpoint: '/api/school-admin/courses', method: 'POST', schoolId: schoolId || undefined },
        'Failed to create course'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Step 2: Create chapters if provided (use chapters table, course_chapters is deprecated)
    if (chapters && Array.isArray(chapters) && chapters.length > 0) {
       
      const chaptersData = chapters.map((chapter: any, index: number) => ({
         
        course_id: (course as any).id,
        order_number: index + 1,
        order_index: index + 1,
        name: chapter.title || chapter.name || `Chapter ${index + 1}`,
        title: chapter.title || `Chapter ${index + 1}`,
        learning_outcomes: chapter.learning_outcomes || [],
        description: chapter.content_description || chapter.description || null,
        is_published: chapter.is_published || false,
        created_at: new Date().toISOString()
      }));

      const { error: chaptersError } = await supabaseAdmin
        .from('chapters')
         
        .insert(chaptersData as any);

      if (chaptersError) {
        logger.warn('Failed to create chapters (non-critical, course was created)', {
          endpoint: '/api/school-admin/courses',
          method: 'POST',
          schoolId,
           
          courseId: (course as any).id,
        }, chaptersError);
        // Continue anyway - course was created
      } else {
        logger.debug('Chapters created successfully', {
          endpoint: '/api/school-admin/courses',
          method: 'POST',
          schoolId,
           
          courseId: (course as any).id,
          chapterCount: chapters.length,
        });
      }
    }

    // Fetch complete course with chapters
    const { data: completeCourse } = await supabaseAdmin
      .from('courses')
      .select(`
        *,
            chapters (
              id,
              order_number,
              order_index,
              name,
              title,
              learning_outcomes,
              description,
              is_published
            )
      `)
       
      .eq('id', (course as any).id)
       
      .single() as any;

    logger.info('Course created successfully', {
      endpoint: '/api/school-admin/courses',
      method: 'POST',
      schoolId,
       
      courseId: (course as any).id,
      hasChapters: chapters && chapters.length > 0,
    });

    const successResponse = NextResponse.json({
      success: true,
      course: completeCourse || course,
      message: 'Course created successfully'
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/courses', {
      endpoint: '/api/school-admin/courses',
      method: 'POST',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/courses', method: 'POST' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

