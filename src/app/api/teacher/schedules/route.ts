import { NextRequest, NextResponse } from 'next/server';
import { getTeacherUserId } from '../../../../lib/teacher-auth';
import { supabaseAdmin } from '../../../../lib/supabase';
import { logger, handleApiError } from '../../../../lib/logger';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
const _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET /api/teacher/schedules
// Fetch all schedules for the authenticated teacher
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
    const teacherId = await getTeacherUserId(request);
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const day = searchParams.get('day');
    const schoolIdParam = searchParams.get('school_id') || undefined; // Optional: filter by specific school
    const dateParam = searchParams.get('date'); // Optional: for historical queries (YYYY-MM-DD format)

    logger.info('Schedules API called', {
      userId: teacherId,
      day,
      schoolId: schoolIdParam,
      endpoint: '/api/teacher/schedules',
    });

    // Get teacher's school assignments - query all teacher_schools records
    const { data: teacherSchools, error: teacherSchoolError } = await supabaseAdmin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', teacherId);

    if (teacherSchoolError) {
      logger.error('Failed to fetch teacher school assignments', {
        userId: teacherId,
        endpoint: '/api/teacher/schedules',
      }, teacherSchoolError);
      
      const errorInfo = await handleApiError(
        teacherSchoolError,
        { userId: teacherId, endpoint: '/api/teacher/schedules' },
        'Failed to fetch teacher school assignments'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.debug('Teacher school assignments fetched', {
      userId: teacherId,
      schoolCount: teacherSchools?.length || 0,
      endpoint: '/api/teacher/schedules',
    });

    // Determine which school(s) to query
    let schoolIds: string[] = [];

    if (schoolIdParam) {
      // If school_id is provided in query params, use only that school
      // But first verify the teacher is assigned to that school
       
      const isAssigned = teacherSchools?.some((ts: { school_id: string }) => ts.school_id === schoolIdParam);
      if (isAssigned) {
        schoolIds = [schoolIdParam];
        console.log('✅ Using provided school_id:', schoolIdParam);
      } else {
        // Teacher is not assigned to the provided school via teacher_schools
        // Reject the request - teacher must be explicitly assigned via teacher_schools
        return NextResponse.json(
          { error: 'Teacher is not assigned to the specified school. Please ensure teacher_schools record exists.' },
          { status: 403 }
        );
      }
    } else {
      // If no school_id provided, get all schools the teacher is assigned to
      if (teacherSchools && teacherSchools.length > 0) {
         
        schoolIds = teacherSchools.map((ts: { school_id: string }) => ts.school_id);
        console.log('✅ Using all assigned schools:', schoolIds);
      } else {
        // No teacher_schools record found - require explicit assignment
        logger.warn('Teacher has no school assignment', {
          userId: teacherId,
          endpoint: '/api/teacher/schedules',
        });
        
        return NextResponse.json(
          {
            error: 'Teacher not assigned to any school',
            details: 'Please contact your administrator to assign you to a school via teacher_schools table.',
            status: 404,
          },
          { status: 404 }
        );
      }
    }

    if (schoolIds.length === 0) {
      return NextResponse.json(
        { error: 'Unable to determine school for teacher' },
        { status: 404 }
      );
    }

    // Build query - fetch schedules from all assigned schools
    // First, let's check all schedules for this teacher (including inactive ones for debugging)
    const debugQuery = supabaseAdmin
      .from('class_schedules')
      .select('id, teacher_id, school_id, is_active, subject, grade, day_of_week')
      .eq('teacher_id', teacherId)
      .in('school_id', schoolIds);
    
    const { data: allSchedulesDebug, error: _debugError } = await debugQuery;
    console.log('🔍 Debug: All schedules for teacher (including inactive):', {
      count: allSchedulesDebug?.length || 0,
       
      schedules: allSchedulesDebug?.map((s: { id: string; teacher_id: string | null; school_id: string; is_active: boolean; subject: string; grade: string; day_of_week: string }) => ({
        id: s.id,
        teacher_id: s.teacher_id,
        school_id: s.school_id,
        is_active: s.is_active,
        subject: s.subject,
        grade: s.grade,
        day_of_week: s.day_of_week
      }))
    });

    // Also check if there are any schedules with null teacher_id in these schools
    const nullTeacherQuery = supabaseAdmin
      .from('class_schedules')
      .select('id, teacher_id, school_id, is_active, subject, grade, day_of_week')
      .is('teacher_id', null)
      .in('school_id', schoolIds);
    
    const { data: nullTeacherSchedules, error: _nullTeacherError } = await nullTeacherQuery;
    if (nullTeacherSchedules && nullTeacherSchedules.length > 0) {
      console.log('⚠️ Warning: Found schedules with null teacher_id in assigned schools:', {
        count: nullTeacherSchedules.length,
        schedules: nullTeacherSchedules
      });
    }

    // Now build the actual query - fetch schedules from all assigned schools
    // First, get all schedules without joins to ensure we get all records
    let query = supabaseAdmin
      .from('class_schedules')
      .select('id, teacher_id, school_id, class_id, day_of_week, start_time, end_time, room_id, is_active, created_at, updated_at, effective_from, effective_to')
      .eq('teacher_id', teacherId)
      .in('school_id', schoolIds); // Use .in() to query multiple schools
    
    // Apply effective date filtering
    if (dateParam) {
      // Historical query: get schedules active on the specified date
      const queryDate = dateParam; // YYYY-MM-DD format
      query = query
        .lte('effective_from', queryDate) // Schedule was active from this date or before
        .or(`effective_to.is.null,effective_to.gte.${queryDate}`); // And hasn't ended yet, or ended after this date
    } else {
      // Current schedules: get schedules that are currently active
      query = query
        .eq('is_active', true)
        .is('effective_to', null); // No end date = currently active
    }
    
    query = query
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    
    // Try to get class data separately if class_id exists (optional join)
    // This avoids errors when class_id is null

    if (day) {
      query = query.eq('day_of_week', day);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('Error fetching teacher schedules:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return NextResponse.json(
        { error: 'Failed to fetch schedules', details: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${schedules?.length || 0} active schedules for teacher ${teacherId} in ${schoolIds.length} school(s)`);
     
    type ScheduleRow = { id: string; subject: string; grade: string; day_of_week: string; start_time: string; end_time: string; teacher_id: string | null; school_id: string; is_active: boolean; period_id?: string; room_id?: string };
    console.log('📋 Schedule details:', schedules?.map((s: ScheduleRow) => ({
      id: s.id,
      subject: s.subject,
      grade: s.grade,
      day: s.day_of_week,
      time: `${s.start_time} - ${s.end_time}`,
      teacher_id: s.teacher_id,
      school_id: s.school_id,
      is_active: s.is_active
    })));
    
    // Ensure we return all schedules (no limit)
    if (!schedules || schedules.length === 0) {
      console.warn('⚠️ No schedules found for teacher:', teacherId);
    } else {
      console.log(`📊 Returning ${schedules.length} schedules (expected: 4 for this teacher)`);
    }

    // Now enrich schedules with related data (period, room, school) if needed
    // This ensures we get all schedules even if some related records are missing
    const enrichedSchedules = await Promise.all(
      (schedules || []).map(async (schedule: ScheduleRow) => {
        const enriched: Record<string, unknown> = { ...schedule };
        if (schedule.period_id) {
          const { data: period } = await supabaseAdmin
            .from('periods')
            .select('id, period_number, start_time, end_time')
            .eq('id', schedule.period_id)
            .single();
          enriched.period = period || null;
        }
        if (schedule.room_id) {
          const { data: room } = await supabaseAdmin
            .from('rooms')
            .select('id, room_number, room_name, capacity')
            .eq('id', schedule.room_id)
            .single();
          enriched.room = room || null;
        }
        if (schedule.school_id) {
          const { data: school } = await supabaseAdmin
            .from('schools')
            .select('id, name, school_code')
            .eq('id', schedule.school_id)
            .single();
          enriched.school = school || null;
        }
        return enriched;
      })
    );

    // Additional check: Query all schedules in these schools to see if any are missing
    const allSchedulesInSchools = supabaseAdmin
      .from('class_schedules')
      .select('id, teacher_id, school_id, is_active, subject, grade, day_of_week, start_time, end_time')
      .in('school_id', schoolIds);
    
    const { data: allSchedules, error: allSchedulesError } = await allSchedulesInSchools;
    if (!allSchedulesError && allSchedules) {
      console.log('🔍 All schedules in assigned schools (for debugging):', {
        total: allSchedules.length,
         
        by_teacher: allSchedules.filter((s: { teacher_id: string | null }) => s.teacher_id === teacherId).length,
        by_status: {
          active: allSchedules.filter((s: { is_active: boolean }) => s.is_active === true).length,
          inactive: allSchedules.filter((s: { is_active: boolean }) => s.is_active === false).length
        },
        with_null_teacher: allSchedules.filter((s: { teacher_id: string | null }) => !s.teacher_id).length,
        schedules: allSchedules.map((s: { id: string; teacher_id: string | null; school_id: string; is_active: boolean; subject: string; grade: string }) => ({
          id: s.id,
          teacher_id: s.teacher_id,
          matches_teacher: s.teacher_id === teacherId,
          school_id: s.school_id,
          is_active: s.is_active,
          subject: s.subject,
          grade: s.grade
        }))
      });
    }
    
    logger.info('Schedules fetched successfully', {
      userId: teacherId,
      schoolIds,
      scheduleCount: enrichedSchedules?.length || 0,
      endpoint: '/api/teacher/schedules',
    });

    return NextResponse.json({ schedules: enrichedSchedules || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/schedules', {
      endpoint: '/api/teacher/schedules',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/schedules' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

