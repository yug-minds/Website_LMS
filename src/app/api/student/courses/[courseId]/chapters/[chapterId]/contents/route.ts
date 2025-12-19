import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../../../../../lib/logger';
import { supabaseAdmin } from '../../../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../../../../../lib/csrf-middleware';

// GET - Get contents for a chapter (with access verification)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; chapterId: string }> }
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

    const { courseId, chapterId } = await params;

    if (!courseId || !chapterId) {
      return NextResponse.json(
        { error: 'Course ID and Chapter ID are required' },
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
          endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
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
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
      }, authException instanceof Error ? authException : new Error(String(authException)));
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Verify chapter exists and belongs to the course
    const { data: chapter, error: chapterError } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id, name, title, is_published')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      logger.warn('Chapter not found', {
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
        chapterId,
        courseId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Chapter not found', details: 'The requested chapter does not exist' },
        { status: 404 }
      );
    }

    if (chapter.course_id !== courseId) {
      logger.warn('Chapter does not belong to course', {
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
        chapterId,
        courseId,
        actualCourseId: chapter.course_id,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Invalid chapter', details: 'Chapter does not belong to the specified course' },
        { status: 400 }
      );
    }

    if (!chapter.is_published) {
      logger.warn('Chapter not published', {
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
        chapterId,
        courseId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Chapter not available', details: 'This chapter is not yet published' },
        { status: 403 }
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
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
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
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
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
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
        courseId,
        chapterId,
        userId: user.id,
        hasEnrollment: !!enrollment,
      });
      return NextResponse.json(
        { 
          error: 'Access denied', 
          details: 'You do not have access to this course content. Please contact your administrator to enroll you.',
          code: 'NO_ACCESS'
        },
        { status: 403 }
      );
    }

    // Fetch from ALL sources: chapter_contents, videos, materials, and assignments
    const allContents: any[] = [];

    // 1. Fetch from chapter_contents table
    const { data: contents, error: contentsError } = await supabaseAdmin
      .from('chapter_contents')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('is_published', true)
      .order('order_index', { ascending: true });

    if (contentsError) {
      logger.error('Error fetching chapter contents', {
        endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
        chapterId,
        courseId,
        userId: user.id,
      }, contentsError instanceof Error ? contentsError : new Error(String(contentsError)));
    } else if (contents) {
      const normalizedContents = contents.map((content: any) => ({
        ...content,
        content_type: (content.content_type || '').toLowerCase(),
        title: content.title || content.name || 'Untitled',
        content_url: content.content_url || content.url,
        content_text: content.content_text || content.text || content.description,
        order_index: content.order_index || content.order_number || 0,
        source: 'chapter_contents',
      }));
      allContents.push(...normalizedContents);
    }

    // 2. Fetch from videos table
    const { data: videos, error: videosError } = await supabaseAdmin
      .from('videos')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('is_published', true)
      .order('order_index', { ascending: true });

    if (!videosError && videos) {
      const normalizedVideos = videos.map((video: any) => ({
        id: video.id,
        chapter_id: video.chapter_id,
        content_type: 'video',
        title: video.title || 'Untitled Video',
        content_url: video.video_url || video.content_url,
        order_index: video.order_index || 0,
        duration_minutes: video.duration || video.duration_minutes,
        source: 'videos',
        created_at: video.created_at,
        updated_at: video.updated_at,
      }));
      allContents.push(...normalizedVideos);
    }

    // 3. Fetch from materials table
    const { data: materials, error: materialsError } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('is_published', true)
      .order('order_index', { ascending: true });

    if (!materialsError && materials) {
      const normalizedMaterials = materials.map((material: any) => ({
        id: material.id,
        chapter_id: material.chapter_id,
        content_type: material.file_type === 'pdf' ? 'pdf' : 'file',
        title: material.title || 'Untitled Material',
        content_url: material.file_url || material.content_url,
        file_type: material.file_type,
        order_index: material.order_index || 0,
        source: 'materials',
        created_at: material.created_at,
        updated_at: material.updated_at,
      }));
      allContents.push(...normalizedMaterials);
    }

    // 4. Fetch from assignments table
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from('assignments')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('is_published', true)
      .order('created_at', { ascending: true });

    if (!assignmentsError && assignments) {
      const normalizedAssignments = assignments.map((assignment: any, index: number) => ({
        id: assignment.id,
        chapter_id: assignment.chapter_id,
        content_type: 'assignment',
        title: assignment.title || 'Untitled Assignment',
        content_text: assignment.description || '',
        order_index: assignment.order_index || index + 1000,
        max_score: assignment.max_score,
        auto_grading_enabled: assignment.auto_grading_enabled,
        source: 'assignments',
        created_at: assignment.created_at,
      }));
      allContents.push(...normalizedAssignments);
    }

    // Sort all contents by order_index
    allContents.sort((a: any, b: any) => {
      const orderA = a.order_index || 0;
      const orderB = b.order_index || 0;
      if (orderA !== orderB) return orderA - orderB;
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateA - dateB;
    });

    // Fetch student progress for contents
    const { data: progress } = await supabaseAdmin
      .from('student_progress')
      .select('content_id, is_completed')
      .eq('student_id', user.id)
      .eq('chapter_id', chapterId);

    const progressMap = new Map<string, { content_id: string; is_completed: boolean }>(
      (progress || []).map((p: any) => [p.content_id, p])
    );

    // Enhance all contents with progress
    const contentsWithProgress = allContents.map((content: any) => {
      const contentProgress: { content_id: string; is_completed: boolean } | undefined = progressMap.get(content.id);
      return {
        ...content,
        is_completed: contentProgress?.is_completed || false,
      };
    });

    // Log what we're returning for debugging
    logger.info('Returning chapter contents', {
      endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
      chapterId,
      courseId,
      totalContents: contentsWithProgress.length,
      contentTypes: contentsWithProgress.map((c: any) => ({
        id: c.id,
        title: c.title,
        type: c.content_type,
        source: c.source
      }))
    });

    const response = NextResponse.json({
      contents: contentsWithProgress,
      chapter_id: chapterId,
      course_id: courseId,
      total_contents: contentsWithProgress.length,
    });

    ensureCsrfToken(response, request);
    return response;

  } catch (error) {
    logger.error('Unexpected error in GET /api/student/courses/[courseId]/chapters/[chapterId]/contents', {
      endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/student/courses/[courseId]/chapters/[chapterId]/contents' },
      'Failed to fetch contents'
    );
    
    const response = NextResponse.json(errorInfo, { status: errorInfo.status });
    ensureCsrfToken(response, request);
    return response;
  }
}

