import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../../lib/logger';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { verifyAdmin } from '../../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

// GET - Fetch monthly attendance logs (uses pre-calculated monthly log table)
export async function GET(request: NextRequest) {
  // Verify admin access FIRST
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    logger.warn('Unauthorized access attempt to monthly teacher attendance', {
      endpoint: '/api/admin/teacher-attendance/monthly',
      method: 'GET',
    });
    return adminCheck.response;
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
    logger.info('Fetching monthly teacher attendance data', {
      endpoint: '/api/admin/teacher-attendance/monthly',
      method: 'GET',
      userId: adminCheck.userId,
    });

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId') || undefined;
    const schoolId = searchParams.get('schoolId') || undefined;
    const month = searchParams.get('month'); // Format: YYYY-MM
    const year = searchParams.get('year');
    const yearMonth = searchParams.get('yearMonth'); // Format: YYYY-MM
    const limit = parseInt(searchParams.get('limit') || '12'); // Default to 12 months

    // Build query for monthly attendance log
    let query = supabaseAdmin
      .from('teacher_monthly_attendance_log')
      .select(`
        *,
        profiles!teacher_monthly_attendance_log_teacher_id_fkey (
          id,
          full_name,
          email,
          role
        ),
        schools (
          id,
          name,
          school_code
        )
      `);

    // Apply filters
    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

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

    // Order by month descending (most recent first)
    query = query.order('month', { ascending: false }).limit(limit);

    logger.debug('Fetching monthly teacher attendance', {
      endpoint: '/api/admin/teacher-attendance/monthly',
      teacherId,
      schoolId,
      month,
      year,
      yearMonth,
      limit,
    });

    type MonthlyLogRow = {
      id?: string;
      teacher_id?: string;
      school_id?: string;
      month?: string;
      year?: number;
      month_number?: number;
      present_days?: number;
      absent_days?: number;
      leave_days?: number;
      unreported_days?: number;
      total_working_days?: number;
      attendance_percentage?: number | string;
      created_at?: string | null;
      updated_at?: string | null;
      profiles?: Profile | null;
      schools?: { id: string; name?: string | null; school_code?: string | null } | null;
    };
    const { data: monthlyLogs, error } = await query;

    if (error) {
      logger.error('Failed to fetch monthly attendance data', {
        endpoint: '/api/admin/teacher-attendance/monthly',
        teacherId,
        schoolId,
        error: error.message,
        errorCode: error.code,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/teacher-attendance/monthly', teacherId, schoolId: schoolId || undefined },
        'Failed to fetch monthly attendance data'
      );
      
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // If no data in monthly log, calculate from attendance table as fallback
    let finalMonthlyLogs: MonthlyLogRow[] = (monthlyLogs || []) as MonthlyLogRow[];
    
    if (finalMonthlyLogs.length === 0 && yearMonth) {
      logger.info('Monthly log empty, calculating from attendance table', {
        endpoint: '/api/admin/teacher-attendance/monthly',
        yearMonth,
      });

      // Calculate from attendance table
      const monthDate = new Date(`${yearMonth}-01`);
      const monthStart = monthDate.toISOString().split('T')[0];
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).toISOString().split('T')[0];

      // First, get all teacher IDs
      let teacherQuery = supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'teacher');

      if (teacherId) {
        teacherQuery = teacherQuery.eq('id', teacherId);
      }

      const { data: teachers, error: teachersError } = await teacherQuery;

      if (teachersError || !teachers || teachers.length === 0) {
        logger.warn('No teachers found for monthly attendance calculation', {
          endpoint: '/api/admin/teacher-attendance/monthly',
          teachersError: teachersError?.message,
        });
      } else {
        type TeacherId = { id: string };
        const teacherIds = ((teachers || []) as TeacherId[]).map((t) => t.id);

        // Now get attendance data for these teachers
        let attendanceQuery = supabaseAdmin
          .from('attendance')
          .select(`
            user_id,
            school_id,
            status,
            date,
            profiles!attendance_user_id_fkey (
              id,
              full_name,
              email,
              role
            ),
            schools (
              id,
              name,
              school_code
            )
          `)
          .in('user_id', teacherIds)
          .gte('date', monthStart)
          .lte('date', monthEnd);

        if (schoolId) {
          attendanceQuery = attendanceQuery.eq('school_id', schoolId);
        }

        const { data: attendanceData, error: attendanceError } = await attendanceQuery;

        if (attendanceError) {
          logger.error('Failed to fetch attendance data for fallback', {
            endpoint: '/api/admin/teacher-attendance/monthly',
            error: attendanceError.message,
          });
        } else {
          // Get teacher profiles and schools for display
          const teacherProfiles = await Promise.all(
            teacherIds.map(async (tid: string) => {
              const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('id, full_name, email, role')
                .eq('id', tid)
                .single();

              // Get teacher's schools
              const { data: teacherSchools } = await supabaseAdmin
                .from('teacher_schools')
                .select('school_id, schools(id, name, school_code)')
                .eq('teacher_id', tid);

              return { profile: profile as Profile | null, schools: (teacherSchools || []) as TeacherSchool[] };
            })
          );

          // Initialize grouped object to store monthly data by teacher and school
          // We'll populate working days first, then add attendance counts
          type TeacherSchool = {
            school_id: string;
            schools?: {
              id: string;
              name?: string | null;
              school_code?: string | null;
            } | null;
          };
          type GroupedData = {
            teacher_id: string;
            school_id: string;
            present_days: number;
            absent_days: number;
            leave_days: number;
            unreported_days: number;
            total_working_days: number;
            profiles?: Profile | null;
            schools?: {
              id: string;
              name?: string | null;
              school_code?: string | null;
            } | null;
          };
          const grouped: Record<string, GroupedData> = {};

          // Get all dates in the month
          const monthDates: string[] = [];
          const currentDate = new Date(monthStart);
          while (currentDate <= new Date(monthEnd)) {
            monthDates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
          }

          const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

          // STEP 1: Calculate total working days first - loop through all dates and check for historical schedules
          // This ensures we count ALL days with schedules, regardless of attendance records
          for (const { profile, schools: teacherSchools } of teacherProfiles as Array<{ profile: Profile | null; schools: TeacherSchool[] }>) {
            if (!profile) continue;

            const schoolsToProcess = schoolId 
              ? teacherSchools.filter((ts) => ts.school_id === schoolId)
              : teacherSchools;

            for (const ts of schoolsToProcess) {
              const key = `${profile.id}_${ts.school_id}`;
              
              // Initialize if not exists
              if (!grouped[key]) {
                grouped[key] = {
                  teacher_id: profile.id,
                  school_id: ts.school_id,
                  present_days: 0,
                  absent_days: 0,
                  leave_days: 0,
                  unreported_days: 0,
                  total_working_days: 0,
                  profiles: profile,
                  schools: ts.schools,
                };
              }

              // Check each date in the month for scheduled periods using historical schedule lookup
              for (const dateStr of monthDates) {
                const date = new Date(dateStr);
                const dayOfWeek = daysOfWeek[date.getDay()];

                // Check if teacher has scheduled periods on this day using historical schedule lookup
                // Use effective dates to find the schedule that was active on this specific date
                // Important: Do NOT filter by is_active - we need historical accuracy
                // Deleted schedules (is_active=false) should still count for historical dates
                const { data: schedules } = await supabaseAdmin
                  .from('class_schedules')
                  .select('id')
                  .eq('teacher_id', profile.id)
                  .eq('school_id', ts.school_id)
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
          }

          // STEP 2: Process attendance records to update present/absent/leave counts
          type AttendanceRecordRow = {
            user_id: string;
            school_id: string;
            status?: string | null;
            date?: string | null;
            profiles?: Profile | null;
            schools?: {
              id: string;
              name?: string | null;
              school_code?: string | null;
            } | null;
          };
          ((attendanceData || []) as AttendanceRecordRow[]).forEach((record) => {
            const key = `${record.user_id}_${record.school_id}`;
            
            // Initialize if not exists (shouldn't happen after step 1, but safety check)
            if (!grouped[key]) {
              grouped[key] = {
                teacher_id: record.user_id,
                school_id: record.school_id,
                present_days: 0,
                absent_days: 0,
                leave_days: 0,
                unreported_days: 0,
                total_working_days: 0,
                profiles: record.profiles,
                schools: record.schools,
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

          // Convert to array and calculate percentages
          finalMonthlyLogs = Object.values(grouped).map((log): MonthlyLogRow => {
            const attendancePercentage = log.total_working_days > 0
              ? parseFloat(((log.present_days / log.total_working_days) * 100).toFixed(2))
              : 0;

            return {
              id: `temp_${log.teacher_id}_${log.school_id}`,
              teacher_id: log.teacher_id,
              school_id: log.school_id,
              month: monthStart,
              year: monthDate.getFullYear(),
              month_number: monthDate.getMonth() + 1,
              present_days: log.present_days,
              absent_days: log.absent_days,
              leave_days: log.leave_days,
              unreported_days: log.unreported_days,
              total_working_days: log.total_working_days,
              attendance_percentage: attendancePercentage,
              profiles: log.profiles,
              schools: log.schools,
            };
          });

          logger.info('Calculated monthly attendance from attendance table', {
            endpoint: '/api/admin/teacher-attendance/monthly',
            count: finalMonthlyLogs.length,
          });
        }
      }
    }

    logger.info('Monthly attendance data fetched successfully', {
      endpoint: '/api/admin/teacher-attendance/monthly',
      count: finalMonthlyLogs?.length || 0,
      teacherId,
      schoolId,
      fromCache: monthlyLogs?.length > 0,
    });

    // Transform data for frontend
    type MonthlyLog = {
      id?: string;
      teacher_id: string;
      school_id: string;
      month?: string;
      year?: number;
      month_number?: number;
      present_days?: number;
      absent_days?: number;
      leave_days?: number;
      unreported_days?: number;
      total_working_days?: number;
      attendance_percentage?: number | string;
      created_at?: string | null;
      updated_at?: string | null;
      profiles?: Profile | null;
      schools?: {
        id: string;
        name?: string | null;
        school_code?: string | null;
      } | null;
    };
    const transformedMonthlyData = ((finalMonthlyLogs || []) as MonthlyLog[]).map((log) => ({
      id: log.id,
      teacher_id: log.teacher_id,
      school_id: log.school_id,
      month: log.month,
      year: log.year,
      month_number: log.month_number,
      month_name: new Date(log.month ?? '').toLocaleString('default', { month: 'long', year: 'numeric' }),
      present_days: log.present_days,
      absent_days: log.absent_days,
      leave_days: log.leave_days,
      unreported_days: log.unreported_days,
      total_working_days: log.total_working_days,
      attendance_percentage: parseFloat(String(log.attendance_percentage ?? 0)) || 0,
      created_at: log.created_at,
      updated_at: log.updated_at,
      profiles: log.profiles,
      schools: log.schools
    }));

    // Calculate summary statistics
    type _TransformedMonthlyData = {
      id?: string;
      teacher_id: string;
      school_id: string;
      month?: string;
      year?: number;
      month_number?: number;
      month_name?: string;
      present_days?: number;
      absent_days?: number;
      leave_days?: number;
      unreported_days?: number;
      total_working_days?: number;
      attendance_percentage: number;
      created_at?: string | null;
      updated_at?: string | null;
      profiles?: Profile | null;
      schools?: {
        id: string;
        name?: string | null;
        school_code?: string | null;
      } | null;
    };
    const summary = {
      total_months: transformedMonthlyData.length,
      average_attendance: transformedMonthlyData.length > 0
        ? Math.round(
            transformedMonthlyData.reduce((sum: number, log) => sum + (log.attendance_percentage || 0), 0) /
            transformedMonthlyData.length
          )
        : 0,
      total_present_days: transformedMonthlyData.reduce((sum: number, log) => sum + (log.present_days || 0), 0),
      total_absent_days: transformedMonthlyData.reduce((sum: number, log) => sum + (log.absent_days || 0), 0),
      total_leave_days: transformedMonthlyData.reduce((sum: number, log) => sum + (log.leave_days || 0), 0),
      total_working_days: transformedMonthlyData.reduce((sum: number, log) => sum + (log.total_working_days || 0), 0),
    };

    return NextResponse.json({ 
      monthlyData: transformedMonthlyData,
      summary
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/teacher-attendance/monthly', {
      endpoint: '/api/admin/teacher-attendance/monthly',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teacher-attendance/monthly' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

