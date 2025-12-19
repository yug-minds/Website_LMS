import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';

import { getOrSetCache, CacheTTL } from '../../../../lib/cache';
import { initializeServer } from '../../../../lib/server-init';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use SUPABASE_SERVICE_ROLE_KEY to match other API routes (consistent naming)

// Create admin client that bypasses RLS

export async function GET(request: NextRequest) {
  // Skip CSRF for read-only GET requests (optimization)
  // CSRF protection is only needed for state-changing operations (POST, PUT, DELETE)
  // ensureCsrfToken(request); // Commented out for performance
  
  // Initialize server optimizations on first request (non-blocking)
  initializeServer().catch(() => {
    // Ignore errors during initialization
  });
  
  // Skip rate limiting for admin stats (read-only, internal endpoint)
  // Or use very high limit for admin endpoints
  // const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
  // if (!rateLimitResult.success) {
  //   return NextResponse.json(
  //     { 
  //       error: 'Too many requests',
  //       message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
  //     },
  //     { 
  //       status: 429,
  //       headers: createRateLimitHeaders(rateLimitResult)
  //     }
  //   );
  // }

try {
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }
    
    // Get access token for authenticated client
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const accessToken = authHeader.replace('Bearer ', '');

    // Create authenticated client once per request (used for live + cached stats)
    // We intentionally compute the school count live (not from cached/materialized views)
    // so the dashboard reflects real-time active school count.
    const supabase = await createAuthenticatedClient(accessToken);
    
    // Cache key for admin stats (global - same for all admins since data is the same)
    // Using global key improves cache hit rate since all admins see the same stats
    const cacheKey = `admin:stats:global`;
    
    logger.info('Admin stats cache key', {
      endpoint: '/api/admin/stats',
      cacheKey,
      userId: adminCheck.userId
    });
    
    // Live count for schools (treat NULL as active; only exclude explicit false)
    const liveSchoolsResult = await supabase
      .from('schools')
      .select('id', { count: 'exact', head: true })
      .neq('is_active', false);
    const liveTotalSchools = liveSchoolsResult.count ?? null;

    // Live count for teachers (avoids stale materialized view / cache)
    const liveTeachersResult = await supabase
      .from('teachers')
      .select('id', { count: 'exact', head: true });
    const liveTotalTeachers = liveTeachersResult.count ?? null;

    // Live count for students (avoid stale materialized view / cache)
    // Keep semantics consistent with /api/admin/students (profiles where role = 'student')
    const liveStudentsResult = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student');
    const liveTotalStudents = liveStudentsResult.count ?? null;

    // Use cached data or fetch fresh (for other metrics)
    const stats = await getOrSetCache(
      cacheKey,
      async () => {
        // Try materialized view first (fastest - pre-computed, direct query)
        // Skip RPC function call to reduce overhead - use materialized view directly
        // Note: Materialized view should have only one row, but use limit(1) for safety
        const mvStartTime = Date.now();
        // Select only needed fields from materialized view
        const { data: mvDataArray, error: mvError } = await supabase
          .from('mv_admin_stats')
          .select('total_schools, total_teachers, total_students, active_courses, pending_leaves')
          .order('last_updated', { ascending: false })
          .limit(1);
        const mvDuration = Date.now() - mvStartTime;
        
        // Get first row (materialized view should only have one row)
        const mvData = mvDataArray && mvDataArray.length > 0 ? mvDataArray[0] : null;

        if (!mvError && mvData && mvDataArray && mvDataArray.length > 0) {
          logger.info('Admin stats fetched from materialized view', {
            endpoint: '/api/admin/stats',
            duration: `${mvDuration}ms`,
            usingMaterializedView: true
          });
          return {
            // totalSchools is overridden with liveTotalSchools after caching layer
            totalSchools: mvData.total_schools || 0,
            totalTeachers: mvData.total_teachers || 0,
            totalStudents: mvData.total_students || 0,
            activeCourses: mvData.active_courses || 0,
            pendingLeaves: mvData.pending_leaves || 0
          };
        }

        // Only fallback to database function if materialized view doesn't exist or has no data
        // This should rarely happen if materialized view refresh is working
        logger.warn('Materialized view not available, using database function', {
          endpoint: '/api/admin/stats',
          mvError: mvError?.message
        });
        
        const functionStartTime = Date.now();
        const { data: statsData, error: statsError } = await supabase
          .rpc('get_admin_stats');
        const functionDuration = Date.now() - functionStartTime;

        if (statsError) {
          // Fallback to individual queries if function doesn't exist
          logger.warn('Admin stats function not available, using fallback queries', {
            endpoint: '/api/admin/stats',
            error: statsError.message,
            functionDuration: `${functionDuration}ms`
          });

          const [
            schoolsResult,
            teachersResult,
            studentsResult,
            coursesResult,
            leavesResult
          ] = await Promise.all([
            // Match Schools Management semantics: exclude explicitly inactive schools
            supabase.from('schools').select('id', { count: 'exact', head: true }).neq('is_active', false),
            supabase.from('teachers').select('id', { count: 'exact', head: true }),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
            supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'Published').eq('is_published', true),
            supabase.from('teacher_leaves').select('id', { count: 'exact', head: true }).eq('status', 'Pending')
          ]);

          return {
            totalSchools: schoolsResult.count || 0,
            totalTeachers: teachersResult.count || 0,
            totalStudents: studentsResult.count || 0,
            activeCourses: coursesResult.count || 0,
            pendingLeaves: leavesResult.count || 0
          };
        }

        // Use function result (much faster - single query)
        const result = statsData as {
          totalSchools: number;
          totalTeachers: number;
          totalStudents: number;
          activeCourses: number;
          pendingLeaves: number;
        };

        logger.info('Admin stats fetched using database function', {
          endpoint: '/api/admin/stats',
          stats: result,
          functionDuration: `${functionDuration}ms`,
          usingOptimizedFunction: true
        });

        return result;
      },
      CacheTTL.ADMIN_STATS // 10 minutes - longer TTL for stable admin stats
    );

    // Always override totalSchools + totalTeachers with live values (real-time)
    // If live query fails (count null), fall back to the cached value.
    const finalStats = {
      ...stats,
      totalSchools: liveTotalSchools ?? stats.totalSchools,
      totalTeachers: liveTotalTeachers ?? stats.totalTeachers,
      totalStudents: liveTotalStudents ?? stats.totalStudents
    };

    console.log('📊 Stats fetched:', {
      schools: finalStats.totalSchools,
      teachers: finalStats.totalTeachers,
      students: finalStats.totalStudents,
      courses: finalStats.activeCourses,
      pendingLeaves: finalStats.pendingLeaves
    });

    const response = NextResponse.json({ stats: finalStats });
    
    // Add HTTP caching headers
    addCacheHeaders(response, finalStats, {
      ...CachePresets.DASHBOARD_STATS,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    const requestStartTime = Date.now();
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/admin/stats',
        statusCode: 304,
        is304: true,
        hasETag: true,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: 0,
        duration: Date.now() - requestStartTime
      });
      return new NextResponse(null, { status: 304 });
    }

    // Track 200 response
    const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
    recordHttpCacheOperation({
      endpoint: '/api/admin/stats',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify({ stats: finalStats }).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/stats', {
      endpoint: '/api/admin/stats',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/stats' },
      'Failed to fetch admin stats'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

