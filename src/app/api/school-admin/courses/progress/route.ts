import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// GET - Compute per-course progress for the current school admin's school
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

    // Fetch all courses for this school
    const { data: courses, error: coursesError } = await supabaseAdmin
      .from('courses')
      .select('id, title')
       
      .eq('school_id', schoolId) as any;

    if (coursesError) {
      return NextResponse.json(
        { error: 'Failed to fetch courses', details: coursesError.message },
        { status: 500 }
      );
    }

    const results: Array<{
      course_id: string;
      total_students: number;
      completed_students: number;
      average_progress: number;
      grade_breakdown: Array<{ grade: string; total: number; completed: number; average_progress: number }>;
    }> = [];

    // Compute progress per course
    for (const c of courses || []) {
      const { data: enrollments, error: enrollError } = await supabaseAdmin
        .from('student_courses')
        .select('student_id, progress_percentage, is_completed')
         
        .eq('course_id', c.id) as any;

      if (enrollError) {
        // If enrollment query fails, push zeros but continue
        results.push({ course_id: c.id, total_students: 0, completed_students: 0, average_progress: 0, grade_breakdown: [] });
        continue;
      }

      let total = enrollments?.length || 0;
      let completed = enrollments?.filter((e: { is_completed?: boolean }) => e.is_completed).length || 0;
      let avg = total > 0
        ? Math.round((enrollments || []).reduce((s: number, e: { progress_percentage?: number }) => s + (e.progress_percentage || 0), 0) / total)
        : 0;

      // Grade-wise breakdown (join student_schools for these student_ids in this school)
      let breakdown: Array<{ grade: string; total: number; completed: number; average_progress: number }> = [];
       
      const studentIds = (enrollments || []).map((e: any) => e.student_id).filter(Boolean);
      if (studentIds.length > 0) {
        const { data: studentGrades, error: sgError } = await supabaseAdmin
          .from('student_schools')
          .select('student_id, grade')
          .in('student_id', studentIds)
           
          .eq('school_id', schoolId) as any;

        if (!sgError) {
          const gradeMap = new Map<string, { total: number; completed: number; sumProgress: number }>();
          for (const e of enrollments || []) {
            const g = studentGrades?.find((sg: { student_id: string; grade?: string }) => sg.student_id === e.student_id)?.grade || 'Unknown';
            const curr = gradeMap.get(g) || { total: 0, completed: 0, sumProgress: 0 };
            curr.total += 1;
            if (e.is_completed) curr.completed += 1;
            curr.sumProgress += (e.progress_percentage || 0);
            gradeMap.set(g, curr);
          }
          breakdown = Array.from(gradeMap.entries()).map(([grade, v]) => ({ 
            grade, 
            total: v.total, 
            completed: v.completed,
            average_progress: v.total > 0 ? Math.round(v.sumProgress / v.total) : 0
          }));
        } else {
          // ignore sgError, we'll consider fallback below if no enrollments
        }
      }

      // Fallback: if there are no enrollments yet, estimate by grade assignments
      if (total === 0) {
        // 1) Try authoritative mapping from course_access
        let gradesForCourse: string[] = [];
        try {
          const { data: courseAccess, error: caError } = await supabaseAdmin
            .from('course_access')
            .select('grade')
            .eq('course_id', c.id)
             
            .eq('school_id', schoolId) as any;

          if (!caError && Array.isArray(courseAccess) && courseAccess.length > 0) {
             
            gradesForCourse = courseAccess.map((r: any) => String(r.grade));
          }
        } catch (e) {
          logger.warn('Error fetching course_access (non-critical)', {
            endpoint: '/api/school-admin/courses/progress',
          }, e instanceof Error ? e : new Error(String(e)));
          // table may not exist; ignore
        }

        // 2) Fallback to the course's own grade field
        if (gradesForCourse.length === 0) {
           
          if ((c as any).grade) {
             
            gradesForCourse = [String((c as any).grade)];
          }
        }

        // 3) Count students per grade in the school
        if (gradesForCourse.length > 0) {
          const normalized = (g: string): string => {
            const m = String(g).match(/(\d{1,2})/);
            return m ? `Grade ${m[1]}` : g;
          };

          breakdown = [];
          for (const g of gradesForCourse) {
            const normalizedGrade = normalized(g);
            const { data: countRows, error: countErr } = await supabaseAdmin
              .from('student_schools')
              .select('id', { count: 'exact', head: true })
              .eq('school_id', schoolId)
               
              .eq('grade', normalizedGrade) as any;

            const gradeTotal = (countRows as any)?.length ? (countRows as any).length : (countRows === null ? 0 : 0);
            // When using head:true, count is exposed via PostgREST header; not readable here,
            // so re-run without head to get count reliably.
            if (!countRows) {
              const { data: rows } = await supabaseAdmin
                .from('student_schools')
                .select('id')
                .eq('school_id', schoolId)
                 
                .eq('grade', normalizedGrade) as any;
              breakdown.push({ grade: normalizedGrade, total: (rows || []).length, completed: 0, average_progress: 0 });
            } else {
              breakdown.push({ grade: normalizedGrade, total: gradeTotal, completed: 0, average_progress: 0 });
            }
          }

          total = breakdown.reduce((s: number, b: any) => s + b.total, 0);
          completed = 0;
          avg = 0;
        }
      }

      results.push({ course_id: c.id, total_students: total, completed_students: completed, average_progress: avg, grade_breakdown: breakdown });
    }

    return NextResponse.json({ progress: results });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/courses/progress', {
      endpoint: '/api/school-admin/courses/progress',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/courses/progress' },
      'Failed to fetch course progress'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

