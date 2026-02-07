import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { getOrSetCache, CacheTTL } from '../../../../lib/cache';

interface Submission {
  id: string;
  assignment_id: string;
  grade: number | null;
  submitted_at: string | null;
  status: string;
  feedback: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface AssignmentBasic {
  id: string;
  title?: string | null;
  course_id?: string | null;
  chapter_id?: string | null;
}

// GET - Get all assignments for the authenticated student
export async function GET(request: NextRequest) {
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
          endpoint: '/api/student/assignments',
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
        endpoint: '/api/student/assignments',
      }, authException instanceof Error ? authException : new Error(String(authException)));
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication failed' },
        { status: 401 }
      );
    }

    // OPTIMIZATION: Use caching to improve performance (reduces 500-1000ms to < 100ms)
    const cacheKey = `student:assignments:${user.id}`;
    
    const result = await getOrSetCache(
      cacheKey,
      async () => {
        // Get student's enrolled courses (from enrollments and course_access)
        const { data: enrollments } = await supabaseAdmin
          .from('enrollments')
          .select('course_id')
          .eq('student_id', user.id)
          .eq('status', 'active');

        // Get student's school and grade for course_access check
        type StudentSchoolRow = { school_id?: string | null; grade?: string | null };
        const { data: studentSchoolData } = await supabaseAdmin
          .from('student_schools')
          .select('school_id, grade')
          .eq('student_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        const studentSchool = studentSchoolData as StudentSchoolRow | null;
    const courseIds = new Set<string>();
    
    // Add courses from enrollments
    enrollments?.forEach((e: { course_id: string }) => {
      if (e.course_id) courseIds.add(e.course_id);
    });

    // Add courses from course_access
    if (studentSchool?.school_id && studentSchool?.grade) {
      const { data: courseAccess } = await supabaseAdmin
        .from('course_access')
        .select('course_id, grade')
        .eq('school_id', studentSchool.school_id);

      if (courseAccess) {
        // Normalize grades for comparison
        const normalizeGrade = (g: string) => 
          g.toLowerCase().trim().replace(/^grade\s*/i, '').replace(/grade/i, '');
        
        const studentGradeNormalized = normalizeGrade(studentSchool.grade ?? '');
        courseAccess.forEach((ca: { course_id: string; grade: string }) => {
          const accessGradeNormalized = normalizeGrade(ca.grade);
          if (
            ca.grade === studentSchool.grade ||
            accessGradeNormalized === studentGradeNormalized
          ) {
            if (ca.course_id) courseIds.add(ca.course_id);
          }
        });
      }
    }

    // Get chapter IDs for accessible courses
    const chapterIds: string[] = [];
    if (courseIds.size > 0) {
      const { data: chapters } = await supabaseAdmin
        .from('chapters')
        .select('id, course_id')
        .in('course_id', Array.from(courseIds))
        .eq('is_published', true);
      
      if (chapters) {
        chapters.forEach((ch: { id: string; course_id: string }) => {
          if (ch.id) chapterIds.push(ch.id);
        });
      }
    }

    if (courseIds.size === 0 && chapterIds.length === 0) {
      return {
        assignments: [],
        total: 0,
      };
    }

    // Fetch published assignments for accessible courses AND chapters
    type AssignmentQueryResult = {
      data: Array<{
        id: string;
        title?: string | null;
        description?: string | null;
        assignment_type?: string | null;
        due_date?: string | null;
        max_marks?: number | null;
        max_attempts?: number | null;
        course_id?: string | null;
        chapter_id?: string | null;
        is_published?: boolean | null;
        created_at?: string | null;
      }> | null;
      error?: unknown;
    };
    const assignmentQueries: Promise<AssignmentQueryResult>[] = [];

    // Fetch assignments by course_id (including those with or without chapter_id)
    if (courseIds.size > 0) {
      assignmentQueries.push(
        (async () => {
          const r = await supabaseAdmin
            .from('assignments')
            .select(`
              id,
              title,
              description,
              assignment_type,
              due_date,
              max_marks,
              max_attempts,
              course_id,
              chapter_id,
              is_published,
              created_at
            `)
            .in('course_id', Array.from(courseIds))
            .eq('is_published', true);
          return { data: r.data, error: r.error };
        })()
      );
    }

    // Fetch assignments by chapter_id (these might not have course_id set)
    if (chapterIds.length > 0) {
      assignmentQueries.push(
        (async () => {
          const r = await supabaseAdmin
            .from('assignments')
            .select(`
              id,
              title,
              description,
              assignment_type,
              due_date,
              max_marks,
              max_attempts,
              course_id,
              chapter_id,
              is_published,
              created_at
            `)
            .in('chapter_id', chapterIds)
            .eq('is_published', true);
          return { data: r.data, error: r.error };
        })()
      );
    }

    const assignmentResults = await Promise.all(assignmentQueries);
    
    // Combine all assignments and remove duplicates
    type AssignmentRow = {
      id: string;
      title?: string | null;
      description?: string | null;
      assignment_type?: string | null;
      due_date?: string | null;
      max_marks?: number | null;
      max_attempts?: number | null;
      course_id?: string | null;
      chapter_id?: string | null;
      is_published?: boolean | null;
      created_at?: string | null;
    };
    const allAssignments: AssignmentRow[] = [];
    const seenIds = new Set<string>();
    
    assignmentResults.forEach(result => {
      if (result.data) {
        (result.data as AssignmentRow[]).forEach((assignment) => {
          if (!seenIds.has(assignment.id)) {
            seenIds.add(assignment.id);
            allAssignments.push(assignment);
          }
        });
      }
    });

    // Sort by due_date
    allAssignments.sort((a, b) => {
      const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
      return dateA - dateB;
    });

    const assignments = allAssignments;
    const assignmentsError = assignmentResults.find(r => r.error)?.error;

    logger.info('Fetched assignments', {
      endpoint: '/api/student/assignments',
      userId: user.id,
      courseIdsCount: courseIds.size,
      courseIds: Array.from(courseIds),
      chapterIdsCount: chapterIds.length,
      chapterIds: chapterIds,
      assignmentsCount: assignments.length,
      hasError: !!assignmentsError,
      assignments:       allAssignments.map((a) => ({
        id: a.id,
        title: a.title ?? undefined,
        course_id: a.course_id ?? undefined,
        chapter_id: a.chapter_id ?? undefined
      }))
    });

    if (assignmentsError) {
      logger.error('Error fetching assignments', {
        endpoint: '/api/student/assignments',
        userId: user.id,
      }, assignmentsError instanceof Error ? assignmentsError : new Error(String(assignmentsError)));
      
      throw assignmentsError; // Let error handler catch it
    }

    // Fetch student's submissions
    const { data: submissions } = await supabaseAdmin
      .from('submissions')
      .select('id, assignment_id, grade, submitted_at, status, feedback')
      .eq('student_id', user.id);

    type SubmissionRow = { id: string; assignment_id: string; grade: number | null; submitted_at: string | null; status: string; feedback: string | null };
    const submissionRows = (submissions || []) as SubmissionRow[];
    const submissionMap = new Map<string, Submission>(
      submissionRows.map((s) => [s.assignment_id, { id: s.id, assignment_id: s.assignment_id, grade: s.grade, submitted_at: s.submitted_at, status: s.status, feedback: s.feedback }])
    );

    // Fetch course information for all assignments (batch fetch)
    const allCourseIds = new Set<string>();
    assignments.forEach((assignment) => {
      if (assignment.course_id) {
        allCourseIds.add(assignment.course_id);
      }
    });

    // Fetch chapter information for assignments linked to chapters
    const allChapterIds = assignments
      .filter((a) => a.chapter_id != null)
      .map((a) => a.chapter_id!);
    
    const chaptersMap = new Map<string, { id: string; name: string | null; title: string | null; course_id: string }>();
    if (allChapterIds.length > 0) {
      const { data: chapters } = await supabaseAdmin
        .from('chapters')
        .select('id, name, title, course_id')
        .in('id', allChapterIds);
      
      if (chapters) {
        chapters.forEach((chapter: {
          id: string
          name: string | null
          title: string | null
          course_id: string
        }) => {
          chaptersMap.set(chapter.id, chapter);
          // Also add course_id from chapter if assignment doesn't have it
          if (chapter.course_id) {
            allCourseIds.add(chapter.course_id);
          }
        });
      }
    }

    // Fetch all course information
    const coursesMap = new Map<string, { id: string; title: string | null; grade: string | null; subject: string | null }>();
    if (allCourseIds.size > 0) {
      const { data: courses } = await supabaseAdmin
        .from('courses')
        .select('id, title, grade, subject')
        .in('id', Array.from(allCourseIds));
      
      if (courses) {
        courses.forEach((course: {
          id: string
          title: string
          grade: string | null
          subject: string | null
        }) => {
          coursesMap.set(course.id, course);
        });
      }
    }

    // Helper function to normalize grade to display format (e.g., "grade4" -> "Grade 4")
    const normalizeGradeToDisplay = (grade: string | null | undefined): string => {
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

    // Process assignments with submission data
    const processedAssignments = (assignments || []).map((assignment) => {
      const submission = submissionMap.get(assignment.id);
      const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
      const now = new Date();
      const daysUntilDue = dueDate 
        ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const isOverdue = dueDate ? (dueDate < now && (!submission || submission.status !== 'submitted')) : false;

      let status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue' = 'not_started';
      if (submission) {
        // If submission has a grade (regardless of status), it's graded
        // Check grade as both number and string to handle different data types
        const hasGrade = submission.grade !== null && 
                        submission.grade !== undefined && 
                        (typeof submission.grade === 'number' || 
                         (typeof submission.grade === 'string' && String(submission.grade).trim() !== ''));
        
        if (hasGrade || submission.status === 'graded') {
          status = 'graded';
        } else if (submission.status === 'submitted' || submission.submitted_at) {
          // If it has submitted_at timestamp, it's submitted
          status = 'submitted';
        } else if (submission.status === 'draft') {
          status = 'in_progress';
        } else {
          // For any other status, check if it has been submitted
          status = submission.submitted_at ? 'submitted' : 'in_progress';
        }
      } else if (isOverdue) {
        status = 'overdue';
      }

      // Get course info from coursesMap
      let courseId = assignment.course_id;
      
      // If assignment is linked to chapter but doesn't have course_id, get it from chapter
      if (assignment.chapter_id && !courseId) {
        const chapter = chaptersMap.get(assignment.chapter_id);
        if (chapter?.course_id) {
          courseId = chapter.course_id;
        }
      }
      
      // Get course details from coursesMap
      const course = courseId ? coursesMap.get(courseId) : null;
      const courseTitle = course?.title || 'Unknown';
      // Use student's grade as fallback if course grade is missing
      const courseGradeRaw = course?.grade || studentSchool?.grade || null;
      const courseGrade = courseGradeRaw ? normalizeGradeToDisplay(courseGradeRaw) : 'Unknown';
      const courseSubject = course?.subject || 'Unknown';
      
      // Get chapter details
      const chapter = assignment.chapter_id ? chaptersMap.get(assignment.chapter_id) : null;
      const chapterName = chapter?.name || chapter?.title;

      return {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        assignment_type: assignment.assignment_type,
        due_date: assignment.due_date,
        max_marks: assignment.max_marks,
        max_attempts: assignment.max_attempts || 1,
        course_id: courseId,
        chapter_id: assignment.chapter_id,
        course_title: courseTitle,
        course_grade: courseGrade,
        course_subject: courseSubject,
        chapter_name: chapterName,
        status,
        submission: submission ? {
          id: submission.id,
          grade: submission.grade,
          feedback: submission.feedback,
          submitted_at: submission.submitted_at,
          status: submission.status
        } : undefined,
        is_overdue: isOverdue,
        days_until_due: daysUntilDue
      };
    });

        return {
          assignments: processedAssignments,
          total: processedAssignments.length,
        };
      },
      CacheTTL.SHORT // 2 minutes - same as other student endpoints for consistency
    );

    logger.info('Student assignments fetched successfully', {
      endpoint: '/api/student/assignments',
      userId: user.id,
      count: result.assignments?.length || 0,
      cached: true // Indicates data may be from cache
    });

    const response = NextResponse.json(result);
    ensureCsrfToken(response, request);
    return response;

  } catch (error) {
    logger.error('Unexpected error in GET /api/student/assignments', {
      endpoint: '/api/student/assignments',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/student/assignments' },
      'Failed to fetch assignments'
    );
    
    const response = NextResponse.json(errorInfo, { status: errorInfo.status });
    ensureCsrfToken(response, request);
    return response;
  }
}

