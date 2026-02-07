import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { emptyBodySchema, validateRequestBody } from '../../../../../lib/validation-schemas';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/school-admin/schedules/sync-to-teachers
// Sync latest class schedules to teacher_classes table for teacher dashboard
export async function POST(request: NextRequest) {
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
    // Validate request body (should be empty for this endpoint)
    try {
      const body = await request.json().catch(() => ({}));
      const validation = validateRequestBody(emptyBodySchema, body);
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
    } catch {
      // If body parsing fails, it's likely empty, which is fine
    }

    const schoolId = await getSchoolAdminSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id' },
        { status: 401 }
      );
    }

    console.log('🔄 Syncing schedules to teacher_classes for school:', schoolId);

    // Step 1: Get all currently active schedules for this school (effective_to IS NULL)
    const { data: schedules, error: schedulesError } = await supabaseAdmin
      .from('class_schedules')
      .select('id, teacher_id, class_id, school_id, grade, subject, day_of_week, start_time, end_time')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .is('effective_to', null) // Only sync currently active schedules (no end date)
      .not('teacher_id', 'is', null);

    if (schedulesError) {
      console.error('❌ Error fetching schedules:', schedulesError);
      return NextResponse.json(
        { error: 'Failed to fetch schedules', details: schedulesError.message },
        { status: 500 }
      );
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json(
        { 
          success: true, 
          message: 'No active schedules found to sync',
          synced: 0,
          skipped: 0
        },
        { status: 200 }
      );
    }

    console.log(`📋 Found ${schedules.length} active schedules to sync`);

    // Step 2: For each schedule, ensure teacher_classes entry exists
    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
      if (!schedule.teacher_id || !schedule.school_id) {
        skipped++;
        continue;
      }

      // If class_id exists, use it; otherwise we'll need to find or create the class
      let classId = schedule.class_id;

      // If no class_id, try to find or create a class based on grade and subject
      if (!classId) {
        // Try to find existing class
        const { data: existingClass } = await supabaseAdmin
          .from('classes')
          .select('id')
          .eq('school_id', schedule.school_id)
          .eq('grade', schedule.grade)
          .eq('subject', schedule.subject || '')
          .eq('is_active', true)
          .limit(1)
          .single();

        if (existingClass) {
          classId = existingClass.id;
          await supabaseAdmin
            .from('class_schedules')
            .update({ class_id: classId } as never)
            .eq('id', schedule.id);
        } else {
          const { data: newClass, error: createClassError } = await supabaseAdmin
            .from('classes')
            .insert({
              school_id: schedule.school_id,
              class_name: `${schedule.grade} - ${schedule.subject || 'General'}`,
              grade: schedule.grade,
              subject: schedule.subject || null,
              academic_year: '2024-25',
              is_active: true,
            } as never)
            .select('id')
            .single();

          if (createClassError || !newClass) {
            console.warn(`⚠️ Could not create class for schedule ${schedule.id}:`, createClassError);
            skipped++;
            continue;
          }

          classId = newClass.id;
          await supabaseAdmin
            .from('class_schedules')
            .update({ class_id: classId } as never)
            .eq('id', schedule.id);
        }
      }

      const { data: existingAssignments } = await supabaseAdmin
        .from('teacher_classes')
        .select('id')
        .eq('teacher_id', schedule.teacher_id)
        .eq('class_id', classId);

      if (existingAssignments && existingAssignments.length > 0) {
        // Already exists, skip
        skipped++;
        continue;
      }

      // Create teacher_classes entry
      const { error: insertError } = await supabaseAdmin
        .from('teacher_classes')
        .insert({
          teacher_id: schedule.teacher_id,
          class_id: classId,
          school_id: schedule.school_id,
          grade: schedule.grade,
          subject: schedule.subject || null,
        } as never);

      if (insertError) {
        // Check if it's a duplicate key error (unique constraint violation)
        if (insertError.code === '23505') {
          // Already exists (race condition), skip
          skipped++;
        } else {
          console.error(`❌ Error creating teacher_classes for schedule ${schedule.id}:`, insertError);
          errors.push(`Schedule ${schedule.id}: ${insertError.message}`);
        }
      } else {
        synced++;
      }
    }

    console.log(`✅ Sync completed: ${synced} synced, ${skipped} skipped, ${errors.length} errors`);

    const successResponse = NextResponse.json({
      success: true,
      message: `Successfully synced ${synced} schedule(s) to teacher dashboard`,
      synced,
      skipped,
      total: schedules.length,
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200 });
    ensureCsrfToken(successResponse, request);
    return successResponse;

  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/schedules/sync-to-teachers', {
      endpoint: '/api/school-admin/schedules/sync-to-teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/schedules/sync-to-teachers' },
      'Failed to sync schedules to teachers'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

