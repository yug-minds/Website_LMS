import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// GET /api/school-admin/courses/progress/students?courseId=...
// Returns students' progress for a given course, grouped by grade for the current school.
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

    // Verify the course belongs to this school admin's school (security check)
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id, school_id')
      .eq('id', courseId)
      .eq('school_id', schoolId)
       
      .single() as any;

    if (courseError || !course) {
      return NextResponse.json(
        { error: 'Course not found or access denied', details: 'Course does not belong to your school' },
        { status: 403 }
      );
    }

    // Get enrollments for this course (only students from this school)
    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from('student_courses')
      .select('student_id, progress_percentage, is_completed')
       
      .eq('course_id', courseId) as any;

    if (enrollError) {
      return NextResponse.json({ error: 'Failed to fetch enrollments', details: enrollError.message }, { status: 500 });
    }

    const studentIds = (enrollments || []).map((e: any) => e.student_id).filter(Boolean);

    // Fetch profile details
    const profilesMap = new Map<string, any>();
    if (studentIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
         
        .in('id', studentIds) as any;
      if (!profilesError) {
         
        (profiles || []).forEach((p: any) => profilesMap.set(p.id, p));
      }
    }

    // Fetch grade mapping for these students in this school
    const gradesMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: studentGrades } = await supabaseAdmin
        .from('student_schools')
        .select('student_id, grade')
        .in('student_id', studentIds)
         
        .eq('school_id', schoolId) as any;
       
      (studentGrades || []).forEach((sg: any) => gradesMap.set(sg.student_id, sg.grade));
    }

    // Group by grade
    const byGrade: Record<string, Array<{ id: string; full_name: string; email: string; progress: number; completed: boolean }>> = {};
    for (const e of enrollments || []) {
      const grade = gradesMap.get(e.student_id) || 'Unknown';
      const prof = profilesMap.get(e.student_id) || { full_name: 'Unknown', email: '' };
      if (!byGrade[grade]) byGrade[grade] = [];
      byGrade[grade].push({
        id: e.student_id,
        full_name: prof.full_name,
        email: prof.email,
        progress: e.progress_percentage || 0,
        completed: !!e.is_completed
      });
    }

    // Also include totals per grade
    const grades = Object.keys(byGrade);
    const summary = grades.map((g) => {
      const arr = byGrade[g];
      const total = arr.length;
      const completed = arr.filter((s: any) => s.completed).length;
      const avg = total > 0 ? Math.round(arr.reduce((s: number, a: any) => s + (a.progress || 0), 0) / total) : 0;
      return { grade: g, total, completed, average_progress: avg };
    });

    return NextResponse.json({ byGrade, summary });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/courses/progress/students', {
      endpoint: '/api/school-admin/courses/progress/students',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/courses/progress/students' },
      'Failed to fetch student progress'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

