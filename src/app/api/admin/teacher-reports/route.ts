import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

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
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const schoolId = searchParams.get('school_id');
    const grade = searchParams.get('grade');
    const teacherId = searchParams.get('teacher_id');
    const search = searchParams.get('search');

    // Build base query
    let query = supabaseAdmin
      .from('teacher_reports')
      .select('id, teacher_id, school_id, date, class_name, grade, topics_taught, report_status, created_at, updated_at')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    // Apply filters
    if (date) {
      query = query.eq('date', date);
    }

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    if (grade) {
      // Handle both "grade1" format and "Grade 1" format
      // Try exact match first, then try with "Grade " prefix
      const gradeValue = grade.startsWith('grade') 
        ? grade.replace('grade', 'Grade ') 
        : grade;
      query = query.eq('grade', gradeValue);
    }

    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error('Error fetching teacher reports:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch teacher reports', 
        details: error.message 
      }, { status: 500 });
    }

    if (!reports || reports.length === 0) {
      return NextResponse.json({ reports: [] });
    }

    // Get unique teacher IDs and school IDs
     
    const teacherIds = [...new Set((reports || []).map((r: any) => r.teacher_id).filter(Boolean))];
     
    const schoolIds = [...new Set((reports || []).map((r: any) => r.school_id).filter(Boolean))];

    // Fetch teacher profiles
    const teachersMap = new Map();
    if (teacherIds.length > 0) {
      const { data: teachersData } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
         
        .in('id', teacherIds) as any;

      (teachersData || []).forEach((teacher: any) => {
        teachersMap.set(teacher.id, teacher);
      });
    }

    // Fetch schools
    const schoolsMap = new Map();
    if (schoolIds.length > 0) {
      const { data: schoolsData } = await supabaseAdmin
        .from('schools')
        .select('id, name')
         
        .in('id', schoolIds) as any;

      (schoolsData || []).forEach((school: any) => {
        schoolsMap.set(school.id, school);
      });
    }

    // Transform the data with teacher and school names
     
    const transformedReports = (reports || []).map((report: any) => {
      const teacher = teachersMap.get(report.teacher_id);
      const school = schoolsMap.get(report.school_id);
      
      return {
        id: report.id,
        teacher_id: report.teacher_id,
        school_id: report.school_id,
        date: report.date,
        grade: report.grade || 'N/A', // Use grade as primary field
        // Keep class_name for backward compatibility but it's deprecated
        class_name: report.class_name,
        topics_taught: report.topics_taught,
        student_count: report.student_count || 0,
        duration_hours: report.duration_hours || 0,
        notes: report.notes,
        activities: report.activities,
        start_time: report.start_time,
        end_time: report.end_time,
        created_at: report.created_at,
        // Provide both formats for compatibility
        profiles: teacher ? { full_name: teacher.full_name, email: teacher.email } : null,
        schools: school ? { name: school.name } : null,
        teacher_name: teacher?.full_name || 'Unknown',
        teacher_email: teacher?.email || '',
        school_name: school?.name || 'Unknown'
      };
    });

    // Apply search filter if provided
    let filteredReports = transformedReports;
    if (search) {
       
      filteredReports = transformedReports.filter((report: any) => 
        report.teacher_name?.toLowerCase().includes(search.toLowerCase()) ||
        report.school_name?.toLowerCase().includes(search.toLowerCase()) ||
        report.grade?.toLowerCase().includes(search.toLowerCase()) ||
        report.topics_taught?.toLowerCase().includes(search.toLowerCase())
      );
    }

    return NextResponse.json({ reports: filteredReports });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/teacher-reports', {
      endpoint: '/api/admin/teacher-reports',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teacher-reports' },
      'Failed to fetch teacher reports'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

