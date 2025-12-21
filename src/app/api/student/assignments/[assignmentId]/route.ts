import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../../lib/logger';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await params;

  try {
    // 1. Rate Limiting
    const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests', message: `Rate limit exceeded. Retry in ${rateLimitResult.retryAfter}s.` },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    // 2. Authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'No token' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      logger.warn('Auth failed', { endpoint: 'GET assignment', error: authError?.message });
      return NextResponse.json({ error: 'Unauthorized', details: 'Invalid token' }, { status: 401 });
    }

    // 3. Fetch Assignment
    logger.info('Fetching assignment', {
      endpoint: 'GET assignment',
      assignmentId,
      userId: user.id
    });

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('is_published', true)
      .maybeSingle();

    if (assignmentError) {
      logger.error('Error fetching assignment', {
        endpoint: 'GET assignment',
        assignmentId,
        userId: user.id,
        error: assignmentError
      });
      return NextResponse.json({ 
        error: 'Failed to fetch assignment', 
        details: assignmentError.message || 'Database error',
        code: assignmentError.code
      }, { status: 500 });
    }
    
    if (!assignment) {
      logger.warn('Assignment not found', {
        endpoint: 'GET assignment',
        assignmentId,
        userId: user.id
      });
      return NextResponse.json({ 
        error: 'Assignment not found',
        details: `Assignment with ID ${assignmentId} does not exist or is not published`
      }, { status: 404 });
    }
    
    logger.info('Assignment found', {
      endpoint: 'GET assignment',
      assignmentId,
      courseId: assignment.course_id,
      title: assignment.title,
      isPublished: assignment.is_published
    });

    // 4. Access Check (Simplified for robustness)
    let hasAccess = false;

    // If assignment has course_id, check access via course
    if (assignment.course_id) {
      // Check enrollment
      const { data: enrollment } = await supabaseAdmin
        .from('enrollments')
        .select('id')
        .eq('student_id', user.id)
        .eq('course_id', assignment.course_id)
        .eq('status', 'active')
        .maybeSingle();

      if (enrollment) {
        hasAccess = true;
        logger.info('Access granted via enrollment', {
          endpoint: 'GET assignment',
          assignmentId,
          courseId: assignment.course_id,
          enrollmentId: enrollment.id
        });
      } else {
        // Check school mapping via course_access
        const { data: studentSchool } = await supabaseAdmin
          .from('student_schools')
          .select('school_id, grade')
          .eq('student_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (studentSchool) {
          // Try exact match first
          const { data: accessExact } = await supabaseAdmin
            .from('course_access')
            .select('id')
            .eq('course_id', assignment.course_id)
            .eq('school_id', studentSchool.school_id)
            .eq('grade', studentSchool.grade)
            .maybeSingle();

          if (accessExact) {
            hasAccess = true;
            logger.info('Access granted via course_access (exact match)', {
              endpoint: 'GET assignment',
              assignmentId,
              courseId: assignment.course_id,
              schoolId: studentSchool.school_id,
              grade: studentSchool.grade
            });
          } else {
            // Try normalized grade match
            const { data: accessList } = await supabaseAdmin
              .from('course_access')
              .select('id, grade')
              .eq('course_id', assignment.course_id)
              .eq('school_id', studentSchool.school_id);

            if (accessList && accessList.length > 0) {
              const normalizeGrade = (g: string) => 
                g.toLowerCase().trim().replace(/^grade\s*/i, '').replace(/grade/i, '');
              
              const studentGradeNormalized = normalizeGrade(studentSchool.grade);
              const hasMatch = accessList.some((ca: any) => {
                const accessGradeNormalized = normalizeGrade(ca.grade);
                return accessGradeNormalized === studentGradeNormalized;
              });

              if (hasMatch) {
                hasAccess = true;
                logger.info('Access granted via course_access (normalized match)', {
                  endpoint: 'GET assignment',
                  assignmentId,
                  courseId: assignment.course_id,
                  schoolId: studentSchool.school_id,
                  studentGrade: studentSchool.grade
                });
              }
            }
          }
        }
      }
    } else if (assignment.chapter_id) {
      // If assignment only has chapter_id, check access via chapter's course
      const { data: chapter } = await supabaseAdmin
        .from('chapters')
        .select('course_id')
        .eq('id', assignment.chapter_id)
        .maybeSingle();

      if (chapter?.course_id) {
        // Check enrollment for the chapter's course
        const { data: enrollment } = await supabaseAdmin
          .from('enrollments')
          .select('id')
          .eq('student_id', user.id)
          .eq('course_id', chapter.course_id)
          .eq('status', 'active')
          .maybeSingle();

        if (enrollment) {
          hasAccess = true;
          logger.info('Access granted via chapter enrollment', {
            endpoint: 'GET assignment',
            assignmentId,
            chapterId: assignment.chapter_id,
            courseId: chapter.course_id
          });
        }
      }
    } else {
      // If assignment has neither course_id nor chapter_id, grant access (legacy assignments)
      hasAccess = true;
      logger.info('Access granted (assignment without course/chapter - legacy)', {
        endpoint: 'GET assignment',
        assignmentId
      });
    }

    if (!hasAccess) {
      logger.warn('Access denied to assignment', {
        endpoint: 'GET assignment',
        assignmentId,
        userId: user.id,
        courseId: assignment.course_id,
        chapterId: assignment.chapter_id
      });
      return NextResponse.json({ 
        error: 'Access denied',
        details: 'You do not have access to this assignment. Please ensure you are enrolled in the course.',
        code: 'NO_ACCESS'
      }, { status: 403 });
    }

    // 5. Fetch Questions (Standardized)
    let questions = [];
    const { data: dbQuestions } = await supabaseAdmin
      .from('assignment_questions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('order_index', { ascending: true });

    if (dbQuestions) questions = dbQuestions;

    // 6. Fetch Submission - CRITICAL FIX: Use simple, verified query logic
    const normalizedStudentId = user.id.trim();
    const normalizedAssignmentId = assignmentId.trim();

    logger.info('Executing submission query', {
      endpoint: 'GET assignment',
      studentId: normalizedStudentId,
      assignmentId: normalizedAssignmentId
    });

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('submissions')
      .select('*') // Select ALL fields to ensure we don't miss anything
      .eq('assignment_id', normalizedAssignmentId)
      .eq('student_id', normalizedStudentId)
      .maybeSingle();

    if (submissionError) {
      logger.error('Submission fetch error', { error: submissionError });
    }

    logger.info('Submission query result', {
      found: !!submission,
      id: submission?.id,
      status: submission?.status
    });

    // 7. Prepare Response
    // Map questions for frontend
    const mappedQuestions = questions.map((q: any) => {
      let opts = [];
      try {
        opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      } catch (e) { opts = [q.options]; }

      // Log correct_answer for debugging
      if (submission && q.correct_answer != null) {
        logger.info('Question correct_answer', {
          endpoint: 'GET assignment',
          questionId: q.id,
          correctAnswer: q.correct_answer,
          correctAnswerType: typeof q.correct_answer,
          options: opts,
          hasSubmission: !!submission
        });
      }

      return {
        ...q,
        options: Array.isArray(opts) ? opts : [],
        // CRITICAL: Only send correct_answer if submission exists!
        // Also ensure correct_answer is not null (handle database null values)
        // Send correct_answer as-is (could be index number, string index, or option text)
        correct_answer: submission && q.correct_answer != null ? q.correct_answer : undefined
      };
    });

    const response = NextResponse.json({
      assignment: {
        ...assignment,
        questions: mappedQuestions
      },
      submission: submission || null
    });

    ensureCsrfToken(response, request);
    return response;

  } catch (error: any) {
    logger.error('API Error in GET assignment', {
      endpoint: 'GET assignment',
      assignmentId: (await params).assignmentId,
      error: error.message,
      stack: error.stack,
      errorType: error.constructor?.name
    });
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/student/assignments/[assignmentId]' },
      'Failed to fetch assignment'
    );
    
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
