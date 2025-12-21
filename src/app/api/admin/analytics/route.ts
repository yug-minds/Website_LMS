import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


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

// Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }

  // Get access token for authenticated client
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid Authorization header' },
      { status: 401 }
    );
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  
  // Create authenticated client with RLS - admin policies will allow access
  const supabase = await createAuthenticatedClient(accessToken);

  try {
    // Try materialized view first (fastest - pre-computed)
    const { data: mvDataArray, error: mvError } = await supabaseAdmin
      .from('mv_admin_analytics')
      .select('total_schools, total_teachers, total_students, total_courses, total_reports, avg_completion_rate, monthly_growth_schools, monthly_growth_teachers, monthly_growth_students, monthly_growth_courses, last_updated')
      .order('last_updated', { ascending: false })
      .limit(1);

    const mvData = mvDataArray && mvDataArray.length > 0 ? mvDataArray[0] : null;

    let totalSchools = 0;
    let totalTeachers = 0;
    let totalStudents = 0;
    let activeCourses = 0;
    let schoolsLastMonthCount = 0;
    let teachersLastMonthCount = 0;
    let studentsLastMonthCount = 0;
    let coursesLastMonthCount = 0;
    let avgAttendance = 0;
    let completionRate = 0;

    if (!mvError && mvData) {
      // Use materialized view data
      logger.info('Admin analytics fetched from materialized view', {
        endpoint: '/api/admin/analytics',
        usingMaterializedView: true
      });
      
      totalSchools = mvData.total_schools || 0;
      totalTeachers = mvData.total_teachers || 0;
      totalStudents = mvData.total_students || 0;
      activeCourses = mvData.active_courses || 0;
      schoolsLastMonthCount = mvData.schools_last_month || 0;
      teachersLastMonthCount = mvData.teachers_last_month || 0;
      studentsLastMonthCount = mvData.students_last_month || 0;
      coursesLastMonthCount = mvData.courses_last_month || 0;
      avgAttendance = mvData.avg_attendance || 0;
      completionRate = mvData.avg_completion_rate || 0;
    } else {
      // Fallback to individual queries if materialized view not available
      logger.warn('Materialized view not available, using individual queries', {
        endpoint: '/api/admin/analytics',
        mvError: mvError?.message
      });

      const [
        schoolsResult,
        teachersResult,
        studentsResult,
        coursesResult,
        reportsResult,
        studentCoursesResult
      ] = await Promise.all([
        supabase.from('schools').select('id', { count: 'exact' }),
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'teacher'),
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student'),
        supabase.from('courses').select('id', { count: 'exact' }).eq('status', 'Published'),
        supabase.from('teacher_reports').select('id', { count: 'exact' }),
        supabase.from('student_courses').select('progress_percentage')
      ]);

      const now = new Date();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const [
        schoolsLastMonth,
        teachersLastMonth,
        studentsLastMonth,
        coursesLastMonth
      ] = await Promise.all([
        supabase
          .from('schools')
          .select('id', { count: 'exact' })
          .lte('created_at', lastMonthEnd.toISOString()),
        supabase
          .from('profiles')
          .select('id', { count: 'exact' })
          .eq('role', 'teacher')
          .lte('created_at', lastMonthEnd.toISOString()),
        supabase
          .from('profiles')
          .select('id', { count: 'exact' })
          .eq('role', 'student')
          .lte('created_at', lastMonthEnd.toISOString()),
        supabase
          .from('courses')
          .select('id', { count: 'exact' })
          .eq('status', 'Published')
          .lte('created_at', lastMonthEnd.toISOString())
      ]);

      totalSchools = schoolsResult.count || 0;
      totalTeachers = teachersResult.count || 0;
      totalStudents = studentsResult.count || 0;
      activeCourses = coursesResult.count || 0;
      schoolsLastMonthCount = schoolsLastMonth.count || 0;
      teachersLastMonthCount = teachersLastMonth.count || 0;
      studentsLastMonthCount = studentsLastMonth.count || 0;
      coursesLastMonthCount = coursesLastMonth.count || 0;

      const totalReports = reportsResult.count || 0;
      avgAttendance = totalTeachers > 0 
        ? Math.round((totalReports / (totalTeachers * 20)) * 100)
        : 0;

      completionRate = studentCoursesResult.data && studentCoursesResult.data.length > 0
        ? Math.round(
            studentCoursesResult.data.reduce((sum: number, course: any) => sum + (course.progress_percentage || 0), 0) / 
            studentCoursesResult.data.length
          )
        : 0;
    }

    // Calculate percentage changes
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Calculate monthly growth data (last 6 months)
    const monthlyGrowth = await calculateMonthlyGrowth(supabase);

    // Get top performing schools and popular courses
    const topSchools = await getTopPerformingSchools(supabase);
    const popularCourses = await getPopularCourses(supabase);

    // Get school distribution by type
    const schoolDistribution = await getSchoolDistribution(supabase);

    // Get teacher performance distribution
    const teacherPerformance = await getTeacherPerformanceDistribution(supabase);
    
    // Calculate course engagement (weekly trends)
    const courseEngagement = await calculateCourseEngagement(supabase);

    const analyticsData = {
      analytics: {
        totalSchools,
        totalTeachers,
        totalStudents,
        activeCourses,
        systemHealth: 99.9, // System uptime - can be calculated from logs if available
        avgAttendance: Math.min(100, Math.max(0, avgAttendance)),
        completionRate: Math.min(100, Math.max(0, completionRate))
      },
      trends: {
        schoolsChange: calculateChange(totalSchools, schoolsLastMonthCount),
        teachersChange: calculateChange(totalTeachers, teachersLastMonthCount),
        studentsChange: calculateChange(totalStudents, studentsLastMonthCount),
        coursesChange: calculateChange(activeCourses, coursesLastMonthCount)
      },
      monthlyGrowth,
      topSchools,
      popularCourses,
      schoolDistribution,
      teacherPerformance,
      courseEngagement
    };

    const requestStartTime = Date.now();
    const response = NextResponse.json(analyticsData);
    
    // Add HTTP caching headers
    addCacheHeaders(response, analyticsData, {
      ...CachePresets.DASHBOARD_STATS,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/admin/analytics',
        statusCode: 304,
        is304: true,
        hasETag: true,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: 0,
        duration: Date.now() - requestStartTime
      });
      return new NextResponse(null, { status: 304 });
    }

    // Track 200 response
    const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
    recordHttpCacheOperation({
      endpoint: '/api/admin/analytics',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(analyticsData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/analytics', {
      endpoint: '/api/admin/analytics',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/analytics' },
      'Failed to fetch analytics'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

 
async function calculateMonthlyGrowth(supabase: any) {
  const months: Array<{ name: string; schools: number; teachers: number; students: number; courses: number }> = [];
  
  // Get data for last 6 months
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    const monthName = date.toLocaleDateString('en-US', { month: 'short' });

    const [schools, teachers, students, courses] = await Promise.all([
      supabase
        .from('schools')
        .select('id', { count: 'exact' })
        .lte('created_at', monthEnd.toISOString()),
      supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('role', 'teacher')
        .lte('created_at', monthEnd.toISOString()),
      supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('role', 'student')
        .lte('created_at', monthEnd.toISOString()),
      supabase
        .from('courses')
        .select('id', { count: 'exact' })
        .eq('status', 'Published')
        .lte('created_at', monthEnd.toISOString())
    ]);

    months.push({
      name: monthName,
      schools: schools.count || 0,
      teachers: teachers.count || 0,
      students: students.count || 0,
      courses: courses.count || 0
    });
  }

  return months;
}

 
async function getTopPerformingSchools(supabase: any) {
  // Get schools with highest student counts or engagement
  // For now, we'll use student count as a proxy for performance
  const { data: studentSchools } = await supabase
    .from('student_schools')
    .select('school_id, schools(name)')
     
    .eq('is_active', true) as any;

  if (!studentSchools) return [];

  const schoolCounts = new Map<string, { name: string; count: number }>();
  
   
  studentSchools.forEach((ss: any) => {
    const schoolId = ss.school_id;
    const schoolName = ss.schools?.name || 'Unknown';
    const current = schoolCounts.get(schoolId) || { name: schoolName, count: 0 };
    schoolCounts.set(schoolId, { ...current, count: current.count + 1 });
  });

    // Calculate actual engagement based on reports and students
    const schoolEngagements = await Promise.all(
      Array.from(schoolCounts.entries()).map(async ([schoolId, school]) => {
        // Get reports for this school in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { count: reportCount } = await supabase
          .from('teacher_reports')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);
        
        // Calculate engagement: reports per student (normalized to 0-100)
        // Assuming 20 working days, ideal would be 1 report per student per day
        const idealReports = school.count * 20;
        const engagement = idealReports > 0 
          ? Math.min(100, Math.round((reportCount || 0) / idealReports * 100))
          : 0;
        
        return {
          name: school.name,
          engagement
        };
      })
    );
    
    return schoolEngagements
      .sort((a: any, b: any) => b.engagement - a.engagement)
      .slice(0, 3);
}

 
async function getPopularCourses(supabase: any) {
  const { data: studentCourses } = await supabase
    .from('student_courses')
    .select('course_id, courses(course_name, grade)')
     
    .eq('is_completed', false) as any;

  if (!studentCourses) return [];

  const courseCounts = new Map<string, { name: string; count: number }>();
  
   
  studentCourses.forEach((sc: any) => {
    const courseId = sc.course_id;
    const courseName = sc.courses?.course_name || 'Unknown';
    const grade = sc.courses?.grade || '';
    const displayName = grade ? `${courseName} - ${grade}` : courseName;
    
    const current = courseCounts.get(courseId) || { name: displayName, count: 0 };
    courseCounts.set(courseId, { ...current, count: current.count + 1 });
  });

  return Array.from(courseCounts.values())
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 3)
    .map((course: any) => ({
      name: course.name,
      students: course.count
    }));
}

 
async function getSchoolDistribution(supabase: any) {
  // Get all schools with their types
  const { data: schools } = await supabase
    .from('schools')
     
    .select('id, school_type') as any;

  if (!schools || schools.length === 0) {
    // Return default distribution if no schools
    return [
      { name: 'Other', value: 0, color: '#8884D8' }
    ];
  }

  // Count schools by type
  const typeCounts = new Map<string, number>();
   
  schools.forEach((school: any) => {
    const type = school.school_type || 'Other';
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  // Map to chart format with colors
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  const distribution = Array.from(typeCounts.entries())
    .map(([name, value], index) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
      value,
      color: colors[index % colors.length]
    }));

  // Calculate percentages
  const total = distribution.reduce((sum: number, item: any) => sum + item.value, 0);
  return distribution.map((item: any) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.value / total) * 100) : 0
  }));
}

 
async function getTeacherPerformanceDistribution(supabase: any) {
  // Get all teachers from profiles
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id')
     
    .eq('role', 'teacher') as any;

  if (!teachers || teachers.length === 0) {
    return {
      excellent: 0,
      good: 0,
      average: 0,
      needsImprovement: 0
    };
  }

  const teacherIds = teachers.map((t: { id: string }) => t.id).filter(Boolean) as string[];
  
  // Get teacher reports for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: reports } = await supabase
    .from('teacher_reports')
    .select('teacher_id, date')
    .in('teacher_id', teacherIds)
     
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0]) as any;

  // Calculate reports per teacher
  const teacherReportCounts = new Map<string, number>();
  if (reports) {
     
    reports.forEach((report: any) => {
      const teacherId = report.teacher_id;
      teacherReportCounts.set(teacherId, (teacherReportCounts.get(teacherId) || 0) + 1);
    });
  }

  // Categorize teachers based on report frequency
  // Excellent: 15+ reports (75%+ attendance assuming 20 working days)
  // Good: 10-14 reports (50-70% attendance)
  // Average: 5-9 reports (25-45% attendance)
  // Needs Improvement: <5 reports (<25% attendance)
  
  let excellent = 0;
  let good = 0;
  let average = 0;
  let needsImprovement = 0;

  teacherIds.forEach((teacherId: string) => {
    const reportCount = teacherReportCounts.get(teacherId) || 0;
    
    if (reportCount >= 15) {
      excellent++;
    } else if (reportCount >= 10) {
      good++;
    } else if (reportCount >= 5) {
      average++;
    } else {
      needsImprovement++;
    }
  });

  return {
    excellent,
    good,
    average,
    needsImprovement
  };
}

 
async function calculateCourseEngagement(supabase: any) {
  // Calculate weekly course engagement for last 4 weeks
  const weeks: Array<{ name: string; engagement: number; completion: number }> = [];
  const now = new Date();
  
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i * 7) - (now.getDay() || 7) + 1); // Start of week (Monday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // End of week (Sunday)
    
    // Get student course progress for this week
    const { data: courseProgress } = await supabase
      .from('student_courses')
      .select('progress_percentage, is_completed')
      .gte('last_accessed', weekStart.toISOString())
       
      .lte('last_accessed', weekEnd.toISOString()) as any;
    
    if (courseProgress && courseProgress.length > 0) {
      // Calculate average engagement (based on progress)
      const avgProgress = courseProgress.reduce((sum: number, cp: { progress_percentage?: number }) => sum + (cp.progress_percentage || 0), 0) / courseProgress.length;
      
      // Calculate completion rate
      const completed = courseProgress.filter((cp: { is_completed?: boolean }) => cp.is_completed).length;
      const completionRate = Math.round((completed / courseProgress.length) * 100);
      
      weeks.push({
        name: `Week ${4 - i}`,
        engagement: Math.round(avgProgress),
        completion: completionRate
      });
    } else {
      weeks.push({
        name: `Week ${4 - i}`,
        engagement: 0,
        completion: 0
      });
    }
  }
  
  return weeks;
}

