import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId } from '../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// GET: Fetch teacher's assigned schools
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
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    // Get teacher's assigned schools (using admin client to bypass RLS)
    const { data: teacherSchools, error } = await supabaseAdmin
      .from('teacher_schools')
      .select(`
        school_id,
        grades_assigned,
        subjects,
        working_days_per_week,
        max_students_per_session,
        is_primary,
        schools (
          id,
          name,
          school_code,
          city,
          state,
          address
        )
      `)
      .eq('teacher_id', teacherId)
       
      .order('is_primary', { ascending: false }) as any;

    if (error) {
      console.error('❌ Error fetching teacher schools:', error);
      return NextResponse.json(
        { error: 'Failed to fetch schools', details: error.message },
        { status: 500 }
      );
    }

    // Transform data to match expected format
     
    const schoolsData = (teacherSchools || []).map((ts: any) => ({
      id: ts.schools?.id,
      name: ts.schools?.name,
      school_code: ts.schools?.school_code,
      city: ts.schools?.city,
      state: ts.schools?.state,
      address: ts.schools?.address,
      assignment: {
        school_id: ts.school_id,
        grades_assigned: ts.grades_assigned,
        subjects: ts.subjects,
        working_days_per_week: ts.working_days_per_week,
        max_students_per_session: ts.max_students_per_session,
        is_primary: ts.is_primary
      }
     
    })).filter((school: any) => school.id); // Filter out null schools

    return NextResponse.json({
      schools: schoolsData,
      total: schoolsData.length
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/schools', {
      endpoint: '/api/teacher/schools',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/schools' },
      'Failed to fetch teacher schools'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}






