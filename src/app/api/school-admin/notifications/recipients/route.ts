import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// GET: Get list of potential recipients for school admin
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
    // Get the school admin's school_id from authentication (secure)
    const authenticatedSchoolId = await getSchoolAdminSchoolId(request);
    
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id');

    // Use authenticated school_id if available, otherwise fall back to query param (for backward compatibility)
    const finalSchoolId = authenticatedSchoolId || schoolId;

    if (!finalSchoolId) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

    // If authenticated school_id exists, ensure it matches the query param (security check)
    if (authenticatedSchoolId && schoolId && authenticatedSchoolId !== schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School ID mismatch' },
        { status: 403 }
      );
    }

    const results: any = {
      roles: [],
      users: []
    };

    // Get distinct roles within this school
    const { data: rolesData, error: rolesError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('school_id', finalSchoolId)
       
      .not('role', 'is', null) as any;

    if (!rolesError && rolesData) {
       
      const uniqueRoles: string[] = [...new Set((rolesData as any[]).map((p: any) => p.role).filter(Boolean))];
      results.roles = uniqueRoles.map((role: string) => ({
        id: role,
        name: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
         
        count: (rolesData as any[]).filter((p: any) => p.role === role).length
      }));
    }

    // Get users in this school
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, school_id')
      .eq('school_id', finalSchoolId)
      .limit(200)
       
      .order('full_name', { ascending: true }) as any;

    if (!usersError && usersData) {
       
      results.users = (usersData as any[]).map((user: any) => ({
        id: user.id,
        name: user.full_name || user.email,
        email: user.email,
        role: user.role,
        schoolId: user.school_id
      }));
    }

    return NextResponse.json(results);
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/notifications/recipients', {
      endpoint: '/api/school-admin/notifications/recipients',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/notifications/recipients' },
      'Failed to fetch notification recipients'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

