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
    const status = searchParams.get('status'); // 'Pending', 'Approved', 'Rejected', null, or '' for all
    const school_id = await getSchoolAdminSchoolId(request);

    if (!school_id) {
      return NextResponse.json({ error: 'School ID not found for authenticated user' }, { status: 403 });
    }

    // First, get the leaves data - explicitly select approved_by and reviewed_by
    let query = supabaseAdmin
      .from('teacher_leaves')
      .select(`
        id,
        teacher_id,
        school_id,
        start_date,
        end_date,
        reason,
        leave_type,
        status,
        total_days,
        substitute_required,
        created_at,
        approved_by,
        approved_at,
        reviewed_by,
        reviewed_at,
        profiles!teacher_leaves_teacher_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('school_id', school_id)
      .order('created_at', { ascending: false });

    // Only filter by status if a valid status is provided (not null, not empty string)
    if (status && status.trim() !== '') {
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

    // Fetch approver and reviewer profiles separately and merge
    type Leave = {
      id: string;
      teacher_id?: string | null;
      school_id?: string | null;
      start_date?: string | null;
      end_date?: string | null;
      reason?: string | null;
      leave_type?: string | null;
      status?: string | null;
      total_days?: number | null;
      substitute_required?: boolean | null;
      created_at?: string | null;
      approved_by?: string | null;
      approved_at?: string | null;
      reviewed_by?: string | null;
      reviewed_at?: string | null;
      profiles?: {
        id: string;
        full_name?: string | null;
        email?: string | null;
      } | null;
    };
    type Profile = {
      id: string;
      full_name?: string | null;
      email?: string | null;
      role?: string | null;
    };
    if (leavesData && leavesData.length > 0) {
      const typedLeaves = (leavesData || []) as Leave[];
      const reviewerIds = typedLeaves
        .map((leave) => leave.reviewed_by)
        .filter((id): id is string => id != null);
      const approverIds = typedLeaves
        .map((leave) => leave.approved_by)
        .filter((id): id is string => id != null);
      const allProfileIds = [...new Set([...reviewerIds, ...approverIds])];

      // Debug logging to see what's in the database
      logger.debug('Fetching approver/reviewer profiles', {
        endpoint: '/api/school-admin/leaves',
        approverIds: approverIds,
        reviewerIds: reviewerIds,
        allProfileIds: allProfileIds,
        sampleLeave: typedLeaves[0] ? {
          id: typedLeaves[0].id,
          status: typedLeaves[0].status,
          approved_by: typedLeaves[0].approved_by,
          reviewed_by: typedLeaves[0].reviewed_by
        } : null
      });

      let profilesMap: Record<string, Profile> = {};
      if (allProfileIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email, role')
          .in('id', allProfileIds);

        if (profilesError) {
          logger.warn('Error fetching approver/reviewer profiles', {
            endpoint: '/api/school-admin/leaves',
            error: profilesError
          });
        }

        if (profilesData) {
          profilesMap = ((profilesData || []) as Profile[]).reduce((acc: Record<string, Profile>, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {});
          
          // Debug logging to see what profiles were found
          logger.debug('Profiles fetched for approvers/reviewers', {
            endpoint: '/api/school-admin/leaves',
            profilesFound: ((profilesData || []) as Profile[]).map((p) => ({
              id: p.id,
              name: p.full_name,
              role: p.role
            }))
          });
        }
      }

      // Merge approver and reviewer data into leaves
      const enrichedLeaves = typedLeaves.map((leave) => {
        const approver = leave.approved_by ? profilesMap[leave.approved_by] : null;
        const reviewer = leave.reviewed_by ? profilesMap[leave.reviewed_by] : null;
        
        // Debug logging for each leave
        if (leave.status === 'Approved') {
          logger.debug('Leave approver mapping', {
            endpoint: '/api/school-admin/leaves',
            leaveId: leave.id,
            approved_by: leave.approved_by,
            approverFound: approver ? {
              id: approver.id,
              name: approver.full_name,
              role: approver.role
            } : null,
            reviewed_by: leave.reviewed_by,
            reviewerFound: reviewer ? {
              id: reviewer.id,
              name: reviewer.full_name,
              role: reviewer.role
            } : null
          });
        }
        
        return {
          ...leave,
          reviewer: reviewer,
          approver: approver,
        };
      });

      return NextResponse.json({
        leaves: enrichedLeaves || [],
        total: enrichedLeaves?.length || 0
      });
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

