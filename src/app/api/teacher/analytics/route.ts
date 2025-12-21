import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId, validateTeacherSchoolAccess } from '../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
export async function GET(request: NextRequest) {
  
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

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id');
    const period = searchParams.get('period') || '3months';

    // If school_id is provided, validate that teacher is assigned to that school
    if (schoolId) {
      const hasAccess = await validateTeacherSchoolAccess(schoolId, request);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Forbidden: Teacher is not assigned to this school' },
          { status: 403 }
        );
      }
    }

    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    const months = period === '6months' ? 6 : 3;
    startDate.setMonth(startDate.getMonth() - months);

    // Build base queries - filter by teacher_id and optionally by school_id
    const attendanceQuery = supabaseAdmin
      .from('teacher_monthly_attendance')
      .select('id, teacher_id, month, days_present, days_absent, days_leave, total_days, created_at, updated_at')
      .eq('teacher_id', teacherId)
      .gte('month', startDate.toISOString().substring(0, 7) + '-01')
      .lte('month', endDate.toISOString().substring(0, 7) + '-01')
      .order('month', { ascending: true });

    let classQuery = supabaseAdmin
      .from('teacher_classes')
      .select(`
        classes (
          id,
          class_name,
          grade,
          subject
        )
      `)
      .eq('teacher_id', teacherId);

    let reportsQuery = supabaseAdmin
      .from('teacher_reports')
      .select(`
        class_id,
        classes (
          class_name
        )
      `)
      .eq('teacher_id', teacherId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    // Apply school_id filter if provided
    if (schoolId) {
      classQuery = classQuery.eq('school_id', schoolId);
      reportsQuery = reportsQuery.eq('school_id', schoolId);
    }

    // Get monthly attendance data (using admin client to bypass RLS)
    const { data: attendanceData, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      console.error('Error fetching attendance data:', attendanceError);
    }

    // Get class performance data (using admin client to bypass RLS)
    const { data: classData, error: classError } = await classQuery;

    if (classError) {
      console.error('Error fetching class data:', classError);
    }

    // Get reports data for class performance (using admin client to bypass RLS)
    const { data: reportsData, error: reportsError } = await reportsQuery;

    if (reportsError) {
      console.error('Error fetching reports data:', reportsError);
    }

    // Process monthly attendance data (return raw data for hooks)
    // The view returns data in format: { teacher_id, school_id, month, present_count, absent_count, leave_count, unreported_count, total_days }
     
    const attendanceDataTyped = attendanceData as any[] | null;
     
    const monthlyAttendanceRaw = attendanceDataTyped?.map((item: any) => ({
      teacher_id: item.teacher_id,
      school_id: item.school_id,
      month: item.month,
      present_count: item.present_count || 0,
      absent_count: item.absent_count || 0,
      leave_count: item.leave_count || 0,
      unreported_count: item.unreported_count || 0,
      total_days: item.total_days || 0
    })) || [];
    
     
    const monthlyAttendance = attendanceDataTyped?.map((item: any) => ({
      month: new Date(item.month).toLocaleDateString('en-US', { month: 'short' }),
      present: item.present_count || 0,
      absent: item.absent_count || 0,
      leave: item.leave_count || 0,
      unreported: item.unreported_count || 0,
      total_days: item.total_days || 0
    })) || [];

    // Process class performance data
     
    const classPerformance = (classData as any)?.map((tc: any) => {
       
      const classReports = (reportsData as any)?.filter((r: any) => r.class_id === (tc.classes as any)?.[0]?.id) || [];
      // Calculate attendance percentage from actual attendance data
      // For now, set to 0 if no attendance data is available
      const attendance_percentage = 0; // Calculate from database - no mock data
      return {
         
        grade: (tc.classes as any)?.[0]?.grade || 'Unknown',
        // Keep class_name for backward compatibility
         
        class_name: (tc.classes as any)?.[0]?.class_name || (tc.classes as any)?.[0]?.grade || 'Unknown',
        reports_submitted: classReports.length,
        attendance_percentage
      };
    }) || [];

    // Calculate weekly activity from actual reports data
    // Get reports from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: weeklyReports, error: weeklyReportsError } = await supabaseAdmin
      .from('teacher_reports')
      .select('date, start_time, end_time')
      .eq('teacher_id', teacherId)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
       
      .order('date', { ascending: true }) as any;
    
    // Calculate activity by day of week
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyActivity = daysOfWeek.map((day: any) => {
      if (!weeklyReports || weeklyReportsError) {
        return { day, reports: 0, hours_taught: 0 };
      }
      
      // Filter reports for this day of week
       
      const dayReports = weeklyReports.filter((report: any) => {
        const reportDate = new Date(report.date);
        const dayIndex = reportDate.getDay();
        return daysOfWeek[dayIndex] === day;
      });
      
      // Calculate hours taught from start_time and end_time
      let hoursTaught = 0;
       
      dayReports.forEach((report: any) => {
        if (report.start_time && report.end_time) {
          const start = new Date(`2000-01-01T${report.start_time}`);
          const end = new Date(`2000-01-01T${report.end_time}`);
          const diffMs = end.getTime() - start.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          hoursTaught += Math.max(0, diffHours);
        }
      });
      
      return {
        day,
        reports: dayReports.length,
        hours_taught: Math.round(hoursTaught * 10) / 10 // Round to 1 decimal place
      };
    });

    // Get subject distribution with actual student counts from database
    const subjectDistribution = await Promise.all(
       
      ((classData as any) || []).reduce((acc: any[], tc: any) => {
         
        const subject = (tc.classes as any)?.[0]?.subject || 'Unknown';
         
        const classId = (tc.classes as any)?.[0]?.id;
        const existing = acc.find((s: any) => s.subject === subject);
        if (existing) {
          existing.classes += 1;
          if (classId) existing.classIds.push(classId);
        } else {
          acc.push({ subject, classes: 1, classIds: classId ? [classId] : [] });
        }
        return acc;
      }, [] as Array<{ subject: string; classes: number; classIds: string[] }>)
         
        .map(async (item: any) => {
          // Get actual student count from student_classes table
          let students = 0;
          if (item.classIds.length > 0) {
            const { data: studentClasses, error: studentClassesError } = await supabaseAdmin
              .from('student_classes')
              .select('student_id', { count: 'exact' })
              .in('class_id', item.classIds)
               
              .eq('is_active', true) as any;
            
            if (!studentClassesError && studentClasses) {
              students = studentClasses.length || 0;
            }
          }
          
          return {
            subject: item.subject,
            classes: item.classes,
            students
          };
        })
    ) || [];

    // Calculate overall stats
    const totalReports = reportsData?.length || 0;
    const avgAttendance = monthlyAttendance.length > 0 
      ? Math.round(monthlyAttendance.reduce((sum: number, m: any) => sum + (m.present / (m.present + m.absent + m.leave + m.unreported)) * 100, 0) / monthlyAttendance.length)
      : 0;
    const totalStudents = subjectDistribution.reduce((sum: number, s: any) => sum + s.students, 0);
    const totalClasses = subjectDistribution.reduce((sum: number, s: any) => sum + s.classes, 0);

    const analytics = {
      monthlyAttendance,
      monthlyAttendanceRaw, // Include raw data for hooks
      classPerformance,
      weeklyActivity,
      subjectDistribution,
      stats: {
        totalReports,
        avgAttendance,
        totalStudents,
        totalClasses
      }
    };

    return NextResponse.json({ analytics });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/analytics', {
      endpoint: '/api/teacher/analytics',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/analytics' },
      'Failed to fetch teacher analytics'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
