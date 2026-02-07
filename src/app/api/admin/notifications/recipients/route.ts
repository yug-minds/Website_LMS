import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// GET: Get list of potential recipients (users, schools, roles)
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
    const filter = searchParams.get('filter') || 'all'; // all, roles, schools, users

    type RecipientResult = {
      roles: Array<{ id: string; name: string; count: number }>;
      schools: Array<{ id: string; name: string | null; isActive: boolean | null }>;
      users: Array<{ id: string; name: string | null; email: string | null; role: string | null; schoolId: string | null }>;
    };
     
    const results: RecipientResult = {
      roles: [],
      schools: [],
      users: []
    };

    if (filter === 'all' || filter === 'roles') {
      // Get distinct roles
      const { data: rolesData, error: rolesError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .not('role', 'is', null);

      if (!rolesError && rolesData) {
        type ProfileWithRole = { role: string };
        const typedRolesData = rolesData as ProfileWithRole[];
        const uniqueRoles: string[] = [...new Set(typedRolesData.map((p) => p.role).filter(Boolean))];
        results.roles = uniqueRoles.map((role: string) => ({
          id: role,
          name: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
          count: typedRolesData.filter((p) => p.role === role).length
        }));
      }
    }

    if (filter === 'all' || filter === 'schools') {
      // Get all schools
      const { data: schoolsData, error: schoolsError } = await supabaseAdmin
        .from('schools')
        .select('id, name, is_active')
        .order('name', { ascending: true });

      if (!schoolsError && schoolsData) {
        type SchoolData = { id: string; name: string | null; is_active: boolean | null };
        results.schools = (schoolsData as SchoolData[]).map((school) => ({
          id: school.id,
          name: school.name,
          isActive: school.is_active
        }));
      }
    }

    if (filter === 'all' || filter === 'users') {
      // Get users with pagination (limit to 100 for dropdown)
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role, school_id')
        .limit(100)
        .order('full_name', { ascending: true });

      if (!usersError && usersData) {
        type UserData = { id: string; full_name: string | null; email: string | null; role: string | null; school_id: string | null };
        results.users = (usersData as UserData[]).map((user) => ({
          id: user.id,
          name: user.full_name || user.email,
          email: user.email,
          role: user.role,
          schoolId: user.school_id
        }));
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/notifications/recipients', {
      endpoint: '/api/admin/notifications/recipients',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/notifications/recipients' },
      'Failed to fetch notification recipients'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}







