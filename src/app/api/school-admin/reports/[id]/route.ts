import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { reportActionSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// Helper to get school_id from the current school admin's profile
async function getSchoolIdFromAuth(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return null;
  }

  const { data: userResponse, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userResponse.user) {
    console.error('Error getting user from token:', userError?.message);
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('school_id')
    .eq('id', userResponse.user.id)
     
    .single() as any;

  if (profileError || !profile) {
    console.error('Error fetching school admin profile:', profileError?.message);
    return null;
  }

  return profile.school_id;
}

// PATCH: Approve or reject a teacher report
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: reportId } = await params;
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(reportActionSchema, body);
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
    const school_id = await getSchoolIdFromAuth(request);

    if (!school_id) {
      return NextResponse.json({ error: 'School ID not found for authenticated user' }, { status: 403 });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject"' }, { status: 400 });
    }

    // Verify report belongs to school admin's school
    const { data: report, error: fetchError } = await supabaseAdmin
      .from('teacher_reports')
      .select('id, school_id, notes')
      .eq('id', reportId)
      .eq('school_id', school_id)
       
      .single() as any;

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found or access denied' }, { status: 404 });
    }

    // Get current user ID
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    const { data: userResponse } = await supabaseAdmin.auth.getUser(token || '');
    const userId = userResponse?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 403 });
    }

    // Update report
     
    const updateData: any = {
      approved_by: userId,
      approved_at: new Date().toISOString()
    };

    if (action === 'reject' && notes) {
      updateData.notes = (report.notes || '') + ' [REJECTED: ' + notes + ']';
    }

    const { data: updatedReport, error: updateError } = await ((supabaseAdmin as any)
      .from('teacher_reports')
       
      .update(updateData as any)
      .eq('id', reportId)
      .eq('school_id', school_id)
      .select()
       
      .single() as any) as any;

    if (updateError) {
      console.error('❌ Error updating teacher report:', updateError);
      return NextResponse.json(
        { error: 'Failed to update report', details: updateError.message },
        { status: 500 }
      );
    }

    const successResponse = NextResponse.json({
      success: true,
      message: `Report ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      report: updatedReport
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/school-admin/reports/[id]', {
      endpoint: '/api/school-admin/reports/[id]',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/reports/[id]' },
      'Failed to update report'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

