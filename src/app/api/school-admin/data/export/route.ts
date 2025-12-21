import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// GET: Export school-specific data
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
    // Get access token for authenticated client
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    // Create authenticated client with RLS - will automatically restrict to school admin's school
    const supabase = await createAuthenticatedClient(accessToken);

    // Fetch all school-specific data using RLS
    // RLS policies will automatically restrict access to the school admin's school
     
    const schoolResult = await supabase.from('schools').select('*').eq('id', schoolId).single() as any;
    
    // Get student IDs for this school (RLS will restrict to school admin's school)
    const { data: studentSchools } = await supabase
      .from('student_schools')
      .select('student_id')
       
      .eq('school_id', schoolId) as any;
    
    const studentIds = studentSchools?.map((s: { student_id: string }) => s.student_id) || [];
    
    // Get teacher IDs for this school (RLS will restrict to school admin's school)
    const { data: teacherSchools } = await supabase
      .from('teacher_schools')
      .select('teacher_id')
       
      .eq('school_id', schoolId) as any;
    
    const teacherIds = teacherSchools?.map((t: { teacher_id: string }) => t.teacher_id) || [];

    const [
      studentsResult,
      teachersResult,
      coursesResult,
      reportsResult,
      schedulesResult
    ] = await Promise.all([
      studentIds.length > 0 
        ? supabase.from('profiles').select('*').eq('role', 'student').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      teacherIds.length > 0
        ? supabase.from('profiles').select('*').eq('role', 'teacher').in('id', teacherIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('courses').select('*').eq('school_id', schoolId),
      supabase.from('teacher_reports').select('*').eq('school_id', schoolId),
      supabase.from('schedules').select('*').eq('school_id', schoolId)
    ]);

    const school = schoolResult.data;
    const students = studentsResult.data || [];
    const teachers = teachersResult.data || [];
    const courses = coursesResult.data || [];
    const reports = reportsResult.data || [];
    const schedules = schedulesResult.data || [];

    const exportData = {
      export_date: new Date().toISOString(),
      school: school,
      students: students,
      teachers: teachers,
      courses: courses,
      reports: reports,
      schedules: schedules,
      summary: {
        total_students: students.length,
        total_teachers: teachers.length,
        total_courses: courses.length,
        total_reports: reports.length,
        total_schedules: schedules.length
      }
    };

    // Return as JSON
    const jsonString = JSON.stringify(exportData, null, 2);
    
    return new NextResponse(jsonString, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="school-data-export-${new Date().toISOString().split('T')[0]}.json"`
      }
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/data/export', {
      endpoint: '/api/school-admin/data/export',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/data/export' },
      'Failed to export data'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

