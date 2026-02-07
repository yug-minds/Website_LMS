import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';
import type { SupabaseClient } from '@supabase/supabase-js';

interface MvAdminAnalyticsRow {
  total_schools?: number;
  total_teachers?: number;
  total_students?: number;
  active_courses?: number;
  total_reports?: number;
  avg_completion_rate?: number;
  avg_attendance?: number;
  schools_last_month?: number;
  teachers_last_month?: number;
  students_last_month?: number;
  courses_last_month?: number;
  last_updated?: string;
}

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
    // Note: Materialized view may not exist or may have different schema, so we gracefully fallback
    const { data: mvDataArray, error: mvError } = await supabaseAdmin
      .from('mv_admin_analytics')
      .select('total_schools, total_teachers, total_students, active_courses, total_reports, avg_completion_rate, avg_attendance, schools_last_month, teachers_last_month, students_last_month, courses_last_month, last_updated')
      .order('last_updated', { ascending: false })
      .limit(1);

    const mvData: MvAdminAnalyticsRow | null = mvDataArray && mvDataArray.length > 0 ? (mvDataArray[0] as MvAdminAnalyticsRow) : null;

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
        supabase.from('courses').select('id', { count: 'exact', head: true }).eq('is_published', true),
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
          .eq('is_published', true)
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
            studentCoursesResult.data.reduce((sum: number, course: { progress_percentage?: number | null }) => sum + (course.progress_percentage || 0), 0) / 
            studentCoursesResult.data.length
          )
        : 0;
    }

    // Calculate percentage changes
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Calculate all analytics data in parallel for better performance
    // This significantly reduces the total execution time
    const [
      monthlyGrowth,
      topSchools,
      popularCourses,
      schoolDistribution,
      teacherPerformance,
      courseEngagement
    ] = await Promise.all([
      calculateMonthlyGrowth(supabase),
      getTopPerformingSchools(supabase),
      getPopularCourses(supabase),
      getSchoolDistribution(supabase),
      getTeacherPerformanceDistribution(supabase),
      calculateCourseEngagement(supabase)
    ]);

    // Calculate system health based on actual metrics (if available)
    // System health is calculated as 100% minus error rate
    let systemHealth = 100;
    try {
      const { getMetrics } = await import('../../../../lib/monitoring');
      const metrics = getMetrics();
      if (metrics.totalRequests > 0) {
        const errorRate = metrics.failedRequests / metrics.totalRequests;
        systemHealth = Math.max(0, Math.min(100, Math.round((1 - errorRate) * 100 * 10) / 10));
      }
    } catch (error) {
      // If monitoring not available, default to 100% (no errors detected)
      logger.warn('Could not calculate system health from metrics', {
        endpoint: '/api/admin/analytics',
        error: error instanceof Error ? error.message : String(error)
      });
      systemHealth = 100;
    }

    const analyticsData = {
      analytics: {
        totalSchools,
        totalTeachers,
        totalStudents,
        activeCourses,
        systemHealth, // Calculated from actual API metrics (error rate)
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

 
async function calculateMonthlyGrowth(supabase: SupabaseClient) {
  // Get data for last 6 months - optimized to run all queries in parallel
  const monthPromises = [];
  
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    const monthName = date.toLocaleDateString('en-US', { month: 'short' });

    // Create promise for this month's data (all 4 queries in parallel)
    const monthPromise = Promise.all([
      supabase
        .from('schools')
        .select('id', { count: 'exact', head: true })
        .lte('created_at', monthEnd.toISOString()),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'teacher')
        .lte('created_at', monthEnd.toISOString()),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .lte('created_at', monthEnd.toISOString()),
      supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true)
        .lte('created_at', monthEnd.toISOString())
    ]).then(([schools, teachers, students, courses]) => ({
      name: monthName,
      schools: schools.count || 0,
      teachers: teachers.count || 0,
      students: students.count || 0,
      courses: courses.count || 0
    }));

    monthPromises.push(monthPromise);
  }

  // Execute all months in parallel for better performance
  const results = await Promise.all(monthPromises);
  return results;
}

 
async function getTopPerformingSchools(supabase: SupabaseClient<Record<string, unknown>>) {
  // Get schools with highest student counts or engagement
  // For now, we'll use student count as a proxy for performance
  const { data: studentSchools } = await supabase
    .from('student_schools')
    .select('school_id, schools(name)')
     
    .eq('is_active', true);

  if (!studentSchools) return [];

  const schoolCounts = new Map<string, { name: string; count: number }>();
  
   
  interface StudentSchool {
    school_id: string;
    schools?: { name?: string } | null;
  }
  
  studentSchools.forEach((ss: StudentSchool) => {
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
      .sort((a: { engagement: number }, b: { engagement: number }) => b.engagement - a.engagement)
      .slice(0, 3);
}

 
async function getPopularCourses(supabase: SupabaseClient<Record<string, unknown>>) {
  const { data: studentCourses } = await supabase
    .from('student_courses')
    .select('course_id, courses(course_name, grade)')
     
    .eq('is_completed', false);

  if (!studentCourses) return [];

  const courseCounts = new Map<string, { name: string; count: number }>();
  
  type CourseRef = { course_name?: string; grade?: string };
  type StudentCourseRow = { course_id: string; courses?: CourseRef | CourseRef[] | null };
  
  (studentCourses as StudentCourseRow[]).forEach((sc) => {
    const courseId = sc.course_id;
    const courses = Array.isArray(sc.courses) ? sc.courses[0] : sc.courses;
    const courseName = courses?.course_name || 'Unknown';
    const grade = courses?.grade || '';
    const displayName = grade ? `${courseName} - ${grade}` : courseName;
    
    const current = courseCounts.get(courseId) || { name: displayName, count: 0 };
    courseCounts.set(courseId, { ...current, count: current.count + 1 });
  });

  return Array.from(courseCounts.values())
    .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
    .slice(0, 3)
    .map((course: { name: string; count: number }) => ({
      name: course.name,
      students: course.count
    }));
}

 
async function getSchoolDistribution(supabase: SupabaseClient<Record<string, unknown>>) {
  // Get all schools with their types
  const { data: schools } = await supabase
    .from('schools')
     
    .select('id, school_type');

  if (!schools || schools.length === 0) {
    // Return empty array if no schools (no demo data)
    return [];
  }

  // Count schools by type
  const typeCounts = new Map<string, number>();
   
  interface School {
    id: string;
    school_type?: string | null;
  }
  
  schools.forEach((school: School) => {
    const type = school.school_type || 'Other';
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  // Map to chart format with colors
  type DistributionItem = {
    name: string;
    value: number;
    color: string;
    percentage?: number;
  };
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  const distribution: DistributionItem[] = Array.from(typeCounts.entries())
    .map(([name, value], index) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
      value,
      color: colors[index % colors.length]
    }));

  // Calculate percentages
  const total = distribution.reduce((sum: number, item) => sum + item.value, 0);
  return distribution.map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.value / total) * 100) : 0
  }));
}

 
async function getTeacherPerformanceDistribution(supabase: SupabaseClient<Record<string, unknown>>) {
  // Get all teachers from profiles
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'teacher');

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
  
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
  if (!dateStr) return { excellent: 0, good: 0, average: 0, needsImprovement: 0 };

  const { data: reports } = await supabase
    .from('teacher_reports')
    .select('teacher_id, date')
    .in('teacher_id', teacherIds)
    .gte('date', dateStr);

  // Calculate reports per teacher
  const teacherReportCounts = new Map<string, number>();
  if (reports) {
    interface Report {
      teacher_id?: string;
    }
    reports.forEach((report: Report) => {
      const teacherId = report.teacher_id;
      if (teacherId) {
        teacherReportCounts.set(teacherId, (teacherReportCounts.get(teacherId) || 0) + 1);
      }
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

async function calculateCourseEngagement(supabase: SupabaseClient<Record<string, unknown>>) {
  // Get all student course enrollments (using enrolled_at as proxy for activity)
  // Since student_courses doesn't have last_accessed, we'll calculate overall engagement
  const { data: allEnrollments, error } = await supabase
    .from('student_courses')
    .select('progress_percentage, is_completed, enrolled_at')
    .limit(10000); // Limit to prevent huge queries
  
  if (error || !allEnrollments || allEnrollments.length === 0) {
    // Return empty array if no data available
    return [];
  }
  
  // Calculate overall average engagement and completion
  const totalProgress = allEnrollments.reduce((sum: number, e: { progress_percentage?: number }) => 
    sum + (e.progress_percentage || 0), 0);
  const avgProgress = Math.round(totalProgress / allEnrollments.length);
  
  const completedCount = allEnrollments.filter((e: { is_completed?: boolean }) => e.is_completed).length;
  const completionRate = Math.round((completedCount / allEnrollments.length) * 100);
  
  // For weekly breakdown, use enrolled_at to group by enrollment week
  // This gives us a sense of when students enrolled, which correlates with engagement
  const now = new Date();
  const weeklyData = [];
  
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i * 7) - (now.getDay() || 7) + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    // Filter enrollments that were created during this week
    const weekEnrollments = allEnrollments.filter((e: { enrolled_at?: string }) => {
      if (!e.enrolled_at) return false;
      const enrolledDate = new Date(e.enrolled_at);
      return enrolledDate >= weekStart && enrolledDate <= weekEnd;
    });
    
    if (weekEnrollments.length > 0) {
      const weekProgress = weekEnrollments.reduce((sum: number, e: { progress_percentage?: number }) => 
        sum + (e.progress_percentage || 0), 0);
      const weekAvgProgress = Math.round(weekProgress / weekEnrollments.length);
      const weekCompleted = weekEnrollments.filter((e: { is_completed?: boolean }) => e.is_completed).length;
      const weekCompletionRate = Math.round((weekCompleted / weekEnrollments.length) * 100);
      
      weeklyData.push({
        name: `Week ${4 - i}`,
        engagement: weekAvgProgress,
        completion: weekCompletionRate
      });
    } else {
      // If no enrollments in this week, use overall averages
      weeklyData.push({
        name: `Week ${4 - i}`,
        engagement: avgProgress,
        completion: completionRate
      });
    }
  }
  
  return weeklyData;
}

