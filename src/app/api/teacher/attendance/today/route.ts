import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getTeacherUserId } from '../../../../../lib/teacher-auth';
import { logger, handleApiError } from '../../../../../lib/logger';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

/**
 * GET /api/teacher/attendance/today
 * Get today's attendance status and report progress
 */
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
    const teacherId = await getTeacherUserId(request);
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id') || undefined;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get teacher's school_id if not provided
    let finalSchoolId = schoolId;
    
    if (!finalSchoolId) {
      logger.debug('Fetching teacher school assignment', {
        userId: teacherId,
        endpoint: '/api/teacher/attendance/today',
      });

      const { data: teacherSchools, error: teacherSchoolsError } = await supabaseAdmin
        .from('teacher_schools')
        .select('school_id, is_primary')
        .eq('teacher_id', teacherId)
        .order('is_primary', { ascending: false })
         
        .limit(1) as any;

      if (teacherSchoolsError) {
        logger.error('Failed to fetch teacher school assignment', {
          userId: teacherId,
          endpoint: '/api/teacher/attendance/today',
        }, teacherSchoolsError);
        
        const errorInfo = await handleApiError(
          teacherSchoolsError,
          { userId: teacherId, endpoint: '/api/teacher/attendance/today' },
          'Failed to fetch teacher school assignment'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }

      if (teacherSchools && teacherSchools.length > 0) {
        finalSchoolId = teacherSchools[0].school_id;
        logger.info('Teacher school assignment found', {
          userId: teacherId,
          schoolId: finalSchoolId,
          endpoint: '/api/teacher/attendance/today',
        });
      } else {
        logger.warn('Teacher has no school assignment', {
          userId: teacherId,
          endpoint: '/api/teacher/attendance/today',
        });
        
        return NextResponse.json(
          {
            error: 'Teacher not assigned to any school',
            details: 'Please contact your administrator to assign you to a school.',
            status: 404,
          },
          { status: 404 }
        );
      }
    }

    if (!finalSchoolId) {
      logger.error('Unable to determine school for teacher', {
        userId: teacherId,
        endpoint: '/api/teacher/attendance/today',
      });
      
      return NextResponse.json(
        {
          error: 'Unable to determine school for teacher',
          details: 'School ID is required but could not be determined.',
          status: 404,
        },
        { status: 404 }
      );
    }

    // Get the day of the week for the date
    const reportDate = new Date(date);
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = daysOfWeek[reportDate.getDay()];

    // Get all scheduled periods for this teacher on this day (with grade for matching)
    const { data: schedules, error: schedulesError } = await supabaseAdmin
      .from('class_schedules')
      .select('period_id, class_id, grade, subject, start_time, end_time')
      .eq('teacher_id', teacherId)
      .eq('school_id', finalSchoolId)
      .eq('day_of_week', dayOfWeek)
       
      .eq('is_active', true) as any;

    if (schedulesError) {
      console.error('Error fetching schedules:', schedulesError);
    }

    // Get unique period IDs from schedules
    const scheduledPeriodIds = new Set<string>();
    const periodDetails = new Map<string, any>(); // period_id -> schedule details
    if (schedules && schedules.length > 0) {
       
      schedules.forEach((s: any) => {
        if (s.period_id) {
          scheduledPeriodIds.add(s.period_id);
          // Store period details for later use
          if (!periodDetails.has(s.period_id)) {
            periodDetails.set(s.period_id, {
              period_id: s.period_id,
              grade: s.grade,
              subject: s.subject,
              start_time: s.start_time,
              end_time: s.end_time,
              class_id: s.class_id
            });
          }
        }
      });
    }

    const totalPeriodsForDay = scheduledPeriodIds.size;

    // Get all reports submitted by this teacher for this date (with grade for matching)
    const { data: dayReports, error: reportsError } = await supabaseAdmin
      .from('teacher_reports')
      .select('id, class_id, grade')
      .eq('teacher_id', teacherId)
      .eq('school_id', finalSchoolId)
       
      .eq('date', date) as any;

    if (reportsError) {
      console.error('Error fetching day reports:', reportsError);
    }

    const submittedReportsCount = dayReports?.length || 0;

    // Match reports to periods by grade (primary) or class_id (fallback)
    const periodsWithReports = new Set<string>();
     
    const submittedPeriodDetails: any[] = [];
    
    if (schedules && dayReports && scheduledPeriodIds.size > 0) {
       
      dayReports.forEach((report: any) => {
        // Try to match by grade first (since reports use grade as primary identifier)
         
        const matchingSchedules = schedules.filter((s: any) => {
          if (!s.period_id || !scheduledPeriodIds.has(s.period_id)) return false;
          
          // Match by grade (primary method)
          if (report.grade && s.grade && report.grade === s.grade) {
            return true;
          }
          
          // Fallback: match by class_id
          if (report.class_id && s.class_id && report.class_id === s.class_id) {
            return true;
          }
          
          return false;
        });
        
         
        matchingSchedules.forEach((s: any) => {
          if (s.period_id && !periodsWithReports.has(s.period_id)) {
            periodsWithReports.add(s.period_id);
            submittedPeriodDetails.push({
              period_id: s.period_id,
              grade: s.grade,
              subject: s.subject,
              start_time: s.start_time,
              end_time: s.end_time
            });
          }
        });
      });
    }
    
    // Get pending periods (periods without reports)
     
    const pendingPeriods = Array.from(periodDetails.values()).filter((period: any) => 
      !periodsWithReports.has(period.period_id)
    );

    // Check if all periods have reports
    const allPeriodsHaveReports = totalPeriodsForDay > 0 
      ? (periodsWithReports.size >= totalPeriodsForDay || submittedReportsCount >= totalPeriodsForDay)
      : submittedReportsCount > 0;

    // Get attendance record for this date
    logger.debug('Fetching attendance record', {
      userId: teacherId,
      schoolId: finalSchoolId,
      date,
      endpoint: '/api/teacher/attendance/today',
    });

    const { data: attendance, error: attendanceError } = await supabaseAdmin
      .from('attendance')
      .select('status, recorded_at')
      .eq('user_id', teacherId)
      .eq('school_id', finalSchoolId)
      .eq('date', date)
       
      .single() as any;

    if (attendanceError && attendanceError.code !== 'PGRST116') {
      logger.warn('Error fetching attendance (non-critical)', {
        userId: teacherId,
        schoolId: finalSchoolId,
        date,
        errorCode: attendanceError.code,
        endpoint: '/api/teacher/attendance/today',
      }, attendanceError);
    }

    logger.info('Attendance data fetched successfully', {
      userId: teacherId,
      schoolId: finalSchoolId,
      date,
      hasAttendance: !!attendance,
      totalPeriods: totalPeriodsForDay,
      endpoint: '/api/teacher/attendance/today',
    });

    return NextResponse.json({
      date,
      dayOfWeek,
      attendance: attendance || null,
      totalPeriods: totalPeriodsForDay,
      periodsWithReports: periodsWithReports.size,
      submittedReports: submittedReportsCount,
      allPeriodsHaveReports,
      status: attendance?.status || (allPeriodsHaveReports ? 'Pending' : 'Pending'),
      progress: totalPeriodsForDay > 0 
        ? Math.round((periodsWithReports.size / totalPeriodsForDay) * 100)
        : submittedReportsCount > 0 ? 100 : 0,
      submittedPeriods: submittedPeriodDetails,
      pendingPeriods: pendingPeriods
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/attendance/today', {
      endpoint: '/api/teacher/attendance/today',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/attendance/today' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}




