import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../../lib/logger';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getTeacherUserId, validateTeacherSchoolAccess } from '../../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

interface AttendanceRecord {
  date?: string;
  status?: string;
  [key: string]: unknown;
}

interface MonthlyLog {
  id?: string;
  teacher_id?: string;
  school_id?: string | null;
  month?: string;
  year?: number;
  attendance_percentage?: number;
  present_days?: number;
  absent_days?: number;
  leave_days?: number;
  total_working_days?: number;
  [key: string]: unknown;
}

// GET - Fetch monthly attendance logs for teacher (uses pre-calculated monthly log table)
export async function GET(request: NextRequest) {
  // Get the authenticated teacher's user ID (secure)
  const teacherId = await getTeacherUserId(request);
  
  if (!teacherId) {
    logger.warn('Unauthorized access attempt to teacher monthly attendance', {
      endpoint: '/api/teacher/attendance/monthly',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
      { status: 401 }
    );
  }

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
    logger.info('Fetching teacher monthly attendance data', {
      endpoint: '/api/teacher/attendance/monthly',
      method: 'GET',
      userId: teacherId,
    });

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || searchParams.get('school_id') || undefined;
    const month = searchParams.get('month'); // Format: YYYY-MM
    const year = searchParams.get('year');
    const yearMonth = searchParams.get('yearMonth'); // Format: YYYY-MM
    const limit = parseInt(searchParams.get('limit') || '12'); // Default to 12 months

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

    // Build query for monthly attendance log - teachers can only see their own data
    let query = supabaseAdmin
      .from('teacher_monthly_attendance_log')
      .select(`
        *,
        schools (
          id,
          name,
          school_code
        )
      `)
      .eq('teacher_id', teacherId); // Only this teacher's data

    // Apply filters
    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    // If yearMonth is provided, filter to that specific month
    // Otherwise, show last 12 months (handled by limit)
    if (yearMonth) {
      // yearMonth format: YYYY-MM, convert to date (first day of month)
      const monthDate = new Date(`${yearMonth}-01`);
      query = query.eq('month', monthDate.toISOString().split('T')[0]);
    } else if (month) {
      // If only month provided, use current year
      const currentYear = new Date().getFullYear();
      const monthDate = new Date(`${currentYear}-${month}-01`);
      query = query.eq('month', monthDate.toISOString().split('T')[0]);
    } else if (year) {
      query = query.eq('year', parseInt(year));
    }
    // If no filters, show last 12 months (default limit)

    // Order by month descending (most recent first)
    query = query.order('month', { ascending: false }).limit(limit);

    logger.debug('Fetching teacher monthly attendance', {
      endpoint: '/api/teacher/attendance/monthly',
      teacherId,
      schoolId,
      month,
      year,
      yearMonth,
      limit,
    });

    const { data: monthlyLogs, error } = await query;

    if (error) {
      logger.error('Failed to fetch monthly attendance data', {
        endpoint: '/api/teacher/attendance/monthly',
        teacherId,
        schoolId,
        error: error.message,
        errorCode: error.code,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/attendance/monthly', teacherId, schoolId: schoolId || undefined },
        'Failed to fetch monthly attendance data'
      );
      
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // If no data in monthly log, calculate from attendance table as fallback
    let finalMonthlyLogs: MonthlyLog[] = (monthlyLogs || []) as MonthlyLog[];
    
    // If no data found, calculate from attendance table (for specific month or last N months)
    if (finalMonthlyLogs.length === 0) {
      logger.info('Monthly log empty, calculating from attendance table', {
        endpoint: '/api/teacher/attendance/monthly',
        yearMonth,
        month,
        teacherId,
        limit,
      });

      // Determine date range - if yearMonth specified, use that month; otherwise use last N months
      let startDate: Date;
      let endDate: Date = new Date();
      
      if (yearMonth) {
        // Single month requested
        startDate = new Date(`${yearMonth}-01`);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      } else if (month) {
        // Single month by number
        const currentYear = new Date().getFullYear();
        startDate = new Date(`${currentYear}-${month}-01`);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      } else {
        // Last N months (default to limit or 6)
        const monthsToGoBack = limit || 6;
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsToGoBack);
        startDate.setDate(1); // First day of the month
      }

      const dateRangeStart = startDate.toISOString().split('T')[0];
      const dateRangeEnd = endDate.toISOString().split('T')[0];

      // Get attendance data for this teacher across the date range
      let attendanceQuery = supabaseAdmin
        .from('attendance')
        .select(`
          user_id,
          school_id,
          status,
          date,
          schools (
            id,
            name,
            school_code
          )
        `)
        .eq('user_id', teacherId)
        .gte('date', dateRangeStart)
        .lte('date', dateRangeEnd);

      if (schoolId) {
        attendanceQuery = attendanceQuery.eq('school_id', schoolId);
      }

      const { data: attendanceData, error: attendanceError } = await attendanceQuery;

      if (attendanceError) {
        logger.error('Failed to fetch attendance data for fallback', {
          endpoint: '/api/teacher/attendance/monthly',
          error: attendanceError.message,
        });
      } else {
        // Get teacher's schools for display
        const { data: teacherSchools } = await supabaseAdmin
          .from('teacher_schools')
          .select('school_id, schools(id, name, school_code)')
          .eq('teacher_id', teacherId);

        // Initialize grouped object to store monthly data by school and month
        type TeacherSchool = {
          school_id: string | null;
          schools?: {
            id: string;
            name: string | null;
            school_code: string | null;
          } | null;
        };
        type MonthlyAttendanceEntry = {
          teacher_id: string;
          school_id: string | null;
          month: string;
          present_days: number;
          absent_days: number;
          leave_days: number;
          unreported_days: number;
          total_working_days: number;
          schools?: {
            id: string;
            name: string | null;
            school_code: string | null;
          } | null;
        };
        type AttendanceDataEntry = {
          user_id?: string;
          school_id?: string | null;
          status?: string | null;
          date?: string | null;
          schools?: {
            id: string;
            name: string | null;
            school_code: string | null;
          } | null;
        };
        const grouped: Record<string, MonthlyAttendanceEntry> = {};

        // Get schools to process
        const schoolsToProcess = schoolId 
          ? ((teacherSchools || []) as TeacherSchool[]).filter((ts) => ts.school_id === schoolId)
          : (teacherSchools || []) as TeacherSchool[];

        // Get all dates in the date range
        const dateRange: string[] = [];
        const currentDate = new Date(dateRangeStart);
        while (currentDate <= new Date(dateRangeEnd)) {
          dateRange.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // STEP 1: Calculate total working days first - loop through all dates and check for historical schedules
        // This ensures we count ALL days with schedules, regardless of attendance records
        for (const ts of schoolsToProcess) {
          for (const dateStr of dateRange) {
            const recordDate = new Date(dateStr);
            const monthKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
            const schoolKey = ts.school_id || 'no_school';
            const key = `${schoolKey}_${monthKey}`;
            
            // Initialize month entry if it doesn't exist
            if (!grouped[key]) {
              grouped[key] = {
                teacher_id: teacherId,
                school_id: ts.school_id,
                month: `${monthKey}-01`,
                present_days: 0,
                absent_days: 0,
                leave_days: 0,
                unreported_days: 0,
                total_working_days: 0,
                schools: ts.schools || ((attendanceData || []) as AttendanceDataEntry[]).find((a) => a.school_id === ts.school_id)?.schools,
              };
            }

            const date = new Date(dateStr);
            const dayOfWeek = daysOfWeek[date.getDay()];

            // Check if teacher has scheduled periods on this day using historical schedule lookup
            // Use effective dates to find the schedule that was active on this specific date
            // Important: Do NOT filter by is_active - we need historical accuracy
            const sid = ts.school_id ?? '';
            const { data: schedules } = await supabaseAdmin
              .from('class_schedules')
              .select('id')
              .eq('teacher_id', teacherId)
              .eq('school_id', sid)
              .eq('day_of_week', dayOfWeek)
              .lte('effective_from', dateStr) // Schedule was active from this date or before
              .or(`effective_to.is.null,effective_to.gte.${dateStr}`) // And hasn't ended yet, or ended after this date
              .limit(1);

            if (schedules && schedules.length > 0) {
              // Teacher has scheduled periods on this day - count as working day
              grouped[key].total_working_days++;
            }
          }
        }

        // STEP 2: Process attendance records to update present/absent/leave counts
        (attendanceData || []).forEach((record: AttendanceRecord) => {
          const recordDate = new Date(record.date ?? 0);
          const monthKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
          const schoolKey = record.school_id ?? 'no_school';
          const key = `${schoolKey}_${monthKey}`;
          
          // Initialize month entry if it doesn't exist (shouldn't happen after step 1, but safety check)
          if (!grouped[key]) {
            const recSchoolId = record.school_id;
            const recSchools = record.schools;
            grouped[key] = {
              teacher_id: teacherId,
              school_id: (recSchoolId == null ? null : recSchoolId) as string | null,
              month: `${monthKey}-01`,
              present_days: 0,
              absent_days: 0,
              leave_days: 0,
              unreported_days: 0,
              total_working_days: 0,
              schools: (recSchools as { id: string; name: string | null; school_code: string | null } | null) ?? null,
            };
          }

          // Update attendance counts based on status
          if (record.status === 'Present') {
            grouped[key].present_days++;
          } else if (record.status === 'Absent') {
            grouped[key].absent_days++;
          } else if (record.status?.startsWith('Leave-')) {
            grouped[key].leave_days++;
          } else if (record.status === 'Unreported') {
            grouped[key].unreported_days++;
          }
        });

        // STEP 3: Handle missing attendance for scheduled days (mark as absent/unreported)
        // This ensures days with schedules but no attendance records are counted
        for (const ts of schoolsToProcess) {
          for (const dateStr of dateRange) {
            const recordDate = new Date(dateStr);
            const monthKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
            const schoolKey = ts.school_id || 'no_school';
            const key = `${schoolKey}_${monthKey}`;
            
            if (!grouped[key]) continue; // Skip if no working days found (no schedules for this month)

            // Check if attendance record exists for this date
            const hasAttendance = (attendanceData || []).some((a: AttendanceRecord) => 
              a.user_id === teacherId && 
              a.school_id === ts.school_id && 
              a.date === dateStr
            );

            if (!hasAttendance && grouped[key].total_working_days > 0) {
              // Check if this date was counted as a working day (has schedule)
              const date = new Date(dateStr);
              const dayOfWeek = daysOfWeek[date.getDay()];
              
              const sid = ts.school_id ?? '';
              const { data: schedules } = await supabaseAdmin
                .from('class_schedules')
                .select('id')
                .eq('teacher_id', teacherId)
                .eq('school_id', sid)
                .eq('day_of_week', dayOfWeek)
                .lte('effective_from', dateStr)
                .or(`effective_to.is.null,effective_to.gte.${dateStr}`)
                .limit(1);

              if (schedules && schedules.length > 0) {
                // Has schedule but no attendance - check for approved leave
                const { data: leaves } = await supabaseAdmin
                  .from('teacher_leaves')
                  .select('id')
                  .eq('teacher_id', teacherId)
                  .eq('status', 'Approved')
                  .lte('start_date', dateStr)
                  .gte('end_date', dateStr)
                  .limit(1);

                if (!leaves || leaves.length === 0) {
                  // No attendance record, no leave - count as absent/unreported
                  grouped[key].absent_days++;
                }
              }
            }
          }
        }

        // Convert to array and calculate percentages - filter out invalid dates
        finalMonthlyLogs = Object.values(grouped)
          .filter((log: MonthlyLog) => {
            // Filter out entries with invalid or missing month dates
            if (!log.month) return false;
            const monthDate = new Date(log.month);
            return !isNaN(monthDate.getTime()); // Valid date check
          })
          .map((log: MonthlyLog) => {
            const monthDate = new Date(log.month ?? 0);
            const total = log.total_working_days ?? 0;
            const present = log.present_days ?? 0;
            const attendancePercentage = total > 0
              ? parseFloat(((present / total) * 100).toFixed(2))
              : 0;

            return {
              id: `temp_${log.teacher_id}_${log.school_id}_${log.month}`,
              teacher_id: log.teacher_id,
              school_id: log.school_id,
              month: log.month,
              year: monthDate.getFullYear(),
              month_number: monthDate.getMonth() + 1,
              present_days: log.present_days,
              absent_days: log.absent_days,
              leave_days: log.leave_days,
              unreported_days: log.unreported_days,
              total_working_days: log.total_working_days,
              attendance_percentage: attendancePercentage,
              schools: log.schools,
            };
          });

        logger.info('Calculated monthly attendance from attendance table', {
          endpoint: '/api/teacher/attendance/monthly',
          count: finalMonthlyLogs.length,
        });
      }
    }

    logger.info('Monthly attendance data fetched successfully', {
      endpoint: '/api/teacher/attendance/monthly',
      count: finalMonthlyLogs?.length || 0,
      teacherId,
      schoolId,
      fromCache: monthlyLogs?.length > 0,
    });

    // Transform data for frontend - filter out invalid dates and format month_name
    type MonthlyLogRow = { id?: string; teacher_id?: string; school_id?: string; month?: string; year?: number; month_number?: number; present_days?: number; present_count?: number; absent_days?: number; absent_count?: number; leave_days?: number; leave_count?: number; unreported_days?: number; unreported_count?: number; total_working_days?: number; total_days?: number };
    const transformedMonthlyData = (finalMonthlyLogs || [])
      .filter((log: MonthlyLogRow) => {
        if (!log.month) return false;
        const monthDate = new Date(log.month);
        return !isNaN(monthDate.getTime());
      })
      .map((log: MonthlyLogRow) => {
        const monthDate = new Date(log.month);
        // Format month name (we've already filtered out invalid dates above)
        const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        return {
          id: log.id,
          teacher_id: log.teacher_id,
          school_id: log.school_id,
          month: log.month,
          year: log.year || monthDate.getFullYear(),
          month_number: log.month_number || monthDate.getMonth() + 1,
          month_name: monthName,
          present_days: log.present_days || log.present_count || 0,
          absent_days: log.absent_days || log.absent_count || 0,
          leave_days: log.leave_days || log.leave_count || 0,
          unreported_days: log.unreported_days || log.unreported_count || 0,
          total_working_days: log.total_working_days || log.total_days || 0,
          attendance_percentage: parseFloat(log.attendance_percentage) || 0,
          created_at: log.created_at,
          updated_at: log.updated_at,
          schools: log.schools
        };
      });

    // Calculate summary statistics
    const summary = {
      total_months: transformedMonthlyData.length,
      average_attendance: transformedMonthlyData.length > 0
        ? Math.round(
            transformedMonthlyData.reduce((sum: number, log: MonthlyLog) => sum + (log.attendance_percentage || 0), 0) /
            transformedMonthlyData.length
          )
        : 0,
      total_present_days: transformedMonthlyData.reduce((sum: number, log: MonthlyLog) => sum + (log.present_days || 0), 0),
      total_absent_days: transformedMonthlyData.reduce((sum: number, log: MonthlyLog) => sum + (log.absent_days || 0), 0),
      total_leave_days: transformedMonthlyData.reduce((sum: number, log: MonthlyLog) => sum + (log.leave_days || 0), 0),
      total_working_days: transformedMonthlyData.reduce((sum: number, log: MonthlyLog) => sum + (log.total_working_days || 0), 0),
    };

    return NextResponse.json({ 
      monthlyData: transformedMonthlyData,
      summary
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/attendance/monthly', {
      endpoint: '/api/teacher/attendance/monthly',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/attendance/monthly' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

