import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createCourseSchema, updateCourseSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';


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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    // IMPORTANT:
    // This is an admin-only endpoint and we already verified admin access above.
    // Using an RLS-authenticated client here can cause expensive policy evaluation and
    // intermittent Postgres statement timeouts (57014). Use the service-role client to
    // bypass RLS for predictable performance.
    const supabase = supabaseAdmin;

    const { searchParams } = new URL(request.url);
    // Support both cursor and offset pagination for backward compatibility
    const useCursor = searchParams.get('use_cursor') === 'true' || searchParams.has('cursor');
    const cursorParams = parseCursorParams(request);
    const limit = cursorParams.limit || parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const schoolId = searchParams.get('school_id') || undefined;

    // Fetch courses using authenticated client with RLS - admin policies will allow access
    // Note: Fetching chapters separately to avoid nested query issues
    let query = supabase
      .from('courses')
      .select('id, course_name, name, title, description, subject, grade, status, is_published, school_id, created_by, created_at, updated_at, thumbnail_url, duration_weeks, prerequisites_course_ids, prerequisites_text, difficulty_level, total_chapters, num_chapters, total_videos, total_materials, total_assignments, release_type, content_summary');

    // Apply search filter (search in course_name, title, description, subject)
    if (search) {
      query = query.or(`course_name.ilike.%${search}%,title.ilike.%${search}%,description.ilike.%${search}%,subject.ilike.%${search}%`);
    }

    // Apply status filter (check both status and is_published)
    if (status) {
      if (status === 'Published') {
        query = query.eq('is_published', true).or('status.eq.Published');
      } else if (status === 'Draft') {
        query = query.eq('is_published', false).or('status.eq.Draft');
      } else {
        query = query.eq('status', status);
      }
    }

    // Apply school filter
    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

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

    logger.debug('Fetching courses', {
      endpoint: '/api/admin/courses',
      limit,
      offset,
      search,
      status,
      schoolId,
    });

    const { data: courses, error } = await query;

    if (error) {
      console.error('❌ [API] Error fetching courses:', error);
      console.error('   Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      
      logger.error('Failed to fetch courses', {
        endpoint: '/api/admin/courses',
        limit,
        offset,
        search,
        status,
        schoolId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/courses' },
        'Failed to fetch courses'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    console.log(`✅ [API] Fetched ${courses?.length || 0} course(s) from database`);
    if (courses && courses.length > 0) {
      console.log('   Courses:', courses.map((c: any) => ({ id: c.id, name: c.course_name || c.name || c.title })));
    } else {
      console.warn('⚠️ [API] No courses found in database');
    }

    logger.info('Courses fetched successfully', {
      endpoint: '/api/admin/courses',
      count: courses?.length || 0,
    });

    // Fetch course_access for all courses separately (without nested schools to avoid relationship issues)
     
     
    const courseIds = (courses || []).map((c: any) => c.id);
     
    let courseAccessMap: Record<string, any[]> = {};
    
    if (courseIds.length > 0) {
      try {
        const { data: courseAccessData, error: accessError } = await supabaseAdmin
          .from('course_access')
          .select('id, course_id, school_id, grade')
           
          .in('course_id', courseIds) as any;

        if (accessError) {
          logger.warn('Error fetching course_access (non-critical)', {
            endpoint: '/api/admin/courses',
          }, accessError);
          // Continue without course_access data but log the error
        } else if (courseAccessData && courseAccessData.length > 0) {
          logger.debug('Course access data fetched', {
            endpoint: '/api/admin/courses',
            accessCount: courseAccessData.length,
          });
          // Get unique school IDs
           
          const schoolIds = [...new Set(courseAccessData.map((a: any) => a.school_id).filter(Boolean))];
          
          // Fetch school names separately
          let schoolsMap = new Map();
          if (schoolIds.length > 0) {
            const { data: schoolsData, error: schoolsError } = await supabaseAdmin
              .from('schools')
              .select('id, name')
               
              .in('id', schoolIds) as any;
            
            if (!schoolsError && schoolsData) {
               
              schoolsMap = new Map(schoolsData.map((s: any) => [s.id, s]));
            }
          }
          
          // Group by course_id and add school names
           
          courseAccessMap = courseAccessData.reduce((acc: Record<string, any[]>, access: any) => {
            if (!acc[access.course_id]) {
              acc[access.course_id] = [];
            }
            acc[access.course_id].push({
              ...access,
              schools: schoolsMap.get(access.school_id) || null
            });
            return acc;
          }, {});
          
          console.log(`✅ Fetched ${courseAccessData.length} course_access entries for ${Object.keys(courseAccessMap).length} courses`);
        } else {
          console.warn('⚠️ No course_access entries found for any courses');
        }
      } catch (accessErr) {
        logger.warn('Exception fetching course_access (non-critical)', {
          endpoint: '/api/admin/courses',
        }, accessErr instanceof Error ? accessErr : new Error(String(accessErr)));
        // Continue without course_access data - this is intentional non-critical error handling
      }
    }

    // Compute content counts from chapter_contents (video links / PDFs are stored there in the builder)
    // This keeps the admin list accurate even when legacy tables (videos/materials) aren't used.
    let contentCountsByCourse: Record<string, { videos: number; materials: number }> = {};
    if (courseIds.length > 0) {
      try {
        // Fetch chapters for the listed courses (id -> course_id)
        const { data: chaptersData, error: chaptersError } = await supabaseAdmin
          .from('chapters')
          .select('id, course_id')
          .in('course_id', courseIds) as any;

        if (!chaptersError && chaptersData && chaptersData.length > 0) {
          const chapterIdToCourseId = new Map<string, string>();
          const chapterIds: string[] = [];

          for (const ch of chaptersData as any[]) {
            if (ch?.id && ch?.course_id) {
              chapterIdToCourseId.set(ch.id, ch.course_id);
              chapterIds.push(ch.id);
            }
          }

          if (chapterIds.length > 0) {
            // Fetch only the fields needed for counts
            const { data: contentsData, error: contentsError } = await supabaseAdmin
              .from('chapter_contents')
              .select('chapter_id, content_type')
              .in('chapter_id', chapterIds) as any;

            if (!contentsError && contentsData && contentsData.length > 0) {
              const videoTypes = new Set(['video', 'video_link']);
              const materialTypes = new Set(['pdf', 'file', 'image', 'audio']);

              contentCountsByCourse = {};
              for (const row of contentsData as any[]) {
                const courseId = row?.chapter_id ? chapterIdToCourseId.get(row.chapter_id) : undefined;
                if (!courseId) continue;

                const ct = String(row?.content_type || '').toLowerCase();
                if (!contentCountsByCourse[courseId]) {
                  contentCountsByCourse[courseId] = { videos: 0, materials: 0 };
                }

                if (videoTypes.has(ct)) contentCountsByCourse[courseId].videos += 1;
                if (materialTypes.has(ct)) contentCountsByCourse[courseId].materials += 1;
              }
            }
          }
        } else if (chaptersError) {
          logger.warn('Error fetching chapters for content counts (non-critical)', {
            endpoint: '/api/admin/courses',
          }, chaptersError);
        }
      } catch (countsErr) {
        logger.warn('Exception computing chapter_contents counts (non-critical)', {
          endpoint: '/api/admin/courses',
        }, countsErr instanceof Error ? countsErr : new Error(String(countsErr)));
      }
    }

    // Map database schema to match frontend interface
     
    const mappedCourses = (courses || []).map((course: any) => {
      // Extract content counts from content_summary if it's JSONB
      const contentSummary = course.content_summary || {};
      const derivedCounts = contentCountsByCourse[course.id] || { videos: 0, materials: 0 };
      // Prefer persisted totals, but fall back to derived chapter_contents counts when those are missing/zero
      const totalVideos = (course.total_videos || contentSummary.videos || 0) || derivedCounts.videos || 0;
      const totalMaterials = (course.total_materials || contentSummary.materials || 0) || derivedCounts.materials || 0;
      const totalAssignments = course.total_assignments || contentSummary.assignments || 0;

      return {
        ...course,
        name: course.course_name || course.name || course.title || '',
        total_chapters: course.num_chapters || course.total_chapters || 0,
        total_videos: totalVideos,
        total_materials: totalMaterials,
        total_assignments: totalAssignments,
        release_type: course.release_type || 'Weekly',
        status: course.is_published ? 'Published' : (course.status || 'Draft'),
        course_access: courseAccessMap[course.id] || []
      };
    });

    // For cursor pagination, create response with cursor
    let responseData: any;
    if (useCursor) {
      const cursorResponse = createCursorResponse(
        mappedCourses as Array<{ created_at: string; id: string }>,
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
      responseData = { courses: mappedCourses };
    }

    const requestStartTime = Date.now();
    const response = NextResponse.json(responseData);

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
        endpoint: '/api/admin/courses',
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
      endpoint: '/api/admin/courses',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(responseData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
   
  } catch (error: any) {
    logger.error('Unexpected error in GET /api/admin/courses', {
      endpoint: '/api/admin/courses',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses' },
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
    
    // Pre-process body to clean up invalid values before validation
    const cleanedBody = {
      ...body,
      school_ids: Array.isArray(body.school_ids) 
        ? body.school_ids.filter((id: any) => id && typeof id === 'string' && id.trim().length > 0)
        : body.school_ids,
      grades: Array.isArray(body.grades)
        ? body.grades.filter((g: any) => g && typeof g === 'string' && g.trim().length > 0)
        : body.grades
    };

    // Validate request body
    const validation = validateRequestBody(createCourseSchema, cleanedBody);
    if (!validation.success) {
      const errorMessages = validation.details?.issues?.map((e: any) => {
        const path = Array.isArray(e.path) ? e.path.join('.') : String(e.path || '');
        return `${path ? path + ': ' : ''}${e.message}`;
      }).join(', ') || validation.error || 'Invalid request data';
      
      logger.warn('Validation failed for course creation', {
        endpoint: '/api/admin/courses',
        errors: errorMessages,
        requestBody: {
          name: cleanedBody.name,
          title: cleanedBody.title,
          school_ids_count: Array.isArray(cleanedBody.school_ids) ? cleanedBody.school_ids.length : 0,
          grades_count: Array.isArray(cleanedBody.grades) ? cleanedBody.grades.length : 0,
          hasName: !!cleanedBody.name,
          hasTitle: !!cleanedBody.title
        },
        validationIssues: validation.details?.issues
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
          hint: !cleanedBody.name && !cleanedBody.title 
            ? 'Course name is required' 
            : (Array.isArray(cleanedBody.school_ids) && cleanedBody.school_ids.length === 0 
              ? 'At least one school must be selected' 
              : (Array.isArray(cleanedBody.grades) && cleanedBody.grades.length === 0 
                ? 'At least one grade must be selected' 
                : 'Please check all required fields'))
        },
        { status: 400 }
      );
    }

    const {
      id,
      name,
      title,
      description,
      duration_weeks,
      prerequisites_course_ids,
      prerequisites_text,
      thumbnail_url,
      difficulty_level,
      total_chapters,
      total_videos,
      total_materials,
      total_assignments,
      release_type,
      status,
      school_ids,
      grades,
      chapters,
      videos,
      materials,
      assignments,
      scheduling,
      chapter_contents
    } = { ...validation.data, ...body }; // Merge validated data with additional fields

    // Get course name from either name or title field
    const courseName = name || title;

    // Validate required fields with detailed error messages
    if (!courseName) {
      return NextResponse.json(
        { 
          error: 'Missing required field',
          details: 'Course name is required. Please provide either "name" or "title" field.',
          hint: 'Make sure the course name field is filled in'
        },
        { status: 400 }
      );
    }
    
    // Validate school_ids - use cleaned version from validation
    const validSchoolIds = school_ids || [];
    if (!Array.isArray(validSchoolIds) || validSchoolIds.length === 0) {
      return NextResponse.json(
        { 
          error: 'Missing required field',
          details: 'At least one school must be selected',
          hint: 'Please select at least one school for this course'
        },
        { status: 400 }
      );
    }
    
    // Validate grades - use cleaned version from validation
    const validGrades = grades || [];
    if (!Array.isArray(validGrades) || validGrades.length === 0) {
      return NextResponse.json(
        { 
          error: 'Missing required field',
          details: 'At least one grade must be selected',
          hint: 'Please select at least one grade for this course'
        },
        { status: 400 }
      );
    }

    // Get current user (admin) from headers or session
    // For now, we'll use a placeholder - you may want to get this from auth token
    const created_by = body.created_by || null; // TODO: Get from auth session

    // Create course - use only columns that exist in the actual schema
    // Based on 20241201000002_create_admin_tables.sql schema:
    // id, school_id, grade, course_name, description, num_chapters, content_summary, status, created_by, created_at, updated_at
    // Note: school_id and grade are NOT NULL in the original schema, but we'll use first school/grade from selections
    // If your schema allows NULL or uses course_access table instead, adjust accordingly
    
    // Get first school and grade for required fields (some schemas require these)
    const firstSchoolId = school_ids && school_ids.length > 0 ? school_ids[0] : null;
    const firstGrade = grades && grades.length > 0 ? grades[0] : null;
    
     
    const courseData: any = {
      name: courseName, // name column has NOT NULL constraint, so set it
      course_name: courseName, // Also set course_name for backward compatibility
      description: description || null,
      duration_weeks: duration_weeks ? parseInt(String(duration_weeks)) : null,
      prerequisites_course_ids: prerequisites_course_ids && Array.isArray(prerequisites_course_ids) && prerequisites_course_ids.length > 0 
        ? prerequisites_course_ids 
        : null,
      prerequisites_text: prerequisites_text || null,
      thumbnail_url: thumbnail_url || null,
      difficulty_level: difficulty_level || 'Beginner',
      created_by: created_by || null,
      status: status || 'Draft',
      num_chapters: total_chapters || chapters?.length || 0,
      // Store content counts in content_summary (JSONB field)
      content_summary: {
        videos: total_videos || videos?.length || 0,
        materials: total_materials || materials?.length || 0,
        assignments: total_assignments || assignments?.length || 0
      }
    };

    // If ID is provided (from frontend), check if it already exists
    // If it exists, don't use it (let database generate a new one) to avoid duplicate key errors
    if (id) {
      const { data: existingCourse } = await supabaseAdmin
        .from('courses')
        .select('id')
        .eq('id', id)
        .single() as any;
      
      if (!existingCourse) {
        // ID doesn't exist, safe to use
        courseData.id = id;
      } else {
        // ID already exists, let database generate a new one
        console.warn(`⚠️ Course ID ${id} already exists, generating new ID`);
        // Don't set id, let database generate it
      }
    }

    // Add school_id and grade if schema requires them (only if provided)
    if (firstSchoolId) {
      courseData.school_id = firstSchoolId;
    }
    if (firstGrade) {
      courseData.grade = firstGrade;
    }

    // Note: release_type doesn't exist in this schema, so we don't include it
    // The older schema doesn't have release_type, total_videos, total_materials, total_assignments as separate columns

    console.log('Creating course with data:', { course_name: name, status, num_chapters: courseData.num_chapters, school_id: courseData.school_id, grade: courseData.grade, id: courseData.id || 'auto-generated' });

    // Insert course - specify which columns to select back (only existing columns)
    let course: any;
    const insertResult = await supabaseAdmin
      .from('courses')
      .insert(courseData)
      .select('id, name, course_name, description, status, num_chapters, content_summary, created_by, created_at, updated_at')
      .single() as any;
    
    course = insertResult.data;
    const courseError = insertResult.error;

    // Handle duplicate key error - retry without ID
    if (courseError && (courseError.code === '23505' || courseError.message?.includes('duplicate key'))) {
      console.warn('⚠️ Duplicate key error detected, retrying without client-provided ID');
      delete courseData.id;
      
      const retryResult = await supabaseAdmin
        .from('courses')
        .insert(courseData)
        .select('id, name, course_name, description, status, num_chapters, content_summary, created_by, created_at, updated_at, thumbnail_url, duration_weeks, prerequisites_course_ids, prerequisites_text, difficulty_level')
        .single() as any;
      
      if (retryResult.error) {
        console.error('Error creating course (retry failed):', retryResult.error);
        return NextResponse.json({ 
          error: `Failed to create course: ${retryResult.error.message}`,
          details: 'Duplicate ID detected and retry also failed'
        }, { status: 500 });
      }
      
      // Use the retry result
      course = retryResult.data;
      console.log('✅ Course created successfully with auto-generated ID:', course.id);
    } else if (courseError) {
      console.error('Error creating course:', courseError);
      return NextResponse.json({ 
        error: `Failed to create course: ${courseError.message}` 
      }, { status: 500 });
    }

    const courseId = course.id;

    // Create course_access entries (multi-school / multi-grade)
    // Use validated arrays
    if (validSchoolIds.length > 0 && validGrades.length > 0) {
      console.log('📋 Creating course_access with:', {
        courseId,
        school_ids: validSchoolIds,
        grades: validGrades,
        school_count: validSchoolIds.length,
        grade_count: validGrades.length
      });

      // Validate school_ids exist
      const { data: existingSchools, error: schoolsCheckError } = await supabaseAdmin
        .from('schools')
        .select('id')
         
        .in('id', validSchoolIds) as any;

      if (schoolsCheckError) {
        logger.error('Error validating schools', {
          endpoint: '/api/admin/courses',
        }, schoolsCheckError);
        
        const errorInfo = await handleApiError(
          schoolsCheckError,
          { endpoint: '/api/admin/courses' },
          'Failed to validate schools'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }

      const existingSchoolIds = existingSchools?.map((s: { id: string }) => s.id) || [];
      const invalidSchoolIds = validSchoolIds.filter((id: string) => !existingSchoolIds.includes(id));
      
      if (invalidSchoolIds.length > 0) {
        logger.error('Invalid school IDs provided', {
          endpoint: '/api/admin/courses',
          invalidSchoolIds,
        });
        
        return NextResponse.json({ 
          error: 'Invalid school IDs provided', 
          details: `The following school IDs are invalid: ${invalidSchoolIds.join(', ')}` 
        }, { status: 400 });
      }

      // Use already validated grades array
      // Valid grades are already filtered in the schema transformation

      // Helper function to normalize grade to display format (e.g., "grade4" -> "Grade 4")
      const normalizeGradeToDisplay = (grade: string): string => {
        if (!grade) return '';
        const trimmed = typeof grade === 'string' ? grade.trim() : String(grade).trim();
        
        // If already in "Grade X" format, return as-is
        if (/^Grade\s+\d+$/i.test(trimmed)) {
          return trimmed;
        }
        
        // Remove "grade" prefix if present (case-insensitive)
        const normalized = trimmed.replace(/^grade\s*/i, '').trim();
        
        // Handle special cases
        const lower = normalized.toLowerCase();
        if (lower === 'pre-k' || lower === 'prek' || lower === 'pre-kg') {
          return 'Pre-K';
        }
        if (lower === 'k' || lower === 'kindergarten' || lower === 'kg') {
          return 'Kindergarten';
        }
        
        // Extract number and format as "Grade X"
        const numMatch = normalized.match(/(\d{1,2})/);
        if (numMatch) {
          return `Grade ${numMatch[1]}`;
        }
        
        // If no number found, return as-is (capitalize first letter)
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
      };

      // Create new course_access entries
      const accessEntries = [];
      const seenEntries = new Set<string>(); // Track duplicates
      
      for (const schoolId of existingSchoolIds) {
        for (const grade of validGrades) {
          // Normalize grade to display format
          const gradeValue = normalizeGradeToDisplay(grade);
          
          if (gradeValue) {
            // Create a unique key to prevent duplicates
            const entryKey = `${courseId}-${schoolId || 'undefined'}-${gradeValue}`;
            
            if (!seenEntries.has(entryKey)) {
              seenEntries.add(entryKey);
              accessEntries.push({
                course_id: courseId,
                school_id: schoolId,
                grade: gradeValue
              });
            }
          }
        }
      }

      console.log(`📋 Creating ${accessEntries.length} course_access entries for course ${courseId}:`, 
        JSON.stringify(accessEntries.map((e: any) => ({ school_id: e.school_id, grade: e.grade })), null, 2));

      if (accessEntries.length === 0) {
        console.error('❌ No valid access entries to create');
        return NextResponse.json({ 
          error: 'No valid access entries to create', 
          details: 'Could not create any course access entries' 
        }, { status: 400 });
      }

      const { data: insertedAccess, error: accessError } = await (supabaseAdmin
        .from('course_access')
         
        .insert(accessEntries as any)
         
        .select() as any);

      if (accessError) {
        console.error('❌ Error creating course access:', accessError);
        console.error('❌ Access entries that failed:', JSON.stringify(accessEntries, null, 2));
        return NextResponse.json({ 
          error: `Course created but failed to assign to schools/grades: ${accessError.message}`,
          details: accessError,
          hint: accessError.code === '23503' ? 'One or more school IDs may not exist' : 
                accessError.code === '23505' ? 'Duplicate entry detected' : 
                'Check that all school IDs are valid and grades are properly formatted',
          course: course
        }, { status: 500 });
      } else {
        console.log(`✅ Created ${insertedAccess?.length || 0} course_access entries for course ${courseId}`);
        console.log('📋 Course access entries created:', JSON.stringify(insertedAccess, null, 2));
      }
    }

    // Create chapters
    let insertedChapters: any[] = [];
    if (chapters && chapters.length > 0) {
       
      const chaptersToInsert = chapters.map((chapter: any, index: number) => {
         
        const chapterData: any = {
          course_id: courseId,
          title: chapter.name || chapter.title || '',
          name: chapter.name || chapter.title || '',
          description: chapter.description || '',
          content: chapter.content || null, // Add content field
          learning_outcomes: chapter.learning_outcomes || [],
          order_index: chapter.order_number || chapter.order_index || index + 1,
          order_number: chapter.order_number || chapter.order_index || index + 1,
          release_date: chapter.release_date || null,
          is_published: true
        };
        
        // Include ID if provided AND it's a valid UUID
        // This prevents "invalid input syntax for type uuid" errors with temp IDs (e.g. "chapter-123")
        const isValidUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        
        if (chapter.id && typeof chapter.id === 'string' && isValidUuid(chapter.id)) {
          chapterData.id = chapter.id;
        }
        
        return chapterData;
      });

      const { data: insertedChaptersData, error: chaptersError } = await supabaseAdmin
        .from('chapters')
        .insert(chaptersToInsert)
         
        .select() as any;
      
      if (insertedChaptersData) {
        insertedChapters = insertedChaptersData;
      }

      if (chaptersError) {
        console.error('Error creating chapters:', chaptersError);
      } else {
        // Create videos, materials, and assignments for each chapter
        if (insertedChapters.length > 0) {
          // Process videos
          if (videos && videos.length > 0) {
            console.log(`📹 Processing ${videos.length} video(s) for course creation...`);
             
            const videosToInsert = videos.map((video: any) => {
               
              const chapter = insertedChapters.find((c: any) => c.order_index === (video.chapter_order || video.order_number) || c.id === video.chapter_id);
              if (!chapter) {
                console.warn(`⚠️ Could not find chapter for video "${video.title}" (chapter_id: ${video.chapter_id})`);
                return null;
              }
              return {
                chapter_id: chapter.id,
                title: video.title,
                video_url: video.video_url,
                duration: video.duration || null,
                uploaded_by: created_by
              };
            }).filter(Boolean);

            if (videosToInsert.length > 0) {
               
              console.log(`💾 Inserting ${videosToInsert.length} video(s) into database:`, videosToInsert.map((v: any) => ({
                title: v.title,
                chapter_id: v.chapter_id,
                video_url: v.video_url?.substring(0, 60) + '...'
              })));
              
              const { data: insertedVideos, error: videosError } = await supabaseAdmin
                .from('videos')
                .insert(videosToInsert)
                 
                .select() as any;
              
              if (videosError) {
                console.error('❌ Error creating videos:', videosError);
              } else {
                console.log(`✅ Successfully created ${insertedVideos?.length || 0} video(s) in database`);
                if (insertedVideos) {
                   
                  console.log('   Created videos:', insertedVideos.map((v: any) => ({
                    id: v.id,
                    title: v.title,
                    chapter_id: v.chapter_id,
                    video_url: v.video_url
                  })));
                }
              }
            } else {
              console.warn('⚠️ No valid videos to insert after filtering');
            }
          }

          // Process materials
          if (materials && materials.length > 0) {
             
            const materialsToInsert = materials.map((material: any) => {
               
              const chapter = insertedChapters.find((c: any) => c.order_index === (material.chapter_order || material.order_number) || c.id === material.chapter_id);
              if (!chapter) return null;
              return {
                chapter_id: chapter.id,
                title: material.title,
                file_url: material.file_url,
                file_type: material.file_type,
                uploaded_by: created_by
              };
            }).filter(Boolean);

            if (materialsToInsert.length > 0) {
              const { error: materialsError } = await supabaseAdmin
                .from('materials')
                .insert(materialsToInsert);
              if (materialsError) console.error('Error creating materials:', materialsError);
            }
          }

          // Process chapter contents (text, files, media) for richer experience
          const chapterContentsPayload = Array.isArray(chapter_contents) ? chapter_contents : [];

          const deriveChapterContentsFromLegacy = () => {
             
            const derived: any[] = [];
            if (videos && videos.length > 0) {
               
              videos.forEach((video: any, index: number) => {
                derived.push({
                  ...video,
                  chapter_id: video.chapter_id,
                  content_type: 'video_link',
                  title: video.title || `Video ${index + 1}`,
                  content_url: video.video_url,
                  order_index: video.order_index || index + 1,
                  duration_minutes: video.duration || null
                });
              });
            }
            if (materials && materials.length > 0) {
               
              materials.forEach((material: any, index: number) => {
                derived.push({
                  ...material,
                  chapter_id: material.chapter_id,
                  content_type: material.file_type === 'pdf' ? 'pdf' : 'file',
                  title: material.title || `Material ${index + 1}`,
                  content_url: material.file_url,
                  order_index: material.order_index || index + 1
                });
              });
            }
            return derived;
          };

          const allChapterContents = chapterContentsPayload.length > 0
            ? chapterContentsPayload
            : deriveChapterContentsFromLegacy();

          if (allChapterContents.length > 0) {
            console.log(`📦 Processing ${allChapterContents.length} chapter content item(s)...`);
            console.log(`📋 Available chapters:`, insertedChapters.map((ch: any) => ({ 
              id: ch.id, 
              name: ch.name || ch.title, 
              order_index: ch.order_index || ch.order_number 
            })));
             
            // Build a map of frontend chapter IDs to database chapter IDs
            // This helps when frontend sends UUIDs that match the database IDs OR when we need to map temp IDs
            const chapterIdMap = new Map<string, string>();
            
            // First, map by array index since insertedChapters corresponds 1:1 with chapters array
            chapters.forEach((frontendChapter: any, index: number) => {
              const frontendId = frontendChapter.id;
              const dbChapter = insertedChapters[index];
              
              if (dbChapter) {
                // Map by index (strongest link for creation)
                if (frontendId) {
                  chapterIdMap.set(String(frontendId).toLowerCase(), dbChapter.id);
                  // Also map the original string verbatim in case case sensitivity matters for some clients
                  chapterIdMap.set(String(frontendId), dbChapter.id);
                }
                
                // Map by order number/index
                const orderIndex = frontendChapter.order_number || frontendChapter.order_index || index + 1;
                chapterIdMap.set(String(orderIndex), dbChapter.id);
                chapterIdMap.set(String(index), dbChapter.id);
                
                // If the DB chapter has a different ID than frontend (e.g. temp ID replaced by UUID),
                // we've now successfully mapped the temp ID to the real UUID
              }
            });
            
            const resolveChapterId = (contentChapterId: any, contentOrderIndex?: number, contentTitle?: string) => {
              // First try: Match by exact ID (case-insensitive) - check both direct match and map
              if (contentChapterId) {
                const normalized = String(contentChapterId).toLowerCase();
                const raw = String(contentChapterId);
                
                // Check the map first (this covers temp IDs mapped to real IDs via index)
                if (chapterIdMap.has(normalized)) return chapterIdMap.get(normalized)!;
                if (chapterIdMap.has(raw)) return chapterIdMap.get(raw)!;
                
                // Direct match against inserted chapters (if ID was preserved)
                const match = insertedChapters.find((ch: any) => {
                  const chId = String(ch.id || '').toLowerCase();
                  return chId === normalized;
                });
                if (match) return match.id;
              }
              
              // Second try: Match by order_index (check map first, then direct)
              if (contentOrderIndex !== undefined && contentOrderIndex !== null) {
                const orderKey = String(contentOrderIndex);
                if (chapterIdMap.has(orderKey)) return chapterIdMap.get(orderKey)!;
                
                const matchByOrder = insertedChapters.find((ch: any) => 
                  ch.order_index === contentOrderIndex || ch.order_number === contentOrderIndex
                );
                if (matchByOrder) return matchByOrder.id;
              }
              
              // Fallback: Use first chapter
              if (insertedChapters.length > 0) {
                // Only warn if we actually had a specific target we failed to find
                if (contentChapterId || contentOrderIndex) {
                  console.warn(`⚠️ Could not resolve chapter ID for content (id: ${contentChapterId}, order: ${contentOrderIndex}), using first chapter`);
                }
                return insertedChapters[0].id;
              }
              
              return null;
            };

            const contentsToInsert = allChapterContents
              .map((content: any, index: number) => {
                const chapterId = resolveChapterId(
                  content.chapter_id, 
                  content.order_index || index + 1,
                  content.title
                );
                if (!chapterId) {
                  console.error('❌ Skipping chapter content - unable to resolve chapter ID', {
                    content_title: content.title,
                    content_chapter_id: content.chapter_id,
                    content_order_index: content.order_index,
                    available_chapters: insertedChapters.map((ch: any) => ({ id: ch.id, name: ch.name || ch.title }))
                  });
                  return null;
                }
                return {
                  id: content.id,
                  chapter_id: chapterId,
                  content_type: content.content_type || (content.file_type === 'pdf' ? 'pdf' : content.file_type ? 'file' : 'text'),
                  title: content.title || `Content item ${index + 1}`,
                  content_url: content.content_url || content.video_url || content.file_url || null,
                  content_text: content.content_text || null,
                  order_index: content.order_index || index + 1,
                  duration_minutes: content.duration_minutes || content.duration || null,
                  is_published: content.is_published ?? true,
                  storage_path: content.storage_path || null,
                  content_metadata: content.content_metadata || null,
                  thumbnail_url: content.thumbnail_url || null,
                  content_label: content.content_label || null
                };
              })
              .filter((content: any) => content !== null);

            if (contentsToInsert.length > 0) {
              console.log(`🧱 Inserting ${contentsToInsert.length} chapter content item(s) into database`);
              console.log(`📝 Contents to insert:`, contentsToInsert.map((c: any) => ({
                title: c.title,
                chapter_id: c.chapter_id,
                content_type: c.content_type,
                order_index: c.order_index
              })));
              
              const { data: insertedContents, error: contentsError } = await (supabaseAdmin
                .from('chapter_contents')
                .insert(contentsToInsert as any)
                .select() as any);
              
              if (contentsError) {
                console.error('❌ Error creating chapter contents:', contentsError);
                logger.error('Failed to insert chapter contents', {
                  endpoint: '/api/admin/courses',
                  courseId,
                  error: contentsError.message,
                  contentsCount: contentsToInsert.length
                });
              } else {
                console.log(`✅ Successfully inserted ${insertedContents?.length || 0} chapter content item(s)`);
                logger.info('Chapter contents inserted successfully', {
                  endpoint: '/api/admin/courses',
                  courseId,
                  contentsCount: insertedContents?.length || 0
                });
              }
            } else {
              console.warn('⚠️ No valid chapter contents to insert after filtering');
            }
          } else {
            console.log('ℹ️ No chapter contents to process');
          }

          // Process assignments with questions
          if (assignments && assignments.length > 0) {
            console.log(`📝 Processing ${assignments.length} assignment(s)...`);
            for (const assignment of assignments) {
              try {
                // Find the chapter for this assignment
                let chapterId: string | null = null;
                if (assignment.chapter_id) {
                  // Try to find chapter by ID or by order number
                   
                  const chapter = insertedChapters.find((c: any) => 
                    c.id === assignment.chapter_id || 
                    c.id === assignment.chapter_id?.toString() ||
                    c.order_index === parseInt(assignment.chapter_id) ||
                    c.order_number === parseInt(assignment.chapter_id)
                  );
                  
                  if (chapter) {
                    chapterId = chapter.id;
                    console.log(`✅ Found chapter for assignment: ${chapter.name} (${chapterId})`);
                  } else {
                     
                    console.warn(`⚠️ Chapter not found for assignment. chapter_id: ${assignment.chapter_id}, available chapters:`, insertedChapters.map((c: any) => ({ id: c.id, order: c.order_index || c.order_number })));
                    // Use first chapter as fallback if chapter_id doesn't match
                    if (insertedChapters.length > 0) {
                      chapterId = insertedChapters[0].id;
                      console.log(`⚠️ Using first chapter as fallback: ${insertedChapters[0].name} (${chapterId})`);
                    }
                  }
                } else if (insertedChapters.length > 0) {
                  // If no chapter_id specified, assign to first chapter
                  chapterId = insertedChapters[0].id;
                  console.log(`⚠️ No chapter_id specified, using first chapter: ${insertedChapters[0].name} (${chapterId})`);
                }

                if (!chapterId) {
                  console.error('❌ Cannot create assignment: No chapters available');
                  continue;
                }

                // Try to insert with course_id first (for newer schema), fallback to chapter_id
                 
                let insertedAssignment: any = null;
                 
                let assignmentError: any = null;

                // First try: course_id schema (with assignment_type, max_marks, is_published)
                 
                const assignmentDataWithCourseId: any = {
                  course_id: courseId,
                  chapter_id: chapterId, // Set chapter_id directly for easier querying
                  title: assignment.title,
                  description: assignment.description || null,
                  assignment_type: assignment.assignment_type || 'mcq',
                  max_marks: assignment.max_score || assignment.max_marks || 100,
                  is_published: true,
                  config: chapterId ? JSON.stringify({ chapter_id: chapterId, auto_grading_enabled: assignment.auto_grading_enabled || false }) : null,
                  created_by: created_by
                };

                const { data: assignmentWithCourseId, error: errorWithCourseId } = await supabaseAdmin
                  .from('assignments')
                  .insert(assignmentDataWithCourseId)
                  .select()
                   
                  .single() as any;

                if (!errorWithCourseId && assignmentWithCourseId) {
                  insertedAssignment = assignmentWithCourseId;
                  console.log(`✅ Assignment created with course_id schema: ${insertedAssignment.id}`);
                } else {
                  // Fallback: chapter_id schema (with max_score, auto_grading_enabled)
                  console.log('⚠️ course_id schema failed, trying chapter_id schema...', errorWithCourseId?.message);
                  
                   
                  const assignmentDataWithChapterId: any = {
                    chapter_id: chapterId,
                    title: assignment.title,
                    description: assignment.description || null,
                    auto_grading_enabled: assignment.auto_grading_enabled || false,
                    max_score: assignment.max_score || assignment.max_marks || 100,
                    created_by: created_by
                  };

                  const { data: assignmentWithChapterId, error: errorWithChapterId } = await supabaseAdmin
                    .from('assignments')
                    .insert(assignmentDataWithChapterId)
                    .select()
                     
                    .single() as any;

                  if (!errorWithChapterId && assignmentWithChapterId) {
                    insertedAssignment = assignmentWithChapterId;
                    console.log(`✅ Assignment created with chapter_id schema: ${insertedAssignment.id}`);
                  } else {
                    assignmentError = errorWithChapterId;
                    console.error('❌ Error creating assignment with both schemas:', {
                      course_id_error: errorWithCourseId?.message,
                      chapter_id_error: errorWithChapterId?.message
                    });
                  }
                }

                if (assignmentError || !insertedAssignment) {
                  console.error('❌ Failed to create assignment:', assignmentError);
                  continue;
                }

                // Insert assignment questions
                if (assignment.questions && assignment.questions.length > 0) {
                  console.log(`📋 Inserting ${assignment.questions.length} question(s) for assignment ${insertedAssignment.id}...`);
                  
                   
                  const questionsToInsert = assignment.questions.map((q: any) => ({
                    assignment_id: insertedAssignment.id,
                    question_type: q.question_type || 'MCQ',
                    question_text: q.question_text || '',
                    options: q.options && Array.isArray(q.options) ? q.options.filter((o: string) => o && o.trim()) : null,
                    correct_answer: q.correct_answer || '',
                    marks: q.marks || 1
                  }));

                  const { error: questionsError } = await supabaseAdmin
                    .from('assignment_questions')
                    .insert(questionsToInsert);
                  
                  if (questionsError) {
                    console.error('❌ Error creating assignment questions:', questionsError);
                    console.error('❌ Questions data:', JSON.stringify(questionsToInsert, null, 2));
                  } else {
                    console.log(`✅ Successfully created ${questionsToInsert.length} question(s) for assignment ${insertedAssignment.id}`);
                  }
                } else {
                  console.warn(`⚠️ Assignment ${insertedAssignment.id} has no questions`);
                }
               
              } catch (error: any) {
                logger.warn('Exception while processing assignment (non-critical)', {
                  endpoint: '/api/admin/courses',
                  assignmentId: assignment.id,
                }, error instanceof Error ? error : new Error(String(error)));
                continue;
              }
            }
            console.log(`✅ Finished processing assignments`);
          } else {
            console.log('ℹ️ No assignments to process');
          }

          // Create course schedules
          if (scheduling && scheduling.release_type && insertedChapters.length > 0) {
             
            const schedulesToInsert = insertedChapters.map((chapter: any, index: number) => {
              const startDate = scheduling.start_date 
                ? new Date(scheduling.start_date) 
                : new Date();
              
              const releaseDate = new Date(startDate);
              
              // Calculate release date based on release type
              if (scheduling.release_type === 'Daily') {
                releaseDate.setDate(startDate.getDate() + index);
              } else if (scheduling.release_type === 'Weekly') {
                releaseDate.setDate(startDate.getDate() + (index * 7));
              } else if (scheduling.release_type === 'Bi-weekly') {
                releaseDate.setDate(startDate.getDate() + (index * 14));
              }

              const nextRelease = new Date(releaseDate);
              if (scheduling.release_type === 'Daily') {
                nextRelease.setDate(releaseDate.getDate() + 1);
              } else if (scheduling.release_type === 'Weekly') {
                nextRelease.setDate(releaseDate.getDate() + 7);
              } else if (scheduling.release_type === 'Bi-weekly') {
                nextRelease.setDate(releaseDate.getDate() + 14);
              }

              return {
                course_id: courseId,
                chapter_id: chapter.id,
                release_type: scheduling.release_type,
                release_date: releaseDate.toISOString(),
                next_release: nextRelease.toISOString()
              };
            });

            const { error: schedulesError } = await supabaseAdmin
              .from('course_schedules')
              .insert(schedulesToInsert);
            if (schedulesError) console.error('Error creating course schedules:', schedulesError);
          }
        }
      }
    }

    // Update course totals after all content is saved
    if (insertedChapters && insertedChapters.length > 0) {
      const chapterIds = insertedChapters.map((ch: any) => ch.id);
      
      // Count content
      const [
        { count: videosCount },
        { count: materialsCount },
        { count: contentsCount },
        { count: assignmentsCount }
      ] = await Promise.all([
        supabaseAdmin
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('chapter_contents')
          .select('id', { count: 'exact', head: true })
          .in('chapter_id', chapterIds),
        supabaseAdmin
          .from('assignments')
          .select('id', { count: 'exact', head: true })
          .eq('course_id', courseId)
      ]);

      // Update course with accurate totals
      await supabaseAdmin
        .from('courses')
        .update({
          num_chapters: insertedChapters.length,
          total_chapters: insertedChapters.length,
          total_videos: videosCount || 0,
          total_materials: materialsCount || 0,
          total_assignments: assignmentsCount || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', courseId);
      
      console.log(`✅ Updated course totals:`, {
        chapters: insertedChapters.length,
        videos: videosCount || 0,
        materials: materialsCount || 0,
        assignments: assignmentsCount || 0
      });
    }

    // Fetch the created course with relationships
    // Try to fetch with all fields, but fallback to basic fields if difficulty_level doesn't exist yet
    let createdCourse: any = null;
    let fetchError: any = null;
    
    // First try with all fields including difficulty_level
    const fetchQuery = supabaseAdmin
      .from('courses')
      .select(`
        id, course_name, name, title, description, status, is_published, num_chapters, content_summary, 
        created_by, created_at, updated_at, thumbnail_url, duration_weeks, prerequisites_course_ids, 
        prerequisites_text, difficulty_level,
        course_access (
          id, course_id, school_id, grade,
          schools (
            id,
            name
          )
        ),
        chapters (
          id, course_id, name, description, learning_outcomes, order_number, order_index, release_date, created_at
        )
      `)
      .eq('id', courseId)
      .single() as any;
    
    const fetchResult = await fetchQuery;
    fetchError = fetchResult.error;
    
    // If fetch failed and error mentions difficulty_level, try without it
    if (fetchError && (fetchError.message?.includes('difficulty_level') || fetchError.message?.includes('column') || fetchError.code === '42703')) {
      console.warn('⚠️ difficulty_level column may not exist yet, retrying without it:', fetchError.message);
      const fallbackQuery = supabaseAdmin
        .from('courses')
        .select(`
          id, course_name, name, title, description, status, is_published, num_chapters, content_summary, 
          created_by, created_at, updated_at, thumbnail_url, duration_weeks, prerequisites_course_ids, 
          prerequisites_text,
          course_access (
            id, course_id, school_id, grade,
            schools (
              id,
              name
            )
          ),
          chapters (
            id, course_id, name, description, learning_outcomes, order_number, order_index, release_date, created_at
          )
        `)
        .eq('id', courseId)
        .single() as any;
      
      const fallbackResult = await fallbackQuery;
      if (!fallbackResult.error) {
        createdCourse = { ...fallbackResult.data, difficulty_level: courseData.difficulty_level || 'Beginner' };
        fetchError = null;
      } else {
        fetchError = fallbackResult.error;
      }
    } else if (!fetchError) {
      createdCourse = fetchResult.data;
    }

    if (fetchError) {
      console.warn('⚠️ Warning: Could not fetch created course details:', fetchError.message);
      console.log('📝 Using course data from insert result instead');
      // Use the course from insert result, but ensure it has the courseId and all fields
      createdCourse = { 
        ...course, 
        id: courseId,
        difficulty_level: courseData.difficulty_level || 'Beginner',
        thumbnail_url: courseData.thumbnail_url || null,
        duration_weeks: courseData.duration_weeks || null,
        prerequisites_course_ids: courseData.prerequisites_course_ids || null,
        prerequisites_text: courseData.prerequisites_text || null,
      };
    }

    logger.info('Course created successfully', {
      endpoint: '/api/admin/courses',
      courseId: createdCourse?.id || course?.id,
      hasFetchedCourse: !!createdCourse,
      fetchError: fetchError?.message,
    });

    const successResponse = NextResponse.json({ 
      course: createdCourse || { ...course, id: courseId },
      message: 'Course created successfully'
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
   
  } catch (error: any) {
    logger.error('Unexpected error in POST /api/admin/courses', {
      endpoint: '/api/admin/courses',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(updateCourseSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for course update', {
        endpoint: '/api/admin/courses',
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

    const { id, ...updateData } = { ...validation.data, ...body };

    if (!id) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 });
    }

     
    const { data: course, error } = await ((supabaseAdmin as any)
      .from('courses')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
       
      } as any)
      .eq('id', id)
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('Failed to update course', {
        endpoint: '/api/admin/courses',
        courseId: id,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/courses', courseId: id },
        'Failed to update course'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Course updated successfully', {
      endpoint: '/api/admin/courses',
      courseId: id,
    });

    const successResponse = NextResponse.json({ course });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/courses', {
      endpoint: '/api/admin/courses',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting course:', error);
      return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
    }

    logger.info('Course deleted successfully', {
      endpoint: '/api/admin/courses',
      method: 'DELETE',
      courseId: id,
    });

    return NextResponse.json({ message: 'Course deleted successfully' });
  } catch (error) {
    const { searchParams: errorSearchParams } = new URL(request.url);
    const errorId = errorSearchParams.get('id');
    logger.error('Unexpected error in DELETE /api/admin/courses', {
      endpoint: '/api/admin/courses',
      method: 'DELETE',
      courseId: errorId || 'unknown',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses', method: 'DELETE', courseId: errorId || 'unknown' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
