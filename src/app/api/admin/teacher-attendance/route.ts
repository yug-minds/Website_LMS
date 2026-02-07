import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { adminTeacherAttendanceSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface Teacher {
  id: string;
  email?: string;
  full_name?: string;
  [key: string]: unknown;
}

interface AttendanceRecord {
  date?: string;
  status?: string;
  status_original?: string;
  user_id?: string;
  teacher_id?: string;
  id?: string;
  school_id?: string;
  remarks?: string;
  recorded_by?: string;
  recorded_at?: string;
  profiles?: unknown;
  schools?: unknown;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface Profile {
  id: string;
  email?: string;
  [key: string]: unknown;
}

interface Leave {
  teacher_id?: string;
  leave_type?: string;
  [key: string]: unknown;
}

interface TeacherStatus {
  status: string;
  isOnLeave: boolean;
  leaveType?: string;
  attendanceRate?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface MonthlyLog {
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
  created_at?: string;
  updated_at?: string;
  profiles?: unknown;
  schools?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface AttendanceRecordWithId {
  id: string;
  user_id?: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for typing
interface ZodIssue {
  path: (string | number)[];
  message: string;
}

// GET - Fetch teacher attendance data (uses attendance table, teacher_attendance is deprecated)
export async function GET(request: NextRequest) {
  // Verify admin access FIRST
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    logger.warn('Unauthorized access attempt to teacher attendance', {
      endpoint: '/api/admin/teacher-attendance',
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
    logger.info('Fetching teacher attendance data', {
      endpoint: '/api/admin/teacher-attendance',
      method: 'GET',
      userId: adminCheck.userId,
    });

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId') || undefined;
    const schoolId = searchParams.get('schoolId') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = searchParams.get('limit') || '50';
    const month = searchParams.get('month'); // Format: YYYY-MM
    const year = searchParams.get('year');
    const useMonthlyLog = searchParams.get('useMonthlyLog') === 'true'; // Use monthly log table for faster queries

    // First, get all teacher profile IDs
    const { data: teacherProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'teacher');
    
    type ProfileId = {
      id: string;
    };
    const teacherProfileIds = ((teacherProfiles || []) as ProfileId[]).map((p) => p.id);
    
    // If no teachers found, return empty result
    if (teacherProfileIds.length === 0) {
      logger.info('No teachers found, returning empty attendance data', {
        endpoint: '/api/admin/teacher-attendance',
      });
      
      // Still return a summary with today's data
      const today = new Date().toISOString().split('T')[0];
      const { data: allTeachers } = await supabaseAdmin
        .from('teachers')
        .select('id, email, full_name, profile_id');
      
      const { data: todayLeaves } = await supabaseAdmin
        .from('teacher_leaves')
        .select('teacher_id, start_date, end_date, status, leave_type')
        .eq('status', 'Approved')
        .lte('start_date', today)
        .gte('end_date', today);
      
      const teacherTodayStatus: Record<string, { status: string; isOnLeave: boolean; leaveType?: string }> = {};
      type Teacher = {
        id: string;
        email?: string | null;
        full_name?: string | null;
        profile_id?: string | null;
      };
      ((allTeachers || []) as Teacher[]).forEach((teacher) => {
        teacherTodayStatus[teacher.id] = { status: 'Not Marked', isOnLeave: false };
      });
      
      return NextResponse.json({
        attendance: [],
        summary: {
          totalDays: 0,
          presentDays: 0,
          absentApprovedDays: 0,
          absentUnapprovedDays: 0,
          attendanceRate: 0,
          presentToday: 0,
          absentToday: (allTeachers || []).length,
          onLeaveToday: (todayLeaves || []).length,
          notMarkedToday: (allTeachers || []).length,
          totalTeachers: (allTeachers || []).length,
          teacherTodayStatus
        }
      });
    }

    // Use attendance table (generalized for teachers and students)
    // Filter by user_id IN teacher profile IDs
    // If no teacher profile IDs, return empty result
    let query = supabaseAdmin
      .from('attendance')
      .select(`
        *,
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
      `);
    
    // Only apply the filter if we have teacher profile IDs
    if (teacherProfileIds.length > 0) {
      query = query.in('user_id', teacherProfileIds);
    } else {
      // If no teachers, return empty result immediately
      query = query.eq('user_id', '00000000-0000-0000-0000-000000000000'); // This will return no results
    }
    
    query = query.order('date', { ascending: false }).limit(parseInt(limit));

    // Apply filters
    if (teacherId) {
      query = query.eq('user_id', teacherId);
    }

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    logger.debug('Fetching teacher attendance', {
      endpoint: '/api/admin/teacher-attendance',
      teacherId,
      schoolId,
      startDate,
      endDate,
      limit,
    });

    type AttendanceDbRow = {
      id?: string;
      user_id?: string;
      school_id?: string;
      date?: string;
      status?: string;
      status_original?: string;
      remarks?: string;
      recorded_by?: string;
      recorded_at?: string;
      profiles?: unknown;
      schools?: unknown;
    };
    const { data: attendance, error } = await query;

    if (error) {
      logger.error('Failed to fetch attendance data', {
        endpoint: '/api/admin/teacher-attendance',
        teacherId,
        schoolId,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/teacher-attendance', teacherId, schoolId: schoolId || undefined },
        'Failed to fetch attendance data'
      );
      
      // Return structured error response
      return NextResponse.json({
        error: errorInfo.message || 'Failed to fetch attendance data',
        details: errorInfo.details || (error instanceof Error ? error.message : 'Unknown error'),
        status: errorInfo.status || 500
      }, { status: errorInfo.status || 500 });
    }
    
    // If no teacher profile IDs, return empty result with summary
    if (teacherProfileIds.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      const { data: allTeachers } = await supabaseAdmin
        .from('teachers')
        .select('id, email, full_name, profile_id');
      
      const { data: todayLeaves } = await supabaseAdmin
        .from('teacher_leaves')
        .select('teacher_id, start_date, end_date, status, leave_type')
        .eq('status', 'Approved')
        .lte('start_date', today)
        .gte('end_date', today);
      
      const teacherTodayStatus: Record<string, { status: string; isOnLeave: boolean; leaveType?: string }> = {};
      type Teacher = {
        id: string;
        email?: string | null;
        full_name?: string | null;
        profile_id?: string | null;
      };
      ((allTeachers || []) as Teacher[]).forEach((teacher) => {
        teacherTodayStatus[teacher.id] = { status: 'Not Marked', isOnLeave: false };
      });
      
      return NextResponse.json({
        attendance: [],
        summary: {
          totalDays: 0,
          presentDays: 0,
          absentApprovedDays: 0,
          absentUnapprovedDays: 0,
          attendanceRate: 0,
          presentToday: 0,
          absentToday: (allTeachers || []).length,
          onLeaveToday: (todayLeaves || []).length,
          notMarkedToday: (allTeachers || []).length,
          totalTeachers: (allTeachers || []).length,
          teacherTodayStatus
        }
      });
    }

    logger.info('Attendance data fetched successfully', {
      endpoint: '/api/admin/teacher-attendance',
      count: attendance?.length || 0,
      teacherId,
      schoolId,
    });

    // Transform data to match old format (for backward compatibility)
     
    type _AttendanceRecordLocal = {
      id?: string;
      user_id?: string;
      school_id?: string;
      date?: string;
      status?: string;
      remarks?: string;
      recorded_by?: string;
      recorded_at?: string;
      profiles?: { full_name?: string; email?: string };
      schools?: { name?: string };
    };
    
    const transformedAttendance = ((attendance || []) as AttendanceDbRow[]).map((record) => ({
      id: record.id,
      user_id: record.user_id,
      teacher_id: record.user_id, // Map user_id to teacher_id for compatibility
      school_id: record.school_id,
      date: record.date,
      status: record.status,
      // Map status values for backward compatibility
      status_original: record.status === 'Leave-Approved' ? 'Absent (Approved)' :
                      record.status === 'Absent' ? 'Absent (Unapproved)' :
                      record.status === 'Present' ? 'Present' : record.status,
      remarks: record.remarks,
      notes: record.remarks, // Map remarks to notes for compatibility
      recorded_by: record.recorded_by,
      recorded_at: record.recorded_at,
      created_at: record.recorded_at,
      updated_at: record.recorded_at,
      profiles: record.profiles,
      schools: record.schools
    }));

    // Fetch approved leaves for today to account for teachers on leave
    const today = new Date().toISOString().split('T')[0];
    const { data: todayLeaves } = await supabaseAdmin
      .from('teacher_leaves')
      .select('teacher_id, start_date, end_date, status, leave_type')
      .eq('status', 'Approved')
      .lte('start_date', today)
      .gte('end_date', today);

    // Get all teachers from teachers table and their corresponding profiles
    const { data: allTeachers } = await supabaseAdmin
      .from('teachers')
      .select('id, email, full_name, profile_id');
    
    // Get all teacher profiles to match with leaves (leaves use profile.id as teacher_id)
    // Reuse the teacherProfiles we already fetched above
    const { data: teacherProfilesFull } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .eq('role', 'teacher');
    
    // Create a mapping: profile.id -> teacher record
    interface Teacher {
      id?: string;
      email?: string;
      full_name?: string;
      profile_id?: string;
    }
    
    interface Profile {
      id?: string;
      email?: string;
      full_name?: string;
    }
    
    const profileToTeacherMap: Record<string, Teacher> = {};
    const profilesList = (teacherProfilesFull || []) as Profile[];
    ((allTeachers || []) as Teacher[]).forEach((teacher: Teacher) => {
      const profile = profilesList.find((p: Profile) => p.email === teacher.email);
      if (profile?.id != null) {
        profileToTeacherMap[profile.id] = teacher;
      }
      if (teacher.profile_id) {
        profileToTeacherMap[teacher.profile_id] = teacher;
      }
    });

    // Calculate today's attendance
    const todayAttendance = transformedAttendance.filter((a) => (a.date ?? '') === today);
    
    // Build per-teacher today status (using teacher.id as key for frontend matching)
    const teacherTodayStatus: Record<string, { status: string; isOnLeave: boolean; leaveType?: string; attendanceRate?: number }> = {};
    
    // Calculate per-teacher attendance rates from their attendance records
    const teacherAttendanceRates: Record<string, number> = {};
    const teacherAttendanceCounts: Record<string, { present: number; total: number }> = {};
    
    // Initialize counts for all teachers
    (allTeachers || []).forEach((teacher: Teacher) => {
      const tid = teacher.id;
      if (tid != null) {
        teacherAttendanceCounts[tid] = { present: 0, total: 0 };
        teacherTodayStatus[tid] = { status: 'Not Marked', isOnLeave: false };
      }
    });
    
    // Calculate attendance rates from attendance records (current month only)
    // This matches the monthly attendance calculation for consistency
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthEndStr = monthEnd.toISOString().split('T')[0];
    
    ((attendance || []) as AttendanceDbRow[]).forEach((record) => {
      const uid = record.user_id;
      const teacher = uid != null ? profileToTeacherMap[uid] : undefined;
      const recordDate = record.date ?? '';
      if (teacher && recordDate >= monthStartStr && recordDate <= monthEndStr) {
        const tid = teacher.id;
        if (tid != null) {
          if (!teacherAttendanceCounts[tid]) {
            teacherAttendanceCounts[tid] = { present: 0, total: 0 };
          }
          teacherAttendanceCounts[tid].total++;
          if (record.status === 'Present' || (record.status_original ?? record.status) === 'Present') {
            teacherAttendanceCounts[tid].present++;
          }
        }
      }
    });
    
    // Calculate rates
    Object.keys(teacherAttendanceCounts).forEach((teacherId) => {
      const counts = teacherAttendanceCounts[teacherId];
      teacherAttendanceRates[teacherId] = counts.total > 0 
        ? Math.round((counts.present / counts.total) * 100) 
        : 0;
    });
    
    // Initialize all teachers as not marked (no attendance record)
    ((allTeachers || []) as Teacher[]).forEach((teacher: Teacher) => {
      const tid = teacher.id;
      if (tid != null) {
        teacherTodayStatus[tid] = { 
          status: 'Not Marked', 
          isOnLeave: false,
          attendanceRate: teacherAttendanceRates[tid] || 0
        };
      }
    });
    
    // First, update with actual attendance records for today
    todayAttendance.forEach((record) => {
      const recordTeacherId = record.teacher_id ?? record.user_id;
      const profile = recordTeacherId != null ? profilesList.find((p: Profile) => p.id === recordTeacherId) : undefined;
      const pid = profile?.id;
      if (pid != null) {
        const teacher = profileToTeacherMap[pid] || 
                       (allTeachers || []).find((t: Teacher) => t.email === profile?.email);
        const tid = teacher?.id;
        if (tid != null && teacherTodayStatus[tid]) {
          const status = (record as { status_original?: string }).status_original || record.status;
          if (!teacherTodayStatus[tid].isOnLeave) {
            teacherTodayStatus[tid] = {
              status: status === 'Leave-Approved' ? 'On Leave' : 
                     status === 'Present' ? 'Present' : 
                     status === 'Absent' ? 'Absent' : (status ?? 'Not Marked'),
              isOnLeave: status === 'Leave-Approved',
              leaveType: status === 'Leave-Approved' ? 'Approved Leave' : undefined,
              attendanceRate: teacherAttendanceRates[tid] || teacherTodayStatus[tid].attendanceRate || 0
            };
          }
        }
      }
    });
    
    // Then, mark teachers on approved leave today (leaves take precedence over attendance records)
    // Leaves use profile.id as teacher_id
    (todayLeaves || []).forEach((leave: Leave) => {
      const lid = leave.teacher_id;
      const teacher = lid != null ? profileToTeacherMap[lid] : undefined;
      const tid = teacher?.id;
      if (tid != null && teacherTodayStatus[tid]) {
        teacherTodayStatus[tid] = {
          status: 'On Leave',
          isOnLeave: true,
          leaveType: leave.leave_type || 'Leave',
          attendanceRate: teacherAttendanceRates[tid] || teacherTodayStatus[tid].attendanceRate || 0
        };
      }
    });
    
    // Calculate today's counts
    const presentToday = Object.values(teacherTodayStatus).filter((s: TeacherStatus) => s.status === 'Present').length;
    const onLeaveToday = Object.values(teacherTodayStatus).filter((s: TeacherStatus) => s.isOnLeave).length;
    const notMarkedToday = Object.values(teacherTodayStatus).filter((s: TeacherStatus) => s.status === 'Not Marked').length;
    const absentToday = Object.values(teacherTodayStatus).filter((s: TeacherStatus) => 
      s.status === 'Absent' || s.status === 'On Leave'
    ).length;

    // Calculate attendance summary
    const summary = calculateAttendanceSummary(transformedAttendance);
    
    // Add today's specific counts
    const enhancedSummary = {
      ...summary,
      presentToday,
      absentToday,
      onLeaveToday,
      notMarkedToday,
      totalTeachers: (allTeachers || []).length,
      teacherTodayStatus
    };

    logger.info('Attendance summary calculated', {
      endpoint: '/api/admin/teacher-attendance',
      presentToday,
      absentToday,
      onLeaveToday,
      totalTeachers: (allTeachers || []).length
    });

    // If requesting monthly data, also fetch from monthly log table
    let monthlyData = null;
    if (month || year || useMonthlyLog) {
      try {
        let monthlyQuery = supabaseAdmin
          .from('teacher_monthly_attendance_log')
          .select(`
            *,
            profiles!teacher_monthly_attendance_log_teacher_id_fkey (
              id,
              full_name,
              email
            ),
            schools (
              id,
              name,
              school_code
            )
          `);

        if (teacherId) {
          monthlyQuery = monthlyQuery.eq('teacher_id', teacherId);
        }
        if (schoolId) {
          monthlyQuery = monthlyQuery.eq('school_id', schoolId);
        }
        if (month) {
          // month format: YYYY-MM, convert to date (first day of month)
          const monthDate = new Date(`${month}-01`);
          monthlyQuery = monthlyQuery.eq('month', monthDate.toISOString().split('T')[0]);
        }
        if (year) {
          monthlyQuery = monthlyQuery.eq('year', parseInt(year));
        }

        const { data: monthlyLogs, error: monthlyError } = await monthlyQuery.order('month', { ascending: false });

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
          created_at?: string;
          updated_at?: string;
          profiles?: unknown;
          schools?: unknown;
        };
        if (!monthlyError && monthlyLogs) {
          monthlyData = (monthlyLogs as MonthlyLogRow[]).map((log) => ({
            id: log.id,
            teacher_id: log.teacher_id,
            school_id: log.school_id,
            month: log.month,
            year: log.year,
            month_number: log.month_number,
            present_days: log.present_days,
            absent_days: log.absent_days,
            leave_days: log.leave_days,
            unreported_days: log.unreported_days,
            total_working_days: log.total_working_days,
            attendance_percentage: log.attendance_percentage,
            created_at: log.created_at,
            updated_at: log.updated_at,
            profiles: log.profiles,
            schools: log.schools
          }));
        }
      } catch (monthlyErr) {
        logger.warn('Error fetching monthly attendance logs', {
          endpoint: '/api/admin/teacher-attendance',
          error: monthlyErr instanceof Error ? monthlyErr.message : String(monthlyErr)
        });
      }
    }

    return NextResponse.json({ 
      attendance: transformedAttendance,
      summary: enhancedSummary,
      monthlyData: monthlyData || undefined
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/teacher-attendance', {
      endpoint: '/api/admin/teacher-attendance',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teacher-attendance' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST - Create or update attendance record (uses attendance table, teacher_attendance is deprecated)
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(adminTeacherAttendanceSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e) => `${(e.path as (string | number)[]).join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher attendance', {
        endpoint: '/api/admin/teacher-attendance',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const {
      teacher_id,
      school_id,
      date,
      status,
      check_in_time,
      check_out_time,
      notes // Note: Database column is 'remarks', but API accepts 'notes' for consistency
    } = validation.data;

    // Map status values from teacher_attendance format to attendance format
    let mappedStatus = status;
    if (status === 'Absent (Approved)') {
      mappedStatus = 'Leave-Approved';
    } else if (status === 'Absent (Unapproved)') {
      mappedStatus = 'Absent';
    } else if (status === 'Late') {
      mappedStatus = 'Present'; // Late is treated as Present, can add note about being late
    } else if (status === 'Present') {
      mappedStatus = 'Present';
    }

    // Build remarks with check-in/out times if provided
    let remarks = notes || '';
    if (check_in_time || check_out_time) {
      const timeInfo = [];
      if (check_in_time) timeInfo.push(`Check-in: ${check_in_time}`);
      if (check_out_time) timeInfo.push(`Check-out: ${check_out_time}`);
      if (timeInfo.length > 0) {
        remarks = remarks ? `${remarks} | ${timeInfo.join(', ')}` : timeInfo.join(', ');
      }
    }

    // Check if attendance record already exists for this teacher and date
    type ExistingAttendanceRow = { id: string };
    const { data: existingRecord } = await supabaseAdmin
      .from('attendance')
      .select('id')
      .eq('user_id', teacher_id)
      .eq('school_id', school_id)
      .eq('date', date)
      .single();

    const existing = existingRecord as ExistingAttendanceRow | null;
    let result: { id: string; user_id?: string; remarks?: string; [key: string]: unknown };
    if (existing) {
      // Update existing record
      type _AttendanceUpdate = { status: string; remarks: string; recorded_at: string };
      
      const { data, error } = await supabaseAdmin
        .from('attendance')
        // @ts-expect-error - Supabase generated types use never for untyped schema
        .update({
          status: mappedStatus,
          remarks: remarks,
          recorded_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating attendance:', error);
        return NextResponse.json({ error: 'Failed to update attendance' }, { status: 500 });
      }
      result = (data ?? {}) as { id: string; user_id?: string; remarks?: string; [key: string]: unknown };
    } else {
      // Create new record
      type _AttendanceInsert = { user_id: string; school_id: string; date: string; status: string; remarks: string; recorded_by: string; recorded_at: string };
      
      const { data, error } = await supabaseAdmin
        .from('attendance')
        // @ts-expect-error - Supabase generated types use never for untyped schema
        .insert({
          user_id: teacher_id,
          school_id: school_id,
          date: date,
          status: mappedStatus,
          remarks: remarks,
          recorded_by: teacher_id,
          recorded_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating attendance:', error);
        return NextResponse.json({ error: 'Failed to create attendance record' }, { status: 500 });
      }
      result = (data ?? {}) as { id: string; user_id?: string; remarks?: string; [key: string]: unknown };
    }

    // Transform result to match old format for backward compatibility
    const transformedResult = {
      ...(result && typeof result === 'object' ? result : {}),
      teacher_id: result?.user_id,
      notes: result?.remarks,
      status_original: status
    };

    return NextResponse.json({ 
      success: true, 
      attendance: transformedResult,
      message: 'Attendance record saved successfully' 
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/teacher-attendance', {
      endpoint: '/api/admin/teacher-attendance',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teacher-attendance' },
      'Failed to save attendance'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Helper function to calculate attendance summary
 
function calculateAttendanceSummary(attendance: AttendanceRecord[]) {
  const totalDays = attendance.length;
  // Use status_original if available (for backward compatibility), otherwise use status
  const presentDays = attendance.filter((a: AttendanceRecord) => 
    (a.status_original || a.status) === 'Present' || 
    (a.status_original || a.status) === 'Late'
  ).length;
  const absentApprovedDays = attendance.filter((a: AttendanceRecord) => 
    (a.status_original || a.status) === 'Absent (Approved)' || 
    (a.status_original || a.status) === 'Leave-Approved'
  ).length;
  const absentUnapprovedDays = attendance.filter((a: AttendanceRecord) => 
    (a.status_original || a.status) === 'Absent (Unapproved)' || 
    (a.status_original || a.status) === 'Absent'
  ).length;
  const lateDays = attendance.filter((a: AttendanceRecord) => 
    (a.status_original || a.status) === 'Late'
  ).length;

  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  return {
    totalDays,
    presentDays,
    absentApprovedDays,
    absentUnapprovedDays,
    lateDays,
    attendanceRate
  };
}
