import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// GET: Fetch teacher reports for school admin's school
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const pending = searchParams.get('pending') === 'true';
    const school_id = await getSchoolAdminSchoolId(request);

    if (!school_id) {
      return NextResponse.json({ error: 'School ID not found for authenticated user' }, { status: 403 });
    }

    // Build base query for counting
    let countQuery = supabaseAdmin
      .from('teacher_reports')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school_id);

    if (pending) {
      countQuery = countQuery.is('approved_by', null);
    }

    // Get total count
    const { count, error: countError } = await countQuery;
    
    if (countError) {
      console.error('❌ Error counting teacher reports:', countError);
    }

    // Build query for data
    let query = supabaseAdmin
      .from('teacher_reports')
      .select(`
        *,
        teacher:profiles!teacher_reports_teacher_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('school_id', school_id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (pending) {
      query = query.is('approved_by', null);
    }

    const { data: reportsData, error } = await query;

    if (error) {
      console.error('❌ Error fetching teacher reports:', error);
      return NextResponse.json(
        { error: 'Failed to fetch teacher reports', details: error.message },
        { status: 500 }
      );
    }

    // Add status based on approval
     
    const reportsWithStatus = (reportsData || []).map((report: any) => ({
      ...report,
      status: report.approved_by ? 'Approved' : 'Pending' as 'Pending' | 'Approved' | 'Rejected'
    }));

    return NextResponse.json({
      reports: reportsWithStatus,
      total: count || reportsWithStatus.length,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/reports', {
      endpoint: '/api/school-admin/reports',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/reports' },
      'Failed to fetch school admin reports'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

