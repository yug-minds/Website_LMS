import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// GET: Fetch teacher leave requests for school admin's school
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
    const status = searchParams.get('status'); // 'Pending', 'Approved', 'Rejected', or null for all
    const school_id = await getSchoolAdminSchoolId(request);

    if (!school_id) {
      return NextResponse.json({ error: 'School ID not found for authenticated user' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('teacher_leaves')
      .select(`
        *,
        profiles!teacher_leaves_teacher_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('school_id', school_id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: leavesData, error } = await query;

    if (error) {
      console.error('❌ Error fetching teacher leaves:', error);
      return NextResponse.json(
        { error: 'Failed to fetch teacher leaves', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      leaves: leavesData || [],
      total: leavesData?.length || 0
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/leaves', {
      endpoint: '/api/school-admin/leaves',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/leaves' },
      'Failed to fetch school admin leaves'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

