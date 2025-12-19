import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId, validateTeacherSchoolAccess } from '../../../../lib/teacher-auth';
import { logger, handleApiError } from '../../../../lib/logger';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createTeacherReportSchema, validateRequestBody, uuidSchema } from '../../../../lib/validation-schemas';


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
    const schoolId = searchParams.get('school_id') || undefined;
    const status = searchParams.get('status') || undefined;
    const date = searchParams.get('date') || undefined;
    const classId = searchParams.get('class_id') || undefined;
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';

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

    // Build query - filter by teacher_id and optionally by school_id
    let query = supabaseAdmin
      .from('teacher_reports')
      .select(`
        *,
        classes (
          id,
          class_name,
          grade,
          subject
        ),
        schools (
          id,
          name,
          school_code
        )
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    if (status) {
      query = query.eq('report_status', status);
    }

    if (date) {
      query = query.eq('date', date);
    }

    if (classId) {
      query = query.eq('class_id', classId);
    }

    logger.debug('Fetching teacher reports', {
      endpoint: '/api/teacher/reports',
      teacherId,
      schoolId,
      status,
      date,
      classId,
    });

    const { data: reports, error } = await query;

    if (error) {
      logger.error('Failed to fetch teacher reports', {
        endpoint: '/api/teacher/reports',
        teacherId,
        schoolId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/reports', teacherId, schoolId },
        'Failed to fetch reports'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher reports fetched successfully', {
      endpoint: '/api/teacher/reports',
      teacherId,
      count: reports?.length || 0,
    });

    // Transform data to match expected format
     
    const transformedReports = (reports || []).map((report: any) => {
      const classData = Array.isArray(report.classes) ? report.classes[0] : report.classes;
      const schoolData = Array.isArray(report.schools) ? report.schools[0] : report.schools;
      return {
        ...report,
        classes: classData ? [classData] : [], // Keep as array for compatibility
        school: schoolData,
        schools: undefined // Remove nested schools array
      };
    });

    return NextResponse.json({ reports: transformedReports });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/reports', {
      endpoint: '/api/teacher/reports',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/reports' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function POST(request: NextRequest) {
  const { ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  
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
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createTeacherReportSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher report creation', {
        endpoint: '/api/teacher/reports',
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
      school_id,
      class_id,
      date,
      class_name,
      grade,
      start_time,
      end_time,
      topics_taught,
      activities,
      homework_assigned,
      student_attendance,
      notes,
      materials_used
    } = validation.data;

    // Validate that teacher is assigned to this school
    const hasAccess = await validateTeacherSchoolAccess(school_id, request);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Teacher is not assigned to this school' },
        { status: 403 }
      );
    }

    // Find or create class_id from grade (same as scheduling)
    // Grade == Class, so we use grade to find/create the class
    let finalClassId = class_id; // Use provided class_id if available
    
    if (!finalClassId && grade && school_id) {
      console.log(`🔍 Finding class_id from grade: ${grade} (grade == class)`);
      
      // First, try to find by grade only
      const { data: classesByGrade, error: gradeError } = await supabaseAdmin
        .from('classes')
        .select('id')
        .eq('school_id', school_id)
        .eq('grade', grade)
        .eq('is_active', true)
         
        .limit(1) as any;
      
      if (!gradeError && classesByGrade && classesByGrade.length > 0) {
        finalClassId = classesByGrade[0].id;
        console.log(`✅ Found class_id from grade: ${finalClassId}`);
      } else {
        // If not found, create a new class using grade
        console.log(`🔍 Creating new class for grade: ${grade}`);
         
        const { data: newClass, error: createError } = await ((supabaseAdmin as any)
          .from('classes')
          .insert({
            school_id: school_id,
            class_name: `Class - ${grade}`,
            grade: grade,
            subject: null,
            academic_year: '2024-25',
            is_active: true
           
          } as any)
          .select('id')
           
          .single() as any) as any;
        
        if (!createError && newClass && newClass.id) {
          finalClassId = newClass.id;
          console.log(`✅ Created class_id from grade: ${finalClassId}`);
        } else if (createError && (createError.code === '23505' || createError.message.includes('duplicate'))) {
          // Duplicate - find existing
          const { data: existingClass } = await supabaseAdmin
            .from('classes')
            .select('id')
            .eq('school_id', school_id)
            .eq('grade', grade)
            .eq('is_active', true)
             
            .limit(1) as any;
          
          if (existingClass && existingClass.length > 0) {
            finalClassId = existingClass[0].id;
            console.log(`✅ Found existing class after duplicate error: ${finalClassId}`);
          }
        } else {
          console.error(`❌ Error creating class from grade:`, createError);
        }
      }
    }
    
    if (!finalClassId) {
      return NextResponse.json(
        { error: 'Unable to find or create class from grade', details: `Could not find or create class for grade: ${grade}` },
        { status: 400 }
      );
    }

    // Validate and format date
    let formattedDate = date;
    if (date) {
      // Ensure date is in YYYY-MM-DD format
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format', details: 'Date must be a valid date string' },
          { status: 400 }
        );
      }
      formattedDate = dateObj.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    }

    // Prepare insert data
    // Note: updated_at will be set automatically by the database trigger or default value
     
    const insertData: any = {
      teacher_id: teacherId, // Use authenticated teacher_id
      school_id,
      date: formattedDate,
      report_status: 'Submitted',
      created_at: new Date().toISOString()
    };

    // Add optional fields only if they are provided
    if (class_id) insertData.class_id = class_id;
    if (class_name) insertData.class_name = class_name;
    if (grade) insertData.grade = grade;
    
    // Handle start_time and end_time - they should be time strings (HH:MM:SS)
    // Validate and format time values
    if (start_time) {
      // If it's already in HH:MM:SS format, use it directly
      // If it's a full timestamp, extract just the time part
      if (start_time.includes('T') || start_time.includes(' ')) {
        // It's a full timestamp, extract time part
        const timeMatch = start_time.match(/(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          insertData.start_time = timeMatch[1];
        } else {
          console.warn('Invalid start_time format:', start_time);
        }
      } else if (/^\d{2}:\d{2}(:\d{2})?$/.test(start_time)) {
        // It's already in time format (HH:MM or HH:MM:SS)
        insertData.start_time = start_time.length === 5 ? `${start_time}:00` : start_time;
      } else {
        console.warn('Invalid start_time format:', start_time);
      }
    }
    
    if (end_time) {
      // If it's already in HH:MM:SS format, use it directly
      // If it's a full timestamp, extract just the time part
      if (end_time.includes('T') || end_time.includes(' ')) {
        // It's a full timestamp, extract time part
        const timeMatch = end_time.match(/(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          insertData.end_time = timeMatch[1];
        } else {
          console.warn('Invalid end_time format:', end_time);
        }
      } else if (/^\d{2}:\d{2}(:\d{2})?$/.test(end_time)) {
        // It's already in time format (HH:MM or HH:MM:SS)
        insertData.end_time = end_time.length === 5 ? `${end_time}:00` : end_time;
      } else {
        console.warn('Invalid end_time format:', end_time);
      }
    }
    if (topics_taught) insertData.topics_taught = topics_taught;
    if (activities) insertData.activities = activities;
    if (homework_assigned) insertData.homework_assigned = homework_assigned;
    if (student_attendance) insertData.student_attendance = student_attendance;
    if (notes) insertData.notes = notes;
    if (materials_used) insertData.materials_used = materials_used;

    console.log('📝 Inserting teacher report with data:', {
      teacher_id: teacherId,
      school_id,
      class_id,
      date,
      has_topics_taught: !!topics_taught,
      has_activities: !!activities,
      has_notes: !!notes
    });

    // Insert the report (using admin client to bypass RLS)
    // Some environments still have teacher_reports.start_time/end_time as timestamptz.
    // The UI sends "HH:MM:SS", so we:
    // - Try inserting the time-only values first (works if columns are TIME)
    // - If DB complains about timestamptz, retry with full ISO timestamps (date + time).
    let report: any = null;
    let error: any = null;

    const tryInsert = async (payload: any) => {
      const res = await supabaseAdmin
        .from('teacher_reports')
        .insert(payload)
        .select()
        .single() as any;
      return res;
    };

    ({ data: report, error } = await tryInsert(insertData));

    if (error && typeof error.message === 'string' && error.message.includes('timestamp with time zone')) {
      const toIso = (d: string, t: string) => {
        const time = t.length === 5 ? `${t}:00` : t; // HH:MM -> HH:MM:SS
        // Use UTC to avoid locale parsing differences
        return `${d}T${time}Z`;
      };

      const retryData = { ...insertData };
      if (retryData.start_time && typeof retryData.start_time === 'string' && retryData.date) {
        retryData.start_time = toIso(retryData.date, retryData.start_time);
      }
      if (retryData.end_time && typeof retryData.end_time === 'string' && retryData.date) {
        retryData.end_time = toIso(retryData.date, retryData.end_time);
      }

      console.warn('⚠️ Retrying teacher report insert with timestamptz values for start_time/end_time');
      ({ data: report, error } = await tryInsert(retryData));
    }

    if (error) {
      console.error('❌ Error creating teacher report:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        insertData
      });
      return NextResponse.json(
        { 
          error: 'Failed to create report', 
          details: error.message || 'Unknown database error',
          hint: error.hint || 'Check database constraints and required fields'
        }, 
        { status: 500 }
      );
    }

    // Check if all period reports for the day have been submitted
    // Get the day of the week for the date
    const reportDate = new Date(date);
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = daysOfWeek[reportDate.getDay()];

    console.log(`📅 Checking attendance for ${date} (${dayOfWeek})`);

    // Get all scheduled periods for this teacher on this day (with grade for matching)
    const { data: schedules, error: schedulesError } = await supabaseAdmin
      .from('class_schedules')
      .select('period_id, class_id, grade')
      .eq('teacher_id', teacherId)
      .eq('school_id', school_id)
      .eq('day_of_week', dayOfWeek)
       
      .eq('is_active', true) as any;

    if (schedulesError) {
      console.error('Error fetching schedules:', schedulesError);
      // Continue anyway - mark attendance based on reports submitted
    }

    // Get unique period IDs from schedules
    const scheduledPeriodIds = new Set<string>();
    if (schedules && schedules.length > 0) {
       
      schedules.forEach((s: any) => {
        if (s.period_id) {
          scheduledPeriodIds.add(s.period_id);
        }
      });
    }

    const totalPeriodsForDay = scheduledPeriodIds.size;
    console.log(`📊 Total periods scheduled for ${dayOfWeek}: ${totalPeriodsForDay}`);

    // Get all reports submitted by this teacher for this date (with grade for matching)
    const { data: dayReports, error: reportsError } = await supabaseAdmin
      .from('teacher_reports')
      .select('id, class_id, grade')
      .eq('teacher_id', teacherId)
      .eq('school_id', school_id)
       
      .eq('date', date) as any;

    if (reportsError) {
      console.error('Error fetching day reports:', reportsError);
    }

    const submittedReportsCount = dayReports?.length || 0;
    console.log(`📋 Reports submitted for ${date}: ${submittedReportsCount}`);

    // Get the period_id for each submitted report by matching with schedules via grade (primary) or class_id (fallback)
    const periodsWithReports = new Set<string>();
    
    if (schedules && dayReports && scheduledPeriodIds.size > 0) {
      // For each report, find which period it belongs to by matching grade or class_id
       
      dayReports.forEach((report: any) => {
        // Find schedules that match this report's grade (primary) or class_id (fallback)
         
        const matchingSchedules = schedules.filter((s: any) => {
          if (!s.period_id || !scheduledPeriodIds.has(s.period_id)) return false;
          
          // Match by grade (primary method - since reports use grade as primary identifier)
          if (report.grade && s.grade && report.grade === s.grade) {
            return true;
          }
          
          // Fallback: match by class_id
          if (report.class_id && s.class_id && report.class_id === s.class_id) {
            return true;
          }
          
          return false;
        });
        
        // If we found a matching schedule, add its period_id
         
        matchingSchedules.forEach((s: any) => {
          if (s.period_id) {
            periodsWithReports.add(s.period_id);
          }
        });
      });
    }

    // Only mark attendance as 'Present' if:
    // 1. Teacher has scheduled periods for this day AND ALL periods have reports, OR
    // 2. Teacher has at least one report submitted (for cases where there are no schedules)
    let shouldMarkPresent = false;
    
    if (totalPeriodsForDay > 0) {
      // Teacher has scheduled periods - check if ALL periods have reports
      // We need to ensure every unique period_id has at least one report
      const allPeriodsHaveReports = periodsWithReports.size >= totalPeriodsForDay;
      
      // Fallback: if we couldn't match by class_id perfectly, check if report count >= period count
      // This handles cases where class_id might not match exactly
      const fallbackCheck = submittedReportsCount >= totalPeriodsForDay;
      
      shouldMarkPresent = allPeriodsHaveReports || fallbackCheck;
      console.log(`✅ All periods have reports: ${shouldMarkPresent} (periods with reports: ${periodsWithReports.size}/${totalPeriodsForDay}, total reports: ${submittedReportsCount})`);
      
      if (!shouldMarkPresent) {
        console.log(`⏳ Waiting for reports from ${totalPeriodsForDay - periodsWithReports.size} more period(s)`);
      }
    } else {
      // No scheduled periods - mark present if at least one report is submitted
      shouldMarkPresent = submittedReportsCount > 0;
      console.log(`✅ No scheduled periods, marking present based on reports: ${shouldMarkPresent}`);
    }

    // Mark attendance as 'Present' if all period reports are submitted
    let attendanceStatus: 'marked' | 'pending' | 'skipped' = 'pending';
    if (shouldMarkPresent) {
      try {
        const isMissingAttendanceTable = (err: any) => {
          const msg = String(err?.message || '');
          return err?.code === '42P01' || msg.includes('relation "attendance" does not exist') || msg.includes('does not exist');
        };

        // Use supabaseAdmin directly - it's already configured with schema: 'public'
        // Check existing attendance record
        const { data: existingAttendance, error: attendanceFetchError } = await supabaseAdmin
          .from('attendance')
          .select('status')
          .eq('user_id', teacherId)
          .eq('school_id', school_id)
          .eq('date', date)
          .maybeSingle() as any;

        if (attendanceFetchError && isMissingAttendanceTable(attendanceFetchError)) {
          console.error('❌ Attendance table not found. Skipping attendance marking.', attendanceFetchError);
          attendanceStatus = 'skipped';
        } else {
          if (attendanceFetchError) {
            console.error('Error fetching existing attendance:', attendanceFetchError);
          }

          // Only mark as Present if status is not Leave-Approved
          const currentStatus = existingAttendance?.status;
          if (currentStatus === 'Leave-Approved') {
            console.log(`⚠️ Attendance status is ${currentStatus}, not overriding (leave was approved)`);
            attendanceStatus = 'skipped';
          } else {
            const { error: attendanceError } = await supabaseAdmin
              .from('attendance')
              .upsert({
                user_id: teacherId,
                school_id,
                class_id: class_id || null,
                date,
                status: 'Present',
                recorded_by: teacherId,
                recorded_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,school_id,date',
                ignoreDuplicates: false
              }) as any;

            if (attendanceError) {
              if (isMissingAttendanceTable(attendanceError)) {
                console.error('❌ Attendance table not found during upsert. Skipping.', attendanceError);
              } else {
                console.error('Error marking attendance as Present:', attendanceError);
              }
              attendanceStatus = 'skipped';
            } else {
              console.log(`✅ Attendance marked as Present for ${date}`);
              attendanceStatus = 'marked';
            }
          }
        }
      } catch (attendanceCrash) {
        // Never fail report submission due to attendance subsystem issues
        console.error('❌ Attendance marking crashed. Skipping attendance update.', attendanceCrash);
        attendanceStatus = 'skipped';
      }
    } else {
      console.log(`⏳ Not all periods have reports yet. Waiting for more reports...`);
    }

    // Reports are automatically visible in:
    // - School Admin Dashboard: /school-admin/reports (shows reports for their school)
    // - Admin Dashboard: /admin/reports (shows all reports across all schools)
    // No need to send notifications as reports are displayed in their respective dashboards

    const successResponse = NextResponse.json({ 
      report,
      attendanceStatus,
      reportsSubmitted: submittedReportsCount,
      totalPeriods: totalPeriodsForDay
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/teacher/reports', {
      endpoint: '/api/teacher/reports',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/reports' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function PUT(request: NextRequest) {
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
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body - at minimum require id
    if (!body.id) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    // Validate update data if provided
    const { id, ...updateData } = body;
    if (Object.keys(updateData).length > 0) {
      // Create a partial schema for updates
      const updateSchema = createTeacherReportSchema.partial().extend({
        id: uuidSchema,
      });
      
      const validation = validateRequestBody(updateSchema, body);
      if (!validation.success) {
         
        const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
        logger.warn('Validation failed for teacher report update', {
          endpoint: '/api/teacher/reports',
          method: 'PUT',
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
    }

    // Verify the report belongs to this teacher before updating
    const { data: existingReport, error: fetchError } = await supabaseAdmin
      .from('teacher_reports')
      .select('teacher_id, school_id')
      .eq('id', id)
       
      .single() as any;

    if (fetchError || !existingReport) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    if (existingReport.teacher_id !== teacherId) {
      return NextResponse.json(
        { error: 'Forbidden: You can only update your own reports' },
        { status: 403 }
      );
    }

    // If school_id is being updated, validate access
    if (updateData.school_id && updateData.school_id !== existingReport.school_id) {
      const hasAccess = await validateTeacherSchoolAccess(updateData.school_id, request);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Forbidden: Teacher is not assigned to this school' },
          { status: 403 }
        );
      }
    }

    // Update the report (using admin client to bypass RLS)
     
    const { data: report, error } = await ((supabaseAdmin as any)
      .from('teacher_reports')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
       
      } as any)
      .eq('id', id)
      .eq('teacher_id', teacherId) // Double-check it's the teacher's report
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('Failed to update teacher report', {
        endpoint: '/api/teacher/reports',
        method: 'PUT',
        reportId: id,
        teacherId,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/teacher/reports', method: 'PUT', reportId: id },
        'Failed to update report'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Teacher report updated successfully', {
      endpoint: '/api/teacher/reports',
      method: 'PUT',
      reportId: id,
      teacherId,
    });

    const successResponse = NextResponse.json({ report });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/teacher/reports', {
      endpoint: '/api/teacher/reports',
      method: 'PUT',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/reports', method: 'PUT' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}