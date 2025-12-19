import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { bulkReportApprovalSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// PATCH: Bulk approve teacher reports
export async function PATCH(request: NextRequest) {
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
    const validation = validateRequestBody(bulkReportApprovalSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for bulk report approval', {
        endpoint: '/api/school-admin/reports/bulk',
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

    const { report_ids } = validation.data;
    const school_id = await getSchoolAdminSchoolId(request);

    if (!school_id) {
      return NextResponse.json({ error: 'School ID not found for authenticated user' }, { status: 403 });
    }

    // Get current user ID
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    const { data: userResponse } = await supabaseAdmin.auth.getUser(token || '');
    const userId = userResponse?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 403 });
    }

    // Verify all reports belong to school admin's school
    const { data: reports, error: fetchError } = await supabaseAdmin
      .from('teacher_reports')
      .select('id')
      .in('id', report_ids)
       
      .eq('school_id', school_id) as any;

    if (fetchError) {
      console.error('❌ Error verifying reports:', fetchError);
      return NextResponse.json(
        { error: 'Failed to verify reports', details: fetchError.message },
        { status: 500 }
      );
    }

    if (reports.length !== report_ids.length) {
      return NextResponse.json(
        { error: 'Some reports not found or access denied' },
        { status: 403 }
      );
    }

    // Bulk update reports
     
    const { data: updatedReports, error: updateError } = await ((supabaseAdmin as any)
      .from('teacher_reports')
      .update({
        approved_by: userId,
        approved_at: new Date().toISOString()
       
      } as any)
      .in('id', report_ids)
      .eq('school_id', school_id)
       
      .select() as any) as any;

    if (updateError) {
      console.error('❌ Error bulk updating teacher reports:', updateError);
      return NextResponse.json(
        { error: 'Failed to update reports', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully approved ${updatedReports?.length || 0} report(s)`,
      approved: updatedReports?.length || 0,
      reports: updatedReports
    });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/school-admin/reports/bulk', {
      endpoint: '/api/school-admin/reports/bulk',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/reports/bulk' },
      'Failed to bulk update reports'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

