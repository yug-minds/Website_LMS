import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { scheduleSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';


// PUT /api/school-admin/schedules/[id]
// Update a schedule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
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

    const { id: scheduleId } = await params;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(scheduleSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
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
      notes,
      is_active
    } = { ...validation.data, ...body };

    // Derive start_time and end_time from period if period_id is provided
    let finalStartTime = start_time;
    let finalEndTime = end_time;

    if (period_id !== undefined && period_id) {
      const { data: period, error: periodError } = await supabaseAdmin
        .from('periods')
        .select('start_time, end_time')
        .eq('id', period_id)
        .eq('school_id', schoolId)
        .single();

      if (periodError || !period) {
        return NextResponse.json(
          { error: 'Invalid period', details: 'The selected period does not exist or is not associated with this school' },
          { status: 400 }
        );
      }

      finalStartTime = period.start_time;
      finalEndTime = period.end_time;
    }

    // Verify schedule belongs to this school and get current values
    const { data: existingSchedule, error: existingScheduleError } = await supabaseAdmin
      .from('class_schedules')
      .select('id, school_id, start_time, end_time, day_of_week, teacher_id, room_id, period_id')
      .eq('id', scheduleId)
      .single();

    if (existingScheduleError || !existingSchedule) {
      return NextResponse.json(
        { error: 'Schedule not found', details: existingScheduleError?.message },
        { status: 404 }
      );
    }

    if (existingSchedule.school_id !== schoolId) {
      return NextResponse.json(
        { error: 'Forbidden: Schedule does not belong to your school' },
        { status: 403 }
      );
    }

    // Use existing schedule values as fallback if not provided in update
    const currentStartTime = finalStartTime || existingSchedule.start_time;
    const currentEndTime = finalEndTime || existingSchedule.end_time;
    const currentDayOfWeek = day_of_week || existingSchedule.day_of_week;
    const currentTeacherId = teacher_id !== undefined ? (teacher_id || null) : existingSchedule.teacher_id;
    const currentRoomId = room_id !== undefined ? (room_id || null) : existingSchedule.room_id;

    // Check if relevant fields have changed (only check conflicts if they have)
    // Normalize null/empty string comparisons
     
    const normalizeId = (id: string | null | undefined) => (id === '' || id === null || id === undefined ? null : String(id));
    const normalizeTime = (time: string | null | undefined) => (time ? String(time) : null);
    
    const teacherChanged = teacher_id !== undefined && normalizeId(teacher_id) !== normalizeId(existingSchedule.teacher_id);
    const roomChanged = room_id !== undefined && normalizeId(room_id) !== normalizeId(existingSchedule.room_id);
    const timeChanged = period_id !== undefined && normalizeId(period_id) !== normalizeId(existingSchedule.period_id);
    const dayChanged = day_of_week !== undefined && day_of_week !== existingSchedule.day_of_week;
    const startTimeChanged = start_time !== undefined && normalizeTime(start_time) !== normalizeTime(existingSchedule.start_time);
    const endTimeChanged = end_time !== undefined && normalizeTime(end_time) !== normalizeTime(existingSchedule.end_time);
    // Also check if period_id change resulted in different start/end times
    const periodTimeChanged = period_id !== undefined && period_id && 
      (normalizeTime(finalStartTime) !== normalizeTime(existingSchedule.start_time) || 
       normalizeTime(finalEndTime) !== normalizeTime(existingSchedule.end_time));
    
    const hasRelevantChanges = teacherChanged || roomChanged || timeChanged || dayChanged || startTimeChanged || endTimeChanged || periodTimeChanged;

    console.log('📋 Schedule update check:', {
      scheduleId,
      teacherChanged,
      roomChanged,
      timeChanged,
      dayChanged,
      startTimeChanged,
      endTimeChanged,
      periodTimeChanged,
      hasRelevantChanges,
      currentTeacherId,
      currentRoomId,
      currentStartTime,
      currentEndTime,
      currentDayOfWeek,
      existingTeacherId: existingSchedule.teacher_id,
      existingRoomId: existingSchedule.room_id,
      existingStartTime: existingSchedule.start_time,
      existingEndTime: existingSchedule.end_time,
      existingDayOfWeek: existingSchedule.day_of_week,
      periodId: period_id,
      existingPeriodId: existingSchedule.period_id
    });

    // Validate day_of_week if provided
    if (day_of_week) {
      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (!validDays.includes(day_of_week)) {
        return NextResponse.json(
          { error: 'Invalid day_of_week', details: `day_of_week must be one of: ${validDays.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Only check for conflicts if relevant fields have changed
    if (hasRelevantChanges) {
      // Check for conflicts (excluding current schedule)
      // Two time ranges overlap if: new_start <= existing_end AND new_end >= existing_start
      // Only check conflicts if we have all required values
      if (currentTeacherId && currentStartTime && currentEndTime && currentDayOfWeek) {
        const { data: conflicts, error: conflictError } = await supabaseAdmin
          .from('class_schedules')
          .select('id, start_time, end_time, day_of_week, teacher_id')
          .eq('school_id', schoolId)
          .eq('teacher_id', currentTeacherId)
          .eq('day_of_week', currentDayOfWeek)
          .eq('is_active', true)
          .neq('id', scheduleId)
          .lte('start_time', currentEndTime)  // existing start <= new end
          .gte('end_time', currentStartTime); // existing end >= new start

        if (conflictError) {
          console.error('Error checking conflicts:', conflictError);
          return NextResponse.json(
            { error: 'Failed to check conflicts', details: conflictError.message },
            { status: 500 }
          );
        }

        if (conflicts && conflicts.length > 0) {
          console.log('⚠️ Found conflicts:', conflicts);
          return NextResponse.json(
            { error: 'Schedule conflict', details: 'Teacher already has a class scheduled at this time' },
            { status: 400 }
          );
        }
      }

      // Check for room conflicts
      // Two time ranges overlap if: new_start <= existing_end AND new_end >= existing_start
      // Only check conflicts if we have all required values
      if (currentRoomId && currentStartTime && currentEndTime && currentDayOfWeek) {
        const { data: roomConflicts, error: roomConflictError } = await supabaseAdmin
          .from('class_schedules')
          .select('id, start_time, end_time, day_of_week, room_id')
          .eq('school_id', schoolId)
          .eq('room_id', currentRoomId)
          .eq('day_of_week', currentDayOfWeek)
          .eq('is_active', true)
          .neq('id', scheduleId)
          .lte('start_time', currentEndTime)  // existing start <= new end
          .gte('end_time', currentStartTime); // existing end >= new start

        if (roomConflictError) {
          console.error('Error checking room conflicts:', roomConflictError);
          return NextResponse.json(
            { error: 'Failed to check room conflicts', details: roomConflictError.message },
            { status: 500 }
          );
        }

        if (roomConflicts && roomConflicts.length > 0) {
          console.log('⚠️ Found room conflicts:', roomConflicts);
          return NextResponse.json(
            { error: 'Room conflict', details: 'Room is already booked at this time' },
            { status: 400 }
          );
        }
      }
    } else {
      console.log('✅ No relevant changes detected, skipping conflict check');
    }

    // Determine if this is a breaking change that requires history tracking
    const isActiveChangingToFalse = is_active !== undefined && is_active === false && existingSchedule.is_active === true;
    const isBreakingChange = dayChanged || teacherChanged || isActiveChangingToFalse;

    if (isBreakingChange) {
      // Breaking change: End-date old record and create new record
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // End-date the old record
      const { error: endDateError } = await supabaseAdmin
        .from('class_schedules')
        // @ts-expect-error - Supabase generated types use never for untyped schema
        .update({
          effective_to: yesterdayStr,
          is_active: false
        })
        .eq('id', scheduleId);

      if (endDateError) {
        console.error('Error end-dating old schedule:', endDateError);
        return NextResponse.json(
          { error: 'Failed to update schedule history', details: endDateError.message },
          { status: 500 }
        );
      }

      // Create new record with updated values
      const todayStr = today.toISOString().split('T')[0];
      
      // Generate UUID client-side as fallback if database default doesn't work
      const { generateUUID } = await import('../../../../../lib/uuid-utils');
      const newScheduleId = generateUUID();
      
      const newScheduleData: Record<string, unknown> = {
        id: newScheduleId, // Explicitly set ID to avoid null constraint violation
        school_id: schoolId,
        class_id: class_id !== undefined ? (class_id && class_id !== '' ? class_id : null) : existingSchedule.class_id,
        teacher_id: currentTeacherId,
        subject: subject !== undefined ? subject : existingSchedule.subject,
        grade: grade !== undefined ? grade : existingSchedule.grade,
        day_of_week: currentDayOfWeek,
        period_id: period_id !== undefined ? (period_id && period_id !== '' ? period_id : null) : existingSchedule.period_id,
        room_id: currentRoomId,
        start_time: currentStartTime,
        end_time: currentEndTime,
        academic_year: academic_year !== undefined ? academic_year : existingSchedule.academic_year,
        notes: notes !== undefined ? (notes && notes !== '' ? notes : null) : existingSchedule.notes,
        created_by: existingSchedule.created_by,
        is_active: is_active !== undefined ? is_active : true,
        effective_from: todayStr,
        effective_to: null
      };

      const { data: newSchedule, error: createError } = await supabaseAdmin
        .from('class_schedules')
        .insert(newScheduleData as never)
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
        .single();

      if (createError) {
        console.error('Error creating new schedule record:', createError);
        return NextResponse.json(
          { error: 'Failed to create new schedule record', details: createError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ schedule: newSchedule });
    } else {
      // Non-breaking change: Update existing record normally
      const updateData: Record<string, unknown> = {};
      if (class_id !== undefined) updateData.class_id = class_id && class_id !== '' ? class_id : null;
      if (teacher_id !== undefined) updateData.teacher_id = currentTeacherId;
      if (subject !== undefined) updateData.subject = subject;
      if (grade !== undefined) updateData.grade = grade;
      if (day_of_week !== undefined) updateData.day_of_week = currentDayOfWeek;
      if (period_id !== undefined) updateData.period_id = period_id && period_id !== '' ? period_id : null;
      if (room_id !== undefined) updateData.room_id = currentRoomId;
      // Always update start_time and end_time (use current values which may be from period or existing schedule)
      updateData.start_time = currentStartTime;
      updateData.end_time = currentEndTime;
      if (academic_year !== undefined) updateData.academic_year = academic_year;
      if (notes !== undefined) updateData.notes = notes && notes !== '' ? notes : null;
      if (is_active !== undefined) updateData.is_active = is_active;

      const { data: schedule, error } = await supabaseAdmin
        .from('class_schedules')
        .update(updateData as never)
        .eq('id', scheduleId)
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
        .single();

      if (error) {
        console.error('Error updating schedule:', error);
        return NextResponse.json(
          { error: 'Failed to update schedule', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ schedule });
    }
  } catch (error) {
    logger.error('Unexpected error in PUT /api/school-admin/schedules/[id]', {
      endpoint: '/api/school-admin/schedules/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/schedules/[id]' },
      'Failed to update schedule'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE /api/school-admin/schedules/[id]
// Delete (deactivate) a schedule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
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

    const { id: scheduleId } = await params;

    // Verify schedule belongs to this school and get effective_from date
    const { data: existingSchedule } = await supabaseAdmin
      .from('class_schedules')
      .select('id, school_id, effective_from')
      .eq('id', scheduleId)
      .single();

    if (!existingSchedule) {
      return NextResponse.json(
        { error: 'Schedule not found' },
        { status: 404 }
      );
    }

    if (existingSchedule.school_id !== schoolId) {
      return NextResponse.json(
        { error: 'Forbidden: Schedule does not belong to your school' },
        { status: 403 }
      );
    }

    // Soft delete by setting is_active to false and effective_to to today
    // We need effective_to >= effective_from to satisfy check_effective_dates_valid constraint
    const today = new Date();

    // Ensure effective_to is >= effective_from
    // If effective_from is in the future (shouldn't happen), use it as effective_to
    const effectiveFromDate = existingSchedule.effective_from 
      ? new Date(existingSchedule.effective_from) 
      : today;
    const effectiveToDate = effectiveFromDate > today ? effectiveFromDate : today;
    const effectiveToStr = effectiveToDate.toISOString().split('T')[0];
    
    const { error } = await supabaseAdmin
      .from('class_schedules')
      .update({
        is_active: false,
        effective_to: effectiveToStr,
      } as never)
      .eq('id', scheduleId);

    if (error) {
      console.error('Error deleting schedule:', error);
      return NextResponse.json(
        { error: 'Failed to delete schedule', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/school-admin/schedules/[id]', {
      endpoint: '/api/school-admin/schedules/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/schedules/[id]' },
      'Failed to delete schedule'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

