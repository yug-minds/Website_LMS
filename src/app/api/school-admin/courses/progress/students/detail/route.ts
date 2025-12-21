import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// GET /api/school-admin/courses/progress/students/detail?courseId=...
// Returns students enrolled in a course with chapter-wise progress per student.
export async function GET(request: NextRequest) {
  ensureCsrfToken(request);
  
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }

    // Fetch course details to get grades - verify it belongs to this school
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id, course_name, grade, school_id')
      .eq('id', courseId)
      .eq('school_id', schoolId) // Ensure course belongs to this school
       
      .single() as any;

    if (courseError) {
      logger.error('Error fetching course', {
        endpoint: '/api/school-admin/courses/progress/students/detail',
      }, courseError);
      // Check if course doesn't exist or doesn't belong to school
      if (courseError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Course not found', details: 'Course does not exist or does not belong to your school' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch course', details: courseError.message },
        { status: 500 }
      );
    }

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found', details: 'Course does not exist or does not belong to your school' },
        { status: 404 }
      );
    }

    // Extract grades for this course (normalize to "Grade X" format)
     
    const extractGrades = (c: any, accessGrades: string[] = []): string[] => {
      // Prefer authoritative list from course_access if provided
      if (Array.isArray(accessGrades) && accessGrades.length > 0) {
         
        const mapped = accessGrades.map((g: any) => {
          const str = String(g).trim();
          const m = str.match(/(\d{1,2})/);
          return m ? `Grade ${m[1]}` : str;
        });
        return Array.from(new Set(mapped));
      }
      if (Array.isArray(c.grades)) {
         
        const grades = c.grades.map((g: any) => {
          const str = String(g).trim();
          const m = str.match(/(\d{1,2})/);
          return m ? `Grade ${m[1]}` : str;
        });
        return Array.from(new Set(grades));
      }
      if (c.grade) {
        const str = String(c.grade).trim();
        // Check for range like "4-9" or "Grade 4 to Grade 9"
        const rangeMatch = str.match(/(\d{1,2})\s*(?:to|-|–)\s*(\d{1,2})/i);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1], 10);
          const max = parseInt(rangeMatch[2], 10);
          if (min && max && max >= min) {
            return Array.from({ length: (max - min + 1) }, (_, i) => `Grade ${min + i}`);
          }
        }
        // Check for comma-separated like "4,5,6,7,8,9"
        const parts = str.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (parts.length > 1) {
          return Array.from(new Set(parts.map((p: string) => {
            const m = p.match(/(\d{1,2})/);
            return m ? `Grade ${m[1]}` : p;
          })));
        }
        // Single grade
        const m = str.match(/(\d{1,2})/);
        return m ? [`Grade ${m[1]}`] : [str];
      }
      return [];
    };
    // Try to read grades from course_access for this course and school
    let accessGrades: string[] = [];
    try {
      const { data: accessRows } = await supabaseAdmin
        .from('course_access')
        .select('grade')
        .eq('course_id', courseId)
         
        .eq('school_id', schoolId) as any;
      if (Array.isArray(accessRows) && accessRows.length > 0) {
         
        accessGrades = accessRows.map((r: any) => r.grade);
      }
    } catch (e) {
      logger.warn('Error fetching course_access (non-critical)', {
        endpoint: '/api/school-admin/courses/progress/students/detail',
      }, e instanceof Error ? e : new Error(String(e)));
      // ignore if table doesn't exist
    }

    const courseGrades = extractGrades(course, accessGrades);

    // Enrollments for this course
    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from('student_courses')
      .select('student_id, progress_percentage, is_completed')
       
      .eq('course_id', courseId) as any;

    let studentIds: string[] = [];

    const enrollmentsMap = new Map<string, any>();

    if (!enrollError && enrollments && enrollments.length > 0) {
       
      studentIds = enrollments.map((e: any) => e.student_id).filter(Boolean);
       
      enrollments.forEach((e: any) => enrollmentsMap.set(e.student_id, e));
    }

    // Fallback: If no enrollments, show all students from the school matching the course grades
    if (studentIds.length === 0 && courseGrades.length > 0) {
      // Fetch all students for the school and filter by grade number to be robust against variants like "Grade Grade 4"
      const { data: allStudents, error: fallbackError } = await supabaseAdmin
        .from('student_schools')
        .select('student_id, grade')
         
        .eq('school_id', schoolId) as any;

      if (!fallbackError && Array.isArray(allStudents)) {
        const wantedNums = new Set(
          courseGrades
            .map((g: string) => (String(g).match(/(\d{1,2})/) || [])[1])
            .filter(Boolean)
        );

        const matched = allStudents.filter((s: any) => {
          const num = (String(s.grade || '').match(/(\d{1,2})/) || [])[1];
          return num ? wantedNums.has(num) : false;
        });

        studentIds = matched.map((s: any) => s.student_id).filter(Boolean);
        studentIds.forEach((id: string) => {
          enrollmentsMap.set(id, { student_id: id, progress_percentage: 0, is_completed: false });
        });
      }
    }

    // Secondary fallback: if still empty, try via profiles (role='student') joined by latest grade in student_schools
    if (studentIds.length === 0 && courseGrades.length > 0) {
      // Get all students (profiles) for this school from student_schools, then filter by grade number
      const { data: ss } = await supabaseAdmin
        .from('student_schools')
        .select('student_id, grade')
         
        .eq('school_id', schoolId) as any;

      if (Array.isArray(ss) && ss.length > 0) {
        const wantedNums = new Set(
          courseGrades
            .map((g: string) => (String(g).match(/(\d{1,2})/) || [])[1])
            .filter(Boolean)
        );
         
        const matched = ss.filter((row: any) => {
          const num = (String(row.grade || '').match(/(\d{1,2})/) || [])[1];
          return num ? wantedNums.has(num) : false;
        });
         
        studentIds = matched.map((m: any) => m.student_id).filter(Boolean);
        studentIds.forEach((id: string) => {
          enrollmentsMap.set(id, { student_id: id, progress_percentage: 0, is_completed: false });
        });
      }
    }

    // Profiles for these students
     
    const profilesMap = new Map<string, any>();
    if (studentIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
         
        .in('id', studentIds) as any;
       
      (profiles || []).forEach((p: any) => profilesMap.set(p.id, p));
    }

    // Grade mapping in this school
    const gradesMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: sg } = await supabaseAdmin
        .from('student_schools')
        .select('student_id, grade')
        .in('student_id', studentIds)
         
        .eq('school_id', schoolId) as any;
       
      (sg || []).forEach((row: any) => gradesMap.set(row.student_id, row.grade));
    }

    // Chapters of this course (use chapters table, course_chapters is deprecated)
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from('chapters')
      .select('id, order_number, order_index, name, title, is_published')
      .eq('course_id', courseId)
       
      .order('order_number', { ascending: true, nullsFirst: false }) as any;

    if (chaptersError) {
      return NextResponse.json({ error: 'Failed to fetch chapters', details: chaptersError.message }, { status: 500 });
    }

    // Chapter-wise progress (if table exists)
     
    let chapterProgress: any[] = [];
    try {
      const { data: cp } = await supabaseAdmin
        .from('course_progress')
        .select('student_id, chapter_id, progress_percent, completed')
        .eq('course_id', courseId)
         
        .in('student_id', studentIds) as any;
      chapterProgress = cp || [];
    } catch (e) {
      logger.warn('Error fetching chapter_progress (non-critical)', {
        endpoint: '/api/school-admin/courses/progress/students/detail',
      }, e instanceof Error ? e : new Error(String(e)));
      // Table may not exist; proceed without it
      chapterProgress = [];
    }

    // Build response per student
     
    const chaptersMap = new Map<string, any>();
     
    (chapters || []).forEach((c: any) => chaptersMap.set(c.id, c));

    const byStudent: Array<{
      id: string;
      full_name: string;
      email: string;
      grade: string;
      overall_progress: number;
      completed: boolean;
      chapters: Array<{ id: string; chapter_number: number; title: string; is_published: boolean; progress: number; completed: boolean }>
    }> = [];

    // Build response for all students (enrolled + fallback)
    for (const studentId of studentIds) {
      const enrollment = enrollmentsMap.get(studentId) || { student_id: studentId, progress_percentage: 0, is_completed: false };
      const profile = profilesMap.get(studentId) || { full_name: 'Unknown', email: '' };
      const grade = gradesMap.get(studentId) || 'Unknown';

      // Build per-chapter array
       
      const studentChapters = (chapters || []).map((ch: any) => {
         
        const cp = chapterProgress.find((p: any) => p.student_id === studentId && p.chapter_id === ch.id);
        return {
          id: ch.id,
          chapter_number: ch.chapter_number,
          title: ch.title,
          is_published: ch.is_published,
          progress: cp ? Math.round(cp.progress_percent || 0) : 0,
          completed: cp ? !!cp.completed : false
        };
      });

      byStudent.push({
        id: studentId,
        full_name: profile.full_name,
        email: profile.email,
        grade,
        overall_progress: Math.round(enrollment.progress_percentage || 0),
        completed: !!enrollment.is_completed,
        chapters: studentChapters
      });
    }

    // Always return students array and chapters, even if empty
    return NextResponse.json({
      students: byStudent || [],
      chapters: chapters || []
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/courses/progress/students/detail', {
      endpoint: '/api/school-admin/courses/progress/students/detail',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/courses/progress/students/detail' },
      'Failed to fetch student progress details'
    );
    return NextResponse.json({ ...errorInfo, students: [], chapters: [] }, { status: errorInfo.status });
  }
}

