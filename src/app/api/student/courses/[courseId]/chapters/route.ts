import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../../../lib/logger';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../../../lib/csrf-middleware';

// GET - Get chapters for a course (with access verification)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
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

    const { courseId } = await params;

    if (!courseId) {
      return NextResponse.json(
        { error: 'Course ID is required' },
        { status: 400 }
      );
    }

    // Get the authenticated user from the request
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'No authentication token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify the token and get user
    let user;
    try {
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !authUser) {
        logger.warn('Authentication failed', {
          endpoint: '/api/student/courses/[courseId]/chapters',
          hasError: !!authError,
          errorMessage: authError?.message,
        });
        return NextResponse.json(
          { error: 'Unauthorized', details: 'Invalid authentication token' },
          { status: 401 }
        );
      }
      
      user = authUser;
    } catch (authException) {
      logger.error('Exception during authentication', {
        endpoint: '/api/student/courses/[courseId]/chapters',
      }, authException instanceof Error ? authException : new Error(String(authException)));
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Verify course exists and is published
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id, name, course_name, is_published, status')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      logger.warn('Course not found', {
        endpoint: '/api/student/courses/[courseId]/chapters',
        courseId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Course not found', details: 'The requested course does not exist' },
        { status: 404 }
      );
    }

    if (!course.is_published && course.status !== 'Published') {
      logger.warn('Course not published', {
        endpoint: '/api/student/courses/[courseId]/chapters',
        courseId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Course not available', details: 'This course is not yet published' },
        { status: 403 }
      );
    }

    // Check student access (enrollment or course_access)
    const { data: enrollment } = await supabaseAdmin
      .from('enrollments')
      .select('id, status')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .maybeSingle();

    // If no enrollment, check course_access
    let hasAccess = !!enrollment;
    
    if (!hasAccess) {
      const { data: studentSchool } = await supabaseAdmin
        .from('student_schools')
        .select('school_id, grade')
        .eq('student_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (studentSchool?.school_id && studentSchool?.grade) {
        const { data: courseAccess } = await supabaseAdmin
          .from('course_access')
          .select('id')
          .eq('course_id', courseId)
          .eq('school_id', studentSchool.school_id)
          .eq('grade', studentSchool.grade)
          .maybeSingle();

        hasAccess = !!courseAccess;

        // If exact match failed, try normalized match
        if (!hasAccess) {
          const { data: allCourseAccess } = await supabaseAdmin
            .from('course_access')
            .select('id, grade')
            .eq('course_id', courseId)
            .eq('school_id', studentSchool.school_id);

          if (allCourseAccess && allCourseAccess.length > 0) {
            // Normalize grades for comparison
            const normalizeGrade = (g: string) => 
              g.toLowerCase().trim().replace(/^grade\s*/i, '').replace(/grade/i, '');
            
            const studentGradeNormalized = normalizeGrade(studentSchool.grade);
            hasAccess = allCourseAccess.some((ca: { id: string; grade: string }) => 
              normalizeGrade(ca.grade) === studentGradeNormalized
            );
          }
        }
      }
    }

    if (!hasAccess) {
      logger.warn('Student does not have access to course', {
        endpoint: '/api/student/courses/[courseId]/chapters',
        courseId,
        userId: user.id,
        hasEnrollment: !!enrollment,
      });
      return NextResponse.json(
        { 
          error: 'Access denied', 
          details: 'You do not have access to this course. Please contact your administrator to enroll you.',
          code: 'NO_ACCESS'
        },
        { status: 403 }
      );
    }

    // Fetch chapters with progress information
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id, name, title, description, order_index, order_number, is_published, created_at, updated_at')
      .eq('course_id', courseId)
      .eq('is_published', true)
      .order('order_number', { ascending: true, nullsFirst: false })
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (chaptersError) {
      logger.error('Error fetching chapters', {
        endpoint: '/api/student/courses/[courseId]/chapters',
        courseId,
        userId: user.id,
      }, chaptersError instanceof Error ? chaptersError : new Error(String(chaptersError)));
      
      return NextResponse.json(
        { error: 'Failed to fetch chapters', details: chaptersError.message },
        { status: 500 }
      );
    }

    // Fetch student progress for chapters
    const { data: progress } = await supabaseAdmin
      .from('course_progress')
      .select('chapter_id, completed, progress_percent')
      .eq('student_id', user.id)
      .eq('course_id', courseId);

    type ChapterProgress = {
      chapter_id: string
      completed: boolean
      progress_percent: number
    }
    const progressMap = new Map<string, ChapterProgress>(
      (progress || []).map((p: ChapterProgress) => [p.chapter_id, p])
    );

    // Enhance chapters with progress information
    const chaptersWithProgress = (chapters || []).map((chapter: any) => {
      const chapterProgress: ChapterProgress | undefined = progressMap.get(chapter.id);
      
      // Use actual progress data - only mark as completed if progress exists and is marked as completed
      const isCompleted = chapterProgress?.completed === true;
      const progressPercent = chapterProgress?.progress_percent || 0;
      
      return {
        ...chapter,
        is_completed: isCompleted,
        progress_percent: isCompleted ? 100 : progressPercent,
        is_unlocked: true, // All published chapters are unlocked for now
      };
    });

    const response = NextResponse.json({
      chapters: chaptersWithProgress,
      course_id: courseId,
      total_chapters: chaptersWithProgress.length,
    });

    ensureCsrfToken(response, request);
    return response;

  } catch (error) {
    logger.error('Unexpected error in GET /api/student/courses/[courseId]/chapters', {
      endpoint: '/api/student/courses/[courseId]/chapters',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/student/courses/[courseId]/chapters' },
      'Failed to fetch chapters'
    );
    
    const response = NextResponse.json(errorInfo, { status: errorInfo.status });
    ensureCsrfToken(response, request);
    return response;
  }
}

