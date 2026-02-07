import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createCourseSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { parseCursorParams, createCursorResponse } from '../../../../lib/pagination';
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

    // We'll fetch courses after getting course_access to ensure we only get courses
    // that are accessible to this school via course_access table

    // Helper to normalize a single grade value to "Grade X" format
    const normalizeGradeValue = (g: string | number | null | undefined): string => {
      if (!g && g !== 0) return '';
      const str = String(g).trim();
      const numMatch = str.match(/(\d{1,2})/);
      if (numMatch) {
        return `Grade ${numMatch[1]}`;
      }
      return str;
    };

    // NEW APPROACH: Query courses directly by school_id, then get grades and chapters
    // Step 1: Fetch all courses for this school
    const { data: courseDetails, error: coursesError } = await supabaseAdmin
      .from('courses')
      .select('id, course_name, title, description, subject, status, is_published, school_id, created_by, created_at, updated_at')
      .eq('school_id', schoolId);

    if (coursesError) {
      logger.error('Error fetching courses', {
        endpoint: '/api/school-admin/courses',
        error: coursesError.message
      });
      return NextResponse.json({ error: 'Failed to fetch courses', details: coursesError.message }, { status: 500 });
    }

    if (!courseDetails || courseDetails.length === 0) {
      logger.info('No courses found for school', {
        endpoint: '/api/school-admin/courses',
        schoolId
      });
      return NextResponse.json({ courses: [] });
    }

    type CourseDetail = {
      id: string;
      course_name?: string | null;
      title?: string | null;
      description?: string | null;
      subject?: string | null;
      status?: string | null;
      is_published?: boolean | null;
      school_id?: string | null;
      created_by?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      grade?: string | null;
    };
    const courseIds = ((courseDetails || []) as CourseDetail[]).map((c) => c.id).filter(Boolean);
    logger.debug('Fetched courses for school', {
      endpoint: '/api/school-admin/courses',
      schoolId,
      coursesCount: courseDetails.length,
      courseIds: courseIds.slice(0, 5)
    });

    // Step 2: Fetch course_access to get all grades for each course (in parallel with chapters)
    const [accessResult, chaptersResult] = await Promise.all([
      supabaseAdmin
        .from('course_access')
        .select('course_id, grade')
        .eq('school_id', schoolId)
        .in('course_id', courseIds),
      supabaseAdmin
        .from('chapters')
        .select('id, course_id, order_number, order_index, name, title, learning_outcomes, content_type, content_url, content_description, is_published, created_at')
        .in('course_id', courseIds)
    ]);

    const { data: accessRows, error: accessError } = accessResult;
    const { data: chaptersData, error: chaptersError } = chaptersResult;

    if (accessError) {
      logger.warn('Error fetching course_access', {
        endpoint: '/api/school-admin/courses',
        error: accessError.message
      });
    }

    if (chaptersError) {
      logger.error('Error fetching chapters', {
        endpoint: '/api/school-admin/courses',
        error: chaptersError.message
      });
    }

    type AccessRow = { course_id: string; grade?: string | null };
    const gradesByCourse = new Map<string, string[]>();
    if (accessRows && Array.isArray(accessRows)) {
      (accessRows as AccessRow[]).forEach((row) => {
        const courseId = row.course_id;
        const grade = normalizeGradeValue(row.grade);
        
        if (!gradesByCourse.has(courseId)) {
          gradesByCourse.set(courseId, []);
        }
        const grades = gradesByCourse.get(courseId)!;
        if (!grades.includes(grade)) {
          grades.push(grade);
        }
      });
    }

    type ChapterRow = { course_id?: string; order_number?: number; order_index?: number; [key: string]: unknown };
    const chaptersByCourse = new Map<string, ChapterRow[]>();
    if (chaptersData && Array.isArray(chaptersData) && chaptersData.length > 0) {
      const sortedChapters = [...(chaptersData as ChapterRow[])].sort((a, b) => {
        const aOrder = a.order_number ?? a.order_index ?? 0;
        const bOrder = b.order_number ?? b.order_index ?? 0;
        return aOrder - bOrder;
      });
      sortedChapters.forEach((ch) => {
        const courseId = ch.course_id;
        if (courseId) {
          if (!chaptersByCourse.has(courseId)) {
            chaptersByCourse.set(courseId, []);
          }
          chaptersByCourse.get(courseId)!.push(ch);
        }
      });
    }

    const courseDetailsTyped = (courseDetails || []) as CourseDetail[];
    logger.debug('Data aggregation summary', {
      endpoint: '/api/school-admin/courses',
      coursesCount: courseDetailsTyped.length,
      accessRowsCount: accessRows?.length || 0,
      chaptersCount: chaptersData?.length || 0,
      coursesWithGrades: gradesByCourse.size,
      coursesWithChapters: chaptersByCourse.size,
      sampleCourseId: courseDetailsTyped[0]?.id,
      chaptersForSampleCourse: chaptersByCourse.get(courseDetailsTyped[0]?.id)?.length || 0
    });

    // Step 5: Aggregate courses with all grades and chapters
    const aggregatedCourses = courseDetailsTyped.map((course: CourseDetail) => {
      const courseId = course.id;
      const grades = gradesByCourse.get(courseId) || [];
      const chapters = chaptersByCourse.get(courseId) || [];
      
      // Sort grades numerically
      const sortedGrades = grades.sort((a, b) => {
        const aNum = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const bNum = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return aNum - bNum;
      });

      return {
        ...course,
        grades: sortedGrades, // Array of all grades
        chapters: chapters, // Array of all chapters
        num_chapters: chapters.length,
        // Keep grade field for backward compatibility (comma-separated string)
        grade: sortedGrades.length > 0 ? sortedGrades.join(', ') : (course.grade || 'N/A')
      };
    });

    // Verify chapters are included
    type CourseWithChapters = { chapters?: unknown[]; created_at?: string; id?: string; [key: string]: unknown };
    const coursesWithChapters = aggregatedCourses.filter((c: CourseWithChapters) => c.chapters && c.chapters.length > 0);
    logger.info('Aggregated courses summary', {
      endpoint: '/api/school-admin/courses',
      schoolId,
      totalCourses: aggregatedCourses.length,
      coursesWithChapters: coursesWithChapters.length,
      totalChaptersInResponse: aggregatedCourses.reduce((sum: number, c: CourseWithChapters) => sum + (c.chapters?.length ?? 0), 0),
      sampleCourse: aggregatedCourses[0] ? {
        id: aggregatedCourses[0].id,
        title: aggregatedCourses[0].title || aggregatedCourses[0].course_name,
        grades: aggregatedCourses[0].grades,
        chaptersCount: aggregatedCourses[0].chapters?.length || 0,
        num_chapters: aggregatedCourses[0].num_chapters,
        hasChaptersArray: Array.isArray(aggregatedCourses[0].chapters),
        chaptersArrayLength: Array.isArray(aggregatedCourses[0].chapters) ? aggregatedCourses[0].chapters.length : 'not array'
      } : null
    });

    // Apply filters
    let filteredCourses = aggregatedCourses;
    
    // Filter by status
    if (status && status !== 'all') {
      filteredCourses = filteredCourses.filter((course: CourseWithChapters) => 
        (course.status || '').toLowerCase() === status.toLowerCase()
      );
    }
    
    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filteredCourses = filteredCourses.filter((course: CourseWithChapters) => {
        return (
          course.title?.toLowerCase().includes(searchLower) ||
          course.course_name?.toLowerCase().includes(searchLower) ||
          course.description?.toLowerCase().includes(searchLower) ||
          course.subject?.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Filter by grade if provided
    if (grade && grade !== 'all') {
      filteredCourses = filteredCourses.filter((course: CourseWithChapters) => {
        const courseGrades = course.grades || [];
        return courseGrades.some((g: string) => 
          g.toLowerCase().includes(grade.toLowerCase()) || 
          grade.toLowerCase().includes(g.toLowerCase())
        );
      });
    }
    
    // Apply pagination
    const totalCount = filteredCourses.length;
    let paginatedCourses = filteredCourses;
    
    if (useCursor && cursorParams.cursor) {
      // Cursor pagination would need to be implemented based on cursor position
      // For now, apply simple offset pagination
      const startIndex = offset;
      const endIndex = offset + limit;
      paginatedCourses = filteredCourses.slice(startIndex, endIndex);
    } else {
      if (limit > 0) {
        const startIndex = offset;
        const endIndex = offset + limit;
        paginatedCourses = filteredCourses.slice(startIndex, endIndex);
      }
    }
    
    // Sort by created_at descending
    paginatedCourses = paginatedCourses.sort((a: CourseWithChapters, b: CourseWithChapters) => {
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return bDate - aDate;
    });

    logger.info('Courses fetched successfully', {
      endpoint: '/api/school-admin/courses',
      method: 'GET',
      schoolId,
      count: filteredCourses.length,
    });

    let responseData: { courses: unknown[]; pagination?: { nextCursor?: string; prevCursor?: string; hasMore?: boolean }; total?: number };
    if (useCursor) {
      const cursorResponse = createCursorResponse(
        paginatedCourses as Array<{ created_at: string; id: string }>,
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
      responseData = { 
        courses: paginatedCourses,
        total: totalCount
      };
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
       
      const errorMessages = validation.details?.issues?.map((e: { path: (string | number)[]; message: string }) => `${e.path.join('.')}: ${e.message}`).join(', ') ?? validation.error ?? 'Invalid request data';
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
        created_at: new Date().toISOString(),
      } as never)
      .select()
      .single() as { data: { id: string } | null; error: unknown };

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

    const courseId = (course as { id: string }).id;

    // Step 2: Create chapters if provided (use chapters table, course_chapters is deprecated)
    if (chapters && Array.isArray(chapters) && chapters.length > 0) {
      type ChapterInput = { title?: string; name?: string; learning_outcomes?: unknown[]; content_description?: string; description?: string; is_published?: boolean };
      const chaptersData = chapters.map((chapter: ChapterInput, index: number) => ({
        course_id: courseId,
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
        .insert(chaptersData as never);

      if (chaptersError) {
        logger.warn('Failed to create chapters (non-critical, course was created)', {
          endpoint: '/api/school-admin/courses',
          method: 'POST',
          schoolId,
           
          courseId: courseId,
        }, chaptersError);
        // Continue anyway - course was created
      } else {
        logger.debug('Chapters created successfully', {
          endpoint: '/api/school-admin/courses',
          method: 'POST',
          schoolId,
           
          courseId: courseId,
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
       
      .eq('id', courseId)
      .single() as { data: unknown; error: unknown };

    logger.info('Course created successfully', {
      endpoint: '/api/school-admin/courses',
      method: 'POST',
      schoolId,
       
      courseId: courseId,
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

