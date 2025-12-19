import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { leaveActionSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


// PATCH: Approve or reject a teacher leave request
export async function PATCH(
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
    const { id: leaveId } = await params;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(leaveActionSchema, body);
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

    const { action, notes } = validation.data;
    const school_id = await getSchoolAdminSchoolId(request);

    if (!school_id) {
      return NextResponse.json({ error: 'School ID not found for authenticated user' }, { status: 403 });
    }

    // Verify leave request belongs to school admin's school
    const { data: leave, error: fetchError } = await supabaseAdmin
      .from('teacher_leaves')
      .select('id, school_id')
      .eq('id', leaveId)
      .eq('school_id', school_id)
       
      .single() as any;

    if (fetchError || !leave) {
      return NextResponse.json({ error: 'Leave request not found or access denied' }, { status: 404 });
    }

    // Get current user ID
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    const { data: userResponse } = await supabaseAdmin.auth.getUser(token || '');
    const userId = userResponse?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 403 });
    }

    // Update leave request
    // Set reviewed_by to track who reviewed (school admin or system admin)
    const nowIso = new Date().toISOString();
    const fullUpdatePayload = {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      reviewed_by: userId,
      approved_by: action === 'approve' ? userId : null,
      approved_at: action === 'approve' ? nowIso : null,
      reviewed_at: nowIso,
    };

    // Some environments may still have the legacy `teacher_leaves` schema
    // (no reviewed_by/reviewed_at). In that case, fall back gracefully.
    let updatedLeave: any = null;
    let updateError: any = null;

    const firstAttempt = await ((supabaseAdmin as any)
      .from('teacher_leaves')
      .update(fullUpdatePayload)
      .eq('id', leaveId)
      .eq('school_id', school_id)
      .select()
      .single());

    updatedLeave = firstAttempt?.data ?? null;
    updateError = firstAttempt?.error ?? null;

    if (updateError) {
      const msg = String(updateError?.message || '');
      const code = String(updateError?.code || '');

      // 42703 = undefined_column (Postgres)
      const looksLikeLegacySchema =
        code === '42703' ||
        msg.includes('reviewed_by') ||
        msg.includes('reviewed_at');

      if (looksLikeLegacySchema) {
        const legacyPayload = {
          status: action === 'approve' ? 'Approved' : 'Rejected',
          approved_by: action === 'approve' ? userId : null,
          approved_at: action === 'approve' ? nowIso : null,
        };

        const secondAttempt = await ((supabaseAdmin as any)
          .from('teacher_leaves')
          .update(legacyPayload)
          .eq('id', leaveId)
          .eq('school_id', school_id)
          .select()
          .single());

        updatedLeave = secondAttempt?.data ?? null;
        updateError = secondAttempt?.error ?? null;
      }
    }

    if (updateError) {
      console.error('❌ Error updating teacher leave:', {
        message: updateError?.message,
        details: updateError?.details,
        hint: updateError?.hint,
        code: updateError?.code,
        raw: updateError
      });
      return NextResponse.json(
        { error: 'Failed to update leave request', details: updateError?.message || 'Unknown error', code: updateError?.code, hint: updateError?.hint },
        { status: 500 }
      );
    }

    // If leave is approved, update teacher attendance records for the leave period
    if (action === 'approve' && updatedLeave) {
      await updateAttendanceForApprovedLeave(updatedLeave);
    }

    const successResponse = NextResponse.json({
      success: true,
      message: `Leave request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      leave: updatedLeave
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/school-admin/leaves/[id]', {
      endpoint: '/api/school-admin/leaves/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/leaves/[id]' },
      'Failed to update leave request'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Helper function to update attendance records for approved leave
async function updateAttendanceForApprovedLeave(leave: any) {
  try {
    const startDate = new Date(leave.start_date);
    const endDate = new Date(leave.end_date);
    const dates = [];

    // Generate all dates in the leave period
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Update attendance records for each date
    for (const date of dates) {
      try {
        // Check if attendance record exists
        const { data: existingAttendance } = await supabaseAdmin
          .from('attendance')
          .select('id')
          .eq('user_id', leave.teacher_id)
          .eq('school_id', leave.school_id)
          .eq('date', date)
          .maybeSingle() as any;

        const remarks = `Approved leave: ${leave.leave_type || 'Leave'} - ${leave.reason}`;

        if (existingAttendance) {
          // Update existing record
          await supabaseAdmin
            .from('attendance')
            .update({
              status: 'Leave-Approved',
              remarks: remarks,
              recorded_at: new Date().toISOString()
            })
            .eq('id', existingAttendance.id);
        } else {
          // Create new record
          await supabaseAdmin
            .from('attendance')
            .insert({
              user_id: leave.teacher_id,
              school_id: leave.school_id,
              date,
              status: 'Leave-Approved',
              remarks: remarks,
              recorded_by: leave.reviewed_by || leave.approved_by || leave.teacher_id,
              recorded_at: new Date().toISOString()
            });
        }
      } catch (attendanceError: any) {
        // Log but don't fail the leave approval if attendance update fails
        console.warn(`Failed to update attendance for date ${date}:`, attendanceError?.message);
      }
    }
  } catch (error) {
    logger.warn('Error updating attendance for approved leave (non-critical)', {
      endpoint: '/api/school-admin/leaves/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    // Don't throw error as this is a side effect
  }
}

