import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { adminTeacherAttendanceSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

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

    // First, get all teacher profile IDs
    const { data: teacherProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'teacher');
    
    const teacherProfileIds = (teacherProfiles || []).map((p: any) => p.id);
    
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
      (allTeachers || []).forEach((teacher: any) => {
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
      (allTeachers || []).forEach((teacher: any) => {
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
     
    const transformedAttendance = (attendance || []).map((record: any) => ({
      id: record.id,
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
    const profileToTeacherMap: Record<string, any> = {};
    (allTeachers || []).forEach((teacher: any) => {
      // Find matching profile by email
      const profile = (teacherProfilesFull || []).find((p: any) => p.email === teacher.email);
      if (profile) {
        profileToTeacherMap[profile.id] = teacher;
      }
      // Also map by profile_id if available
      if (teacher.profile_id) {
        profileToTeacherMap[teacher.profile_id] = teacher;
      }
    });

    // Calculate today's attendance
    const todayAttendance = transformedAttendance.filter((a: any) => a.date === today);
    
    // Build per-teacher today status (using teacher.id as key for frontend matching)
    const teacherTodayStatus: Record<string, { status: string; isOnLeave: boolean; leaveType?: string }> = {};
    
    // Initialize all teachers as not marked (no attendance record)
    (allTeachers || []).forEach((teacher: any) => {
      teacherTodayStatus[teacher.id] = { status: 'Not Marked', isOnLeave: false };
    });
    
    // First, update with actual attendance records for today
    todayAttendance.forEach((record: any) => {
      // Find teacher by profile email or user_id
      const profile = (teacherProfilesFull || []).find((p: any) => p.id === record.teacher_id);
      if (profile) {
        const teacher = profileToTeacherMap[profile.id] || 
                       (allTeachers || []).find((t: any) => t.email === profile.email);
        if (teacher && teacherTodayStatus[teacher.id]) {
          const status = record.status_original || record.status;
          // Only update if not already on leave (leaves take precedence)
          if (!teacherTodayStatus[teacher.id].isOnLeave) {
            teacherTodayStatus[teacher.id] = {
              status: status === 'Leave-Approved' ? 'On Leave' : 
                     status === 'Present' ? 'Present' : 
                     status === 'Absent' ? 'Absent' : status,
              isOnLeave: status === 'Leave-Approved',
              leaveType: status === 'Leave-Approved' ? 'Approved Leave' : undefined
            };
          }
        }
      }
    });
    
    // Then, mark teachers on approved leave today (leaves take precedence over attendance records)
    // Leaves use profile.id as teacher_id
    (todayLeaves || []).forEach((leave: any) => {
      const teacher = profileToTeacherMap[leave.teacher_id];
      if (teacher && teacherTodayStatus[teacher.id]) {
        teacherTodayStatus[teacher.id] = {
          status: 'On Leave',
          isOnLeave: true,
          leaveType: leave.leave_type || 'Leave'
        };
      }
    });
    
    // Calculate today's counts
    const presentToday = Object.values(teacherTodayStatus).filter((s: any) => s.status === 'Present').length;
    const onLeaveToday = Object.values(teacherTodayStatus).filter((s: any) => s.isOnLeave).length;
    const notMarkedToday = Object.values(teacherTodayStatus).filter((s: any) => s.status === 'Not Marked').length;
    const absentToday = Object.values(teacherTodayStatus).filter((s: any) => 
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

    return NextResponse.json({ 
      attendance: transformedAttendance,
      summary: enhancedSummary 
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
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
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
    const { data: existingRecord } = await supabaseAdmin
      .from('attendance')
      .select('id')
      .eq('user_id', teacher_id)
      .eq('school_id', school_id)
      .eq('date', date)
       
      .single() as any;

    let result;
    if (existingRecord) {
      // Update existing record
       
      const { data, error } = await ((supabaseAdmin as any)
        .from('attendance')
        .update({
          status: mappedStatus,
          remarks: remarks,
          recorded_at: new Date().toISOString()
         
        } as any)
         
        .eq('id', existingRecord.id as any)
        .select()
         
        .single() as any) as any;

      if (error) {
        console.error('Error updating attendance:', error);
        return NextResponse.json({ error: 'Failed to update attendance' }, { status: 500 });
      }
      result = data;
    } else {
      // Create new record
      const { data, error } = await (supabaseAdmin
        .from('attendance')
        .insert({
          user_id: teacher_id, // Map teacher_id to user_id
          school_id: school_id,
          date: date,
          status: mappedStatus,
          remarks: remarks,
          recorded_by: teacher_id, // Default to teacher themselves
          recorded_at: new Date().toISOString()
         
        } as any)
         
        .select() as any)
         
        .single() as any;

      if (error) {
        console.error('Error creating attendance:', error);
        return NextResponse.json({ error: 'Failed to create attendance record' }, { status: 500 });
      }
      result = data;
    }

    // Transform result to match old format for backward compatibility
    const transformedResult = {
      ...result,
      teacher_id: result.user_id,
      notes: result.remarks,
      status_original: status // Keep original status for compatibility
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
 
function calculateAttendanceSummary(attendance: any[]) {
  const totalDays = attendance.length;
  // Use status_original if available (for backward compatibility), otherwise use status
  const presentDays = attendance.filter((a: any) => 
    (a.status_original || a.status) === 'Present' || 
    (a.status_original || a.status) === 'Late'
  ).length;
  const absentApprovedDays = attendance.filter((a: any) => 
    (a.status_original || a.status) === 'Absent (Approved)' || 
    (a.status_original || a.status) === 'Leave-Approved'
  ).length;
  const absentUnapprovedDays = attendance.filter((a: any) => 
    (a.status_original || a.status) === 'Absent (Unapproved)' || 
    (a.status_original || a.status) === 'Absent'
  ).length;
  const lateDays = attendance.filter((a: any) => 
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
