import { NextRequest, NextResponse } from 'next/server';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { updateLeaveStatusSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../lib/auth-utils';


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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }
    
    // IMPORTANT: Use supabaseAdmin to bypass RLS for admin access
    // Using RLS-authenticated client can cause expensive policy evaluation and
    // intermittent Postgres statement timeouts. Use the service-role client to
    // bypass RLS for predictable performance (same pattern as /api/admin/courses)
    const supabase = supabaseAdmin;
    
    logger.info('Fetching teacher leave requests', {
      endpoint: '/api/admin/leaves',
      userId: adminCheck.userId
    });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const schoolId = searchParams.get('school_id') || undefined;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset') || '0';

    // Use supabaseAdmin to bypass RLS - admin already verified above
    let query = supabase
      .from('teacher_leaves')
      .select(`
        *,
        profiles!teacher_leaves_teacher_id_fkey (
          id,
          full_name,
          email
        ),
        schools (
          id,
          name,
          school_code
        )
      `)
      .order('created_at', { ascending: false });
    
    // Only apply pagination if limit is explicitly provided
    if (limit) {
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data: leaves, error } = await query;

    if (error) {
      logger.error('Failed to fetch leaves', {
        endpoint: '/api/admin/leaves',
        status,
        schoolId,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/leaves', status, schoolId: schoolId || undefined },
        'Failed to fetch leaves'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.info('Leaves fetched successfully', {
      endpoint: '/api/admin/leaves',
      count: leaves?.length || 0,
      status: status || 'all',
      schoolId: schoolId || 'all',
      sampleIds: leaves?.slice(0, 3).map((l: any) => l.id) || []
    });

    return NextResponse.json({ leaves: leaves || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/leaves', {
      endpoint: '/api/admin/leaves',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/leaves' },
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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(updateLeaveStatusSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for leave update', {
        endpoint: '/api/admin/leaves',
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

    const { id, status, approved_by, admin_remarks, action } = validation.data;

    if (!id || !status) {
      return NextResponse.json({ error: 'Leave ID and status are required' }, { status: 400 });
    }

    // Validate status values
    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be Approved, Rejected, or Pending' }, { status: 400 });
    }

    // Demo data is no longer supported - only update real database records
    if (id.startsWith('demo-')) {
      console.warn('⚠️ Attempted to update demo data - demo data is no longer supported');
      return NextResponse.json({ 
        error: 'Demo data updates are not supported. Only real database records can be updated.',
        details: 'The leave ID appears to be demo data which is no longer returned by the API'
      }, { status: 400 });
    }

    // For real database updates
    // Get current user ID to set reviewed_by
    const authHeaderForUser = request.headers.get('Authorization');
    const token = authHeaderForUser?.split(' ')[1];
    const { data: userResponse } = await supabaseAdmin.auth.getUser(token || '');
    const userId = userResponse?.user?.id;

    // Use transaction function to atomically update leave status
    // This prevents race conditions and duplicate approvals with proper row locking
    const { data: transactionResult, error: transactionError } = await (supabaseAdmin
       
      .rpc('update_leave_status' as any, {
        p_leave_id: id,
        p_status: status,
        p_reviewed_by: userId || approved_by || null,
        p_admin_remarks: admin_remarks || null
       
      } as any) as any);

    if (transactionError || !transactionResult?.success) {
      logger.error('Error updating leave', {
        endpoint: '/api/admin/leaves',
        method: 'PUT',
        leaveId: id,
      }, transactionError instanceof Error ? transactionError : new Error(String(transactionError || transactionResult?.error)));
      
      const errorInfo = await handleApiError(
        transactionError || new Error(transactionResult?.error || 'Transaction failed'),
        { endpoint: '/api/admin/leaves', method: 'PUT', leaveId: id },
        'Failed to update leave'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    const leave = transactionResult.leave;

    // If leave is approved, update teacher attendance records for the leave period
    // (The trigger should handle this, but we keep this as backup)
    if (status === 'Approved' && leave) {
      await updateAttendanceForApprovedLeave(leave);
    }

    // Use supabaseAdmin to bypass RLS - admin already verified above
    // Fetch full leave data with relationships using supabaseAdmin
    const { data: fullLeave, error: fetchError } = await supabaseAdmin
      .from('teacher_leaves')
      .select(`
        *,
        profiles!teacher_leaves_teacher_id_fkey (
          id,
          full_name,
          email
        ),
        schools (
          id,
          name,
          school_code
        )
      `)
      .eq('id', id)
       
      .single() as any;

    return NextResponse.json({ 
      success: true,
      leave: fullLeave || leave,
      message: `Leave ${status.toLowerCase()} successfully` 
    });
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/leaves', {
      endpoint: '/api/admin/leaves',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/leaves' },
      'Failed to update leave status'
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

    // Update attendance records for each date (use attendance table, teacher_attendance is deprecated)
    for (const date of dates) {
      // Check if attendance record exists
      const { data: existingAttendance } = await supabaseAdmin
        .from('attendance')
        .select('id')
        .eq('user_id', leave.teacher_id)
        .eq('school_id', leave.school_id)
        .eq('date', date)
         
        .single() as any;

      const remarks = `Approved leave: ${leave.leave_type} - ${leave.reason}`;

      if (existingAttendance) {
        // Update existing record
         
        await ((supabaseAdmin as any)
          .from('attendance')
          .update({
            status: 'Leave-Approved', // Map to attendance table status format
            remarks: remarks,
            recorded_at: new Date().toISOString()
           
          } as any)
           
          .eq('id', existingAttendance.id as any)) as any;
      } else {
        // Create new record
        await (supabaseAdmin
          .from('attendance')
          .insert({
            user_id: leave.teacher_id, // Map teacher_id to user_id
            school_id: leave.school_id,
            date,
            status: 'Leave-Approved', // Map to attendance table status format
            remarks: remarks,
            recorded_by: leave.reviewed_by || leave.teacher_id,
            recorded_at: new Date().toISOString()
           
          } as any) as any);
      }
    }
  } catch (error) {
    logger.warn('Error updating attendance for approved leave (non-critical)', {
      endpoint: '/api/admin/leaves',
    }, error instanceof Error ? error : new Error(String(error)));
    // Don't throw error as this is a side effect
  }
}