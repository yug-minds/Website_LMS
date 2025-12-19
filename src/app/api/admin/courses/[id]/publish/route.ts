import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../../../lib/auth-utils';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { publishCourseSchema, validateRequestBody } from '../../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../../lib/logger';
import { z } from 'zod';
// Type definitions
interface Chapter {
  id: string;
  name?: string;
  title?: string;
  order_index?: number;
}

interface CourseData {
  id: string;
  course_name?: string;
  name?: string;
  title?: string;
  description?: string;
  subject?: string;
  grade?: string;
  status?: string;
  is_published?: boolean;
  school_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  chapters?: Chapter[];
}

interface CourseAccess {
  school_id: string | null;
  grade: string | null;
}

// Enrollments/auto-enrollment feature removed

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return (adminCheck as { success: false; response: NextResponse }).response;
  }

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
    // Handle params - in Next.js 15, params might be a Promise
    const resolvedParams = params instanceof Promise ? await params : params;
    const courseId = resolvedParams.id;

    logger.info('Publish course request received', {
      endpoint: '/api/admin/courses/[id]/publish',
      courseId,
      paramsType: typeof params,
      resolvedParams,
    });

    if (!courseId) {
      logger.error('Course ID missing in publish request', {
        endpoint: '/api/admin/courses/[id]/publish',
        params: resolvedParams,
        rawParams: params,
      });
      return NextResponse.json(
        { error: 'Course ID is required', details: 'No course ID found in request parameters' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validation = validateRequestBody(publishCourseSchema, {
      ...body,
      course_id: courseId,
    });
    if (!validation.success) {
      const errorMessages = ('details' in validation ? validation.details?.issues?.map((e: z.ZodIssue) => 
        `${e.path.filter((p): p is string | number => typeof p !== 'symbol').join('.')}: ${e.message}`
      ).join(', ') : null) || ('error' in validation ? validation.error : null) || 'Invalid request data';
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { publish, changes_summary } = validation.data;

    // Get current user ID for version tracking
    const authHeader = request.headers.get('authorization');
    const publishedBy = authHeader ? authHeader.replace('Bearer ', '') : null;

    // Get current course data with chapters - try multiple column names for course name
    logger.info('Fetching course from database', {
      endpoint: '/api/admin/courses/[id]/publish',
      courseId,
      queryType: 'single',
    });

    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select(`
        id,
        course_name,
        name,
        title,
        description,
        subject,
        grade,
        status,
        is_published,
        school_id,
        created_by,
        created_at,
        updated_at,
        chapters (
          id,
          name,
          title,
          order_index
        )
      `)
      .eq('id', courseId)
      .single();

    logger.info('Course query result', {
      endpoint: '/api/admin/courses/[id]/publish',
      courseId,
      hasCourse: !!course,
      hasError: !!courseError,
      errorCode: courseError?.code,
      errorMessage: courseError?.message,
      courseName: course?.course_name || course?.name || course?.title,
    });

    let finalCourse = course;
    
    if (courseError || !course) {
      logger.error('Error fetching course for publish', {
        endpoint: '/api/admin/courses/[id]/publish',
        courseId,
        error: courseError?.message,
        errorCode: courseError?.code,
        hasCourse: !!course,
      });
      
      // Try alternative query without nested select to see if course exists
      const { data: courseCheck, error: checkError } = await supabaseAdmin
        .from('courses')
        .select('id, course_name, name, title')
        .eq('id', courseId)
        .maybeSingle();
      
      if (checkError || !courseCheck) {
        // Check if it's a "not found" error
        if (courseError?.code === 'PGRST116' || courseError?.message?.includes('No rows returned') || courseError?.message?.includes('JSON object requested, multiple')) {
          return NextResponse.json(
            { 
              error: 'Course not found',
              details: `Course with ID ${courseId} does not exist in the database. Please verify the course ID is correct.`,
              courseId,
              hint: 'The course may have been deleted or the ID is incorrect'
            },
            { status: 404 }
          );
        }
        
        return NextResponse.json(
          { 
            error: 'Failed to fetch course',
            details: courseError?.message || 'Database error occurred',
            courseId,
            errorCode: courseError?.code
          },
          { status: 500 }
        );
      }
      
      // If alternative query worked, use that result
      logger.warn('Initial query failed but course exists, retrying with simpler query', {
        endpoint: '/api/admin/courses/[id]/publish',
        courseId,
      });
      
      // Retry with simpler query
      const { data: courseRetry, error: retryError } = await supabaseAdmin
        .from('courses')
        .select('id, course_name, name, title, description, subject, grade, status, is_published, school_id, created_by, created_at, updated_at')
        .eq('id', courseId)
        .single();
      
      if (retryError || !courseRetry) {
        return NextResponse.json(
          { 
            error: 'Course not found',
            details: `Course with ID ${courseId} could not be retrieved`,
            courseId 
          },
          { status: 404 }
        );
      }
      
      // Get chapters separately
      const { data: chaptersData } = await supabaseAdmin
        .from('chapters')
        .select('id, name, title, order_index')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });
      
      // Combine results
      finalCourse = { ...courseRetry, chapters: chaptersData || [] };
    }

    if (!finalCourse) {
      logger.warn('Course not found (null result)', {
        endpoint: '/api/admin/courses/[id]/publish',
        courseId,
      });
      return NextResponse.json(
        { 
          error: 'Course not found',
          details: `Course with ID ${courseId} does not exist`,
          courseId 
        },
        { status: 404 }
      );
    }
    
    // Use finalCourse for the rest of the function
    const courseToPublish = finalCourse;

    // Validate course has content before publishing
    if (publish) {
      const chapters = (courseToPublish as CourseData).chapters || [];
      if (chapters.length === 0) {
        return NextResponse.json(
          { 
            error: 'Cannot publish course',
            details: 'Course must have at least one chapter before publishing',
          },
          { status: 400 }
        );
      }

      // Check if chapters have content
      const chapterIds = chapters.map((ch: Chapter) => ch.id);
      const [
        { data: contentsData },
        { data: videosData },
        { data: materialsData },
        { data: assignmentsData }
      ] = await Promise.all([
        supabaseAdmin
          .from('chapter_contents')
          .select('id')
          .in('chapter_id', chapterIds)
          .limit(1),
        supabaseAdmin
          .from('videos')
          .select('id')
          .in('chapter_id', chapterIds)
          .limit(1),
        supabaseAdmin
          .from('materials')
          .select('id')
          .in('chapter_id', chapterIds)
          .limit(1),
        supabaseAdmin
          .from('assignments')
          .select('id')
          .eq('course_id', courseId)
          .limit(1)
      ]);

      const hasContent = 
        (contentsData && contentsData.length > 0) ||
        (videosData && videosData.length > 0) ||
        (materialsData && materialsData.length > 0) ||
        (assignmentsData && assignmentsData.length > 0);

      if (!hasContent) {
        logger.warn('Attempt to publish course without content', {
          endpoint: '/api/admin/courses/[id]/publish',
          courseId,
          chaptersCount: chapters.length,
        });
        
        return NextResponse.json(
          { 
            error: 'Cannot publish course',
            details: 'Course must have at least one piece of content (videos, materials, assignments, or chapter contents) before publishing',
            hint: 'Please add content to your chapters before publishing',
          },
          { status: 400 }
        );
      }
    }

    // Check course_access to see which schools/grades are assigned
    const { data: courseAccess, error: accessError } = await supabaseAdmin
      .from('course_access')
      .select('school_id, grade')
      .eq('course_id', courseId);

    if (accessError) {
      logger.warn('Error fetching course_access (non-critical)', {
        endpoint: '/api/admin/courses/[id]/publish',
        courseId,
        error: accessError.message,
      });
    }

    const assignedSchools = courseAccess?.map((ca: CourseAccess) => ca.school_id).filter(Boolean) || [];
    const assignedGrades = courseAccess?.map((ca: CourseAccess) => ca.grade).filter(Boolean) || [];

    logger.info('Publishing course', {
      endpoint: '/api/admin/courses/[id]/publish',
      courseId,
      courseName: courseToPublish.course_name || courseToPublish.name || courseToPublish.title,
      publish,
      assignedSchoolsCount: assignedSchools.length,
      assignedGradesCount: assignedGrades.length,
      assignedGrades: assignedGrades,
    });

    // Update course status
    const updateData: {
      status: string;
      is_published: boolean;
      updated_at: string;
    } = {
      status: publish ? 'Published' : 'Draft',
      is_published: publish,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedCourse, error: updateError } = await supabaseAdmin
      .from('courses')
      .update(updateData)
      .eq('id', courseId)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update course publish status', {
        endpoint: '/api/admin/courses/[id]/publish',
        courseId,
        error: updateError.message,
        errorCode: updateError.code,
      }, updateError);
      
      const errorInfo = await handleApiError(
        updateError,
        { endpoint: '/api/admin/courses/[id]/publish', courseId },
        'Failed to update course publish status'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // If publishing, create a version record
    if (publish) {
      try {
        // Get next version number
        const { data: maxVersion } = await supabaseAdmin
          .from('course_versions')
          .select('version_number')
          .eq('course_id', courseId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single();

        const nextVersion = maxVersion?.version_number 
          ? maxVersion.version_number + 1 
          : 1;

        // Create version record with course data snapshot
        const { error: versionError } = await supabaseAdmin
          .from('course_versions')
          .insert({
            course_id: courseId,
            version_number: nextVersion,
            published_at: new Date().toISOString(),
            published_by: publishedBy,
            changes_summary: changes_summary || null,
            course_data: updatedCourse,
          });

        if (versionError) {
          logger.warn('Failed to create version record (non-critical)', {
            endpoint: '/api/admin/courses/[id]/publish',
            courseId,
          }, versionError);
          // Don't fail the publish if version creation fails
        }
      } catch (versionErr) {
        logger.warn('Error creating version record (non-critical)', {
          endpoint: '/api/admin/courses/[id]/publish',
          courseId,
        }, versionErr instanceof Error ? versionErr : new Error(String(versionErr)));
        // Continue even if version creation fails
      }
    }

    logger.info('Course publish status updated', {
      endpoint: '/api/admin/courses/[id]/publish',
      courseId,
      publish,
      courseName: updatedCourse?.course_name || updatedCourse?.name || updatedCourse?.title,
      assignedSchools: assignedSchools.length,
      assignedGrades: assignedGrades,
    });

    return NextResponse.json({
      success: true,
      course: updatedCourse,
      message: publish ? 'Course published successfully' : 'Course unpublished successfully',
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/courses/[id]/publish', {
      endpoint: '/api/admin/courses/[id]/publish',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/courses/[id]/publish' },
      'Failed to update publish status'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

