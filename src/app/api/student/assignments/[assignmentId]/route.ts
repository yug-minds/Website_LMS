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

    type EnrollmentRow = { id?: string };
    type AssignmentRow = {
      id?: string;
      course_id?: string | null;
      chapter_id?: string | null;
      title?: string | null;
      is_published?: boolean | null;
      [key: string]: unknown;
    };
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('is_published', true)
      .maybeSingle();

    const assignmentRow = assignment as AssignmentRow | null;
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
    
    if (!assignmentRow) {
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
      courseId: assignmentRow.course_id,
      title: assignmentRow.title,
      isPublished: assignmentRow.is_published
    });

    // 4. Access Check (Simplified for robustness)
    let hasAccess = false;

    // If assignment has course_id, check access via course
    if (assignmentRow.course_id) {
      // Check enrollment
      const { data: enrollment } = await supabaseAdmin
        .from('enrollments')
        .select('id')
        .eq('student_id', user.id)
        .eq('course_id', assignmentRow.course_id)
        .eq('status', 'active')
        .maybeSingle();

      const enrollmentRow = enrollment as EnrollmentRow | null;
      if (enrollmentRow?.id) {
        hasAccess = true;
        logger.info('Access granted via enrollment', {
          endpoint: 'GET assignment',
          assignmentId,
          courseId: assignmentRow.course_id,
          enrollmentId: enrollmentRow.id
        });
      } else {
        // Check school mapping via course_access
        type StudentSchoolRow = { school_id?: string | null; grade?: string | null };
        const { data: studentSchool } = await supabaseAdmin
          .from('student_schools')
          .select('school_id, grade')
          .eq('student_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        const studentSchoolRow = studentSchool as StudentSchoolRow | null;
        if (studentSchoolRow?.school_id != null) {
          // Try exact match first
          const { data: accessExact } = await supabaseAdmin
            .from('course_access')
            .select('id')
            .eq('course_id', assignmentRow.course_id)
            .eq('school_id', studentSchoolRow.school_id)
            .eq('grade', studentSchoolRow.grade ?? '')
            .maybeSingle();

          if (accessExact) {
            hasAccess = true;
            logger.info('Access granted via course_access (exact match)', {
              endpoint: 'GET assignment',
              assignmentId,
              courseId: assignmentRow.course_id,
              schoolId: studentSchoolRow.school_id,
              grade: studentSchoolRow.grade
            });
          } else {
            // Try normalized grade match
            const { data: accessList } = await supabaseAdmin
              .from('course_access')
              .select('id, grade')
              .eq('course_id', assignmentRow.course_id)
              .eq('school_id', studentSchoolRow.school_id);

            if (accessList && accessList.length > 0) {
              type CourseAccess = {
                id: string;
                grade?: string | null;
              };
              const normalizeGrade = (g: string) => 
                g.toLowerCase().trim().replace(/^grade\s*/i, '').replace(/grade/i, '');
              
              const studentGradeNormalized = normalizeGrade(studentSchoolRow.grade ?? '');
              const hasMatch = (accessList as CourseAccess[]).some((ca) => {
                const accessGrade = ca.grade || '';
                const accessGradeNormalized = normalizeGrade(accessGrade);
                return accessGradeNormalized === studentGradeNormalized;
              });

              if (hasMatch) {
                hasAccess = true;
                logger.info('Access granted via course_access (normalized match)', {
                  endpoint: 'GET assignment',
                  assignmentId,
                  courseId: assignmentRow.course_id,
                  schoolId: studentSchoolRow.school_id,
                  studentGrade: studentSchoolRow.grade
                });
              }
            }
          }
        }
      }
    } else if (assignmentRow.chapter_id) {
      // If assignment only has chapter_id, check access via chapter's course
      type ChapterRow = { course_id?: string | null };
      const { data: chapter } = await supabaseAdmin
        .from('chapters')
        .select('course_id')
        .eq('id', assignmentRow.chapter_id)
        .maybeSingle();

      const chapterRow = chapter as ChapterRow | null;
      if (chapterRow?.course_id) {
        // Check enrollment for the chapter's course
        const { data: enrollment } = await supabaseAdmin
          .from('enrollments')
          .select('id')
          .eq('student_id', user.id)
          .eq('course_id', chapterRow.course_id)
          .eq('status', 'active')
          .maybeSingle();

        const enrollRow = enrollment as EnrollmentRow | null;
        if (enrollRow?.id) {
          hasAccess = true;
          logger.info('Access granted via chapter enrollment', {
            endpoint: 'GET assignment',
            assignmentId,
            chapterId: assignmentRow.chapter_id,
            courseId: chapterRow.course_id
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
        courseId: assignmentRow.course_id,
        chapterId: assignmentRow.chapter_id
      });
      return NextResponse.json({ 
        error: 'Access denied',
        details: 'You do not have access to this assignment. Please ensure you are enrolled in the course.',
        code: 'NO_ACCESS'
      }, { status: 403 });
    }

    // 5. Fetch Questions (Standardized)
    type AssignmentQuestionRow = {
      id: string;
      assignment_id?: string;
      question_text?: string | null;
      question_type?: string | null;
      options?: string | Record<string, unknown> | unknown[] | null;
      correct_answer?: string | number | null;
      points?: number | null;
      order_index?: number | null;
      [key: string]: unknown;
    };
    let questions: AssignmentQuestionRow[] = [];
    const { data: dbQuestions } = await supabaseAdmin
      .from('assignment_questions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('order_index', { ascending: true });

    if (dbQuestions) questions = dbQuestions as AssignmentQuestionRow[];

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

    type SubmissionRow = { id?: string; status?: string | null; [key: string]: unknown };
    const submissionRow = submission as SubmissionRow | null;
    if (submissionError) {
      logger.error('Submission fetch error', { error: submissionError });
    }

    logger.info('Submission query result', {
      found: !!submissionRow,
      id: submissionRow?.id,
      status: submissionRow?.status
    });

    // 7. Prepare Response
    const mappedQuestions = questions.map((q) => {
      let opts = [];
      try {
        opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      } catch (_e) { opts = [q.options]; }

      // Log correct_answer for debugging
      if (submissionRow && q.correct_answer != null) {
        logger.info('Question correct_answer', {
          endpoint: 'GET assignment',
          questionId: q.id,
          correctAnswer: q.correct_answer,
          correctAnswerType: typeof q.correct_answer,
          options: opts,
          hasSubmission: !!submissionRow
        });
      }

      return {
        ...q,
        options: Array.isArray(opts) ? opts : [],
        correct_answer: submissionRow && q.correct_answer != null ? q.correct_answer : undefined
      };
    });

    const response = NextResponse.json({
      assignment: {
        ...assignmentRow,
        questions: mappedQuestions
      },
      submission: submissionRow ?? null
    });

    ensureCsrfToken(response, request);
    return response;

  } catch (error: unknown) {
    logger.error('API Error in GET assignment', {
      endpoint: 'GET assignment',
      assignmentId: (await params).assignmentId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorType: error instanceof Error ? error.constructor?.name : undefined
    });
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/student/assignments/[assignmentId]' },
      'Failed to fetch assignment'
    );
    
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
