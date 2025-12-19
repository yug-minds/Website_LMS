import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { scheduleSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


// GET /api/school-admin/schedules
// Fetch all schedules for the school admin's school
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const day = searchParams.get('day');
    const grade = searchParams.get('grade');
    const teacherId = searchParams.get('teacherId');
    const classId = searchParams.get('classId');

    let query = supabaseAdmin
      .from('class_schedules')
      .select(`
        *,
        class:classes!class_id (
          id,
          class_name,
          grade,
          subject
        ),
        teacher:profiles!teacher_id (
          id,
          full_name,
          email
        ),
        period:periods!period_id (
          id,
          period_number,
          start_time,
          end_time
        ),
        room:rooms!room_id (
          id,
          room_number,
          room_name,
          capacity
        )
      `)
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (day) {
      query = query.eq('day_of_week', day);
    }
    if (grade) {
      query = query.eq('grade', grade);
    }
    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }
    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data: schedules, error } = await query;

    if (error) {
      logger.error('Error fetching schedules', {
        endpoint: '/api/school-admin/schedules',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/school-admin/schedules' },
        'Failed to fetch schedules'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    return NextResponse.json({ schedules: schedules || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/schedules', {
      endpoint: '/api/school-admin/schedules',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/schedules' },
      'Failed to fetch schedules'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST /api/school-admin/schedules
// Create a new schedule
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
    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(scheduleSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const {
      class_id,
      teacher_id,
      subject,
      grade,
      day_of_week,
      period_id,
      room_id,
      start_time,
      end_time,
      academic_year,
      notes
    } = { ...validation.data, ...body };

    // Validate required fields
    if (!subject || !grade || !day_of_week) {
      return NextResponse.json(
        { error: 'Missing required fields', details: 'subject, grade, and day_of_week are required' },
        { status: 400 }
      );
    }

    // Derive start_time and end_time from period if period_id is provided
    let finalStartTime = start_time;
    let finalEndTime = end_time;

    if (period_id) {
      const { data: period, error: periodError } = await supabaseAdmin
        .from('periods')
        .select('start_time, end_time')
        .eq('id', period_id)
        .eq('school_id', schoolId)
         
        .single() as any;

      if (periodError || !period) {
        return NextResponse.json(
          { error: 'Invalid period', details: 'The selected period does not exist or is not associated with this school' },
          { status: 400 }
        );
      }

      finalStartTime = period.start_time;
      finalEndTime = period.end_time;
    }

    // Validate that we have start_time and end_time (either from period or directly provided)
    if (!finalStartTime || !finalEndTime) {
      return NextResponse.json(
        { error: 'Missing required fields', details: 'Either period_id must be provided, or start_time and end_time must be provided' },
        { status: 400 }
      );
    }

    // Validate day_of_week
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(day_of_week)) {
      return NextResponse.json(
        { error: 'Invalid day_of_week', details: `day_of_week must be one of: ${validDays.join(', ')}` },
        { status: 400 }
      );
    }

    // Check for conflicts (same teacher, same time, same day)
    // Two time ranges overlap if: existing_start < new_end AND existing_end > new_start
    // We use strict inequality to allow schedules that touch at boundaries (e.g., 9:00-10:00 and 10:00-11:00 don't conflict)
    if (teacher_id) {
      // First, get all existing schedules for this teacher on this day
      const { data: existingSchedules, error: conflictError } = await supabaseAdmin
        .from('class_schedules')
        .select('id, start_time, end_time')
        .eq('school_id', schoolId)
        .eq('teacher_id', teacher_id)
        .eq('day_of_week', day_of_week)
         
        .eq('is_active', true) as any;

      if (conflictError) {
        logger.error('Error checking conflicts', {
          endpoint: '/api/school-admin/schedules',
        }, conflictError);
        
        const errorInfo = await handleApiError(
          conflictError,
          { endpoint: '/api/school-admin/schedules' },
          'Failed to check conflicts'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }

      // Check for actual time overlap (not just touching at boundaries)
      if (existingSchedules && existingSchedules.length > 0) {
         
        const hasConflict = existingSchedules.some((existing: any) => {
          // Times are stored as 'HH:MM:SS' format (time without time zone)
          // Convert to comparable format - ensure they're strings in HH:MM:SS format
          const existingStart = String(existing.start_time || '').trim();
          const existingEnd = String(existing.end_time || '').trim();
          const newStart = String(finalStartTime || '').trim();
          const newEnd = String(finalEndTime || '').trim();
          
          // Two ranges overlap if: existing_start < new_end AND existing_end > new_start
          // This allows schedules that touch at boundaries (e.g., 9:00-10:00 and 10:00-11:00)
          // String comparison works for time format 'HH:MM:SS'
          return existingStart < newEnd && existingEnd > newStart;
        });

        if (hasConflict) {
          console.log('⚠️ Schedule conflict detected:', {
            teacher_id,
            day_of_week,
            new_time: `${finalStartTime} - ${finalEndTime}`,
             
            existing_schedules: existingSchedules.map((s: any) => `${s.start_time} - ${s.end_time}`)
          });
          return NextResponse.json(
            { error: 'Schedule conflict', details: 'Teacher already has a class scheduled at this time' },
            { status: 400 }
          );
        }
      }
    }

    // Check for room conflicts
    // Two time ranges overlap if: existing_start < new_end AND existing_end > new_start
    // We use strict inequality to allow schedules that touch at boundaries
    if (room_id) {
      // First, get all existing schedules for this room on this day
      const { data: existingRoomSchedules, error: roomConflictError } = await supabaseAdmin
        .from('class_schedules')
        .select('id, start_time, end_time')
        .eq('school_id', schoolId)
        .eq('room_id', room_id)
        .eq('day_of_week', day_of_week)
         
        .eq('is_active', true) as any;

      if (roomConflictError) {
        logger.error('Error checking room conflicts', {
          endpoint: '/api/school-admin/schedules',
        }, roomConflictError);
        
        const errorInfo = await handleApiError(
          roomConflictError,
          { endpoint: '/api/school-admin/schedules' },
          'Failed to check room conflicts'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }

      // Check for actual time overlap (not just touching at boundaries)
      if (existingRoomSchedules && existingRoomSchedules.length > 0) {
         
        const hasRoomConflict = existingRoomSchedules.some((existing: any) => {
          // Times are stored as 'HH:MM:SS' format (time without time zone)
          // Convert to comparable format - ensure they're strings in HH:MM:SS format
          const existingStart = String(existing.start_time || '').trim();
          const existingEnd = String(existing.end_time || '').trim();
          const newStart = String(finalStartTime || '').trim();
          const newEnd = String(finalEndTime || '').trim();
          
          // Two ranges overlap if: existing_start < new_end AND existing_end > new_start
          // String comparison works for time format 'HH:MM:SS'
          return existingStart < newEnd && existingEnd > newStart;
        });

        if (hasRoomConflict) {
          console.log('⚠️ Room conflict detected:', {
            room_id,
            day_of_week,
            new_time: `${finalStartTime} - ${finalEndTime}`,
             
            existing_schedules: existingRoomSchedules.map((s: any) => `${s.start_time} - ${s.end_time}`)
          });
          return NextResponse.json(
            { error: 'Room conflict', details: 'Room is already booked at this time' },
            { status: 400 }
          );
        }
      }
    }

    // Get current user's profile_id for created_by
    const authHeader = request.headers.get('authorization');
    let createdBy = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          createdBy = user.id;
        }
      } catch (e) {
        logger.warn('Error getting user (non-critical)', {
          endpoint: '/api/school-admin/schedules',
        }, e instanceof Error ? e : new Error(String(e)));
        // Ignore auth errors
      }
    }

    // Create schedule
    const { data: schedule, error } = await (supabaseAdmin
      .from('class_schedules')
      .insert({
        school_id: schoolId,
        class_id: class_id && class_id !== '' ? class_id : null,
        teacher_id: teacher_id && teacher_id !== '' ? teacher_id : null,
        subject,
        grade,
        day_of_week,
        period_id: period_id && period_id !== '' ? period_id : null,
        room_id: room_id && room_id !== '' ? room_id : null,
        start_time: finalStartTime,
        end_time: finalEndTime,
        academic_year: academic_year || '2024-25',
        notes: notes && notes !== '' ? notes : null,
        created_by: createdBy,
        is_active: true
       
      } as any)
      .select(`
        *,
        class:classes!class_id (
          id,
          class_name,
          grade,
          subject
        ),
        teacher:profiles!teacher_id (
          id,
          full_name,
          email
        ),
        period:periods!period_id (
          id,
          period_number,
          start_time,
          end_time
        ),
        room:rooms!room_id (
          id,
          room_number,
          room_name,
          capacity
        )
      `)
       
      .single() as any);

    if (error) {
      logger.error('Error creating schedule', {
        endpoint: '/api/school-admin/schedules',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/school-admin/schedules' },
        'Failed to create schedule'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    const successResponse = NextResponse.json({ schedule }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/schedules', {
      endpoint: '/api/school-admin/schedules',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/schedules' },
      'Failed to create schedule'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

