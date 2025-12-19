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

     
    const results: any = {
      roles: [],
      schools: [],
      users: []
    };

    if (filter === 'all' || filter === 'roles') {
      // Get distinct roles
      const { data: rolesData, error: rolesError } = await supabaseAdmin
        .from('profiles')
        .select('role')
         
        .not('role', 'is', null) as any;

      if (!rolesError && rolesData) {
         
        const uniqueRoles: string[] = [...new Set((rolesData as any[]).map((p: any) => p.role).filter(Boolean))];
        results.roles = uniqueRoles.map((role: string) => ({
          id: role,
          name: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
           
          count: (rolesData as any[]).filter((p: any) => p.role === role).length
        }));
      }
    }

    if (filter === 'all' || filter === 'schools') {
      // Get all schools
      const { data: schoolsData, error: schoolsError } = await supabaseAdmin
        .from('schools')
        .select('id, name, is_active')
         
        .order('name', { ascending: true }) as any;

      if (!schoolsError && schoolsData) {
         
        results.schools = (schoolsData as any[]).map((school: any) => ({
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







