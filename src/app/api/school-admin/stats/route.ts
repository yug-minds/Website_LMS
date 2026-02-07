import { NextRequest, NextResponse } from 'next/server';
import { getSchoolAdminSchoolId } from '../../../../lib/school-admin-auth';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { logger, handleApiError } from '../../../../lib/logger';
import { getOrSetCache, CacheTTL } from '../../../../lib/cache';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';

const _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;


export async function GET(request: NextRequest) {
  // Skip CSRF for read-only GET requests (optimization)
  // CSRF protection is only needed for state-changing operations (POST, PUT, DELETE)
  // ensureCsrfToken(request); // Commented out for performance
  
  // Skip rate limiting for school admin stats (read-only, authenticated, cached endpoint)
  // Rate limiting adds 100-400ms overhead per request
  // This endpoint is already secured via authentication and cached
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
    // Get access token for authenticated client
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    
    // Get the school admin's school_id from authentication (secure - required)
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required', details: 'Unable to determine school_id from auth token' },
        { status: 401 }
      );
    }

    // Cache key for school admin stats (school-specific, cache for 5 minutes)
    const cacheKey = `school-admin:stats:${schoolId}`;
    
    logger.info('School admin stats cache key', {
      endpoint: '/api/school-admin/stats',
      cacheKey,
      schoolId
    });
    
    // Use cached data or fetch fresh
    const stats = await getOrSetCache(
      cacheKey,
      async () => {
        // Try materialized view first (fastest - pre-computed, direct query)
        // Use admin client for MV query (no RLS needed - pre-computed data)
        // Skip RPC function call to reduce overhead - use materialized view directly
        const mvStartTime = Date.now();
        // Select only needed fields from materialized view
        const { data: mvData, error: mvError } = await supabaseAdmin
          .from('mv_school_admin_stats')
          .select('total_students, total_teachers, active_courses, pending_reports, pending_leaves, average_attendance')
          .eq('school_id', schoolId)
          .single();
        const mvDuration = Date.now() - mvStartTime;
        
        type MvStatsRow = {
          total_students?: number | null;
          total_teachers?: number | null;
          active_courses?: number | null;
          pending_reports?: number | null;
          pending_leaves?: number | null;
          average_attendance?: number | null;
        };
        const mvRow = mvData as MvStatsRow | null;
        if (!mvError && mvRow) {
          logger.info('School admin stats fetched from materialized view', {
            endpoint: '/api/school-admin/stats',
            schoolId,
            duration: `${mvDuration}ms`,
            usingMaterializedView: true
          });
          return {
            totalStudents: mvRow.total_students ?? 0,
            totalTeachers: mvRow.total_teachers ?? 0,
            activeCourses: mvRow.active_courses ?? 0,
            pendingReports: mvRow.pending_reports ?? 0,
            pendingLeaves: mvRow.pending_leaves ?? 0,
            averageAttendance: mvRow.average_attendance ?? 0
          };
        }

        // Only fallback to database function if materialized view doesn't exist or has no data
        // This should rarely happen if materialized view refresh is working
        logger.warn('Materialized view not available, using database function', {
          endpoint: '/api/school-admin/stats',
          schoolId,
          mvError: mvError?.message
        });
        
        // Create authenticated client with RLS for function call (will automatically restrict to school admin's school)
        const supabase = await createAuthenticatedClient(accessToken);
        
        // Use optimized database function (single query, database-side calculations)
        // Direct RPC call reduces overhead compared to multiple queries
        const functionStartTime = Date.now();
        const { data: statsData, error: functionError } = await supabase
          .rpc('get_school_admin_stats', { p_school_id: schoolId } as never);
        const functionDuration = Date.now() - functionStartTime;

        if (!functionError && statsData) {
          // Use function result (optimized - all calculations in database)
          logger.info('School admin stats fetched using database function', {
            endpoint: '/api/school-admin/stats',
            schoolId,
            functionDuration: `${functionDuration}ms`,
            usingOptimizedFunction: true
          });
          return statsData as {
            totalStudents: number;
            totalTeachers: number;
            activeCourses: number;
            pendingReports: number;
            pendingLeaves: number;
            averageAttendance: number;
          };
        }

        // Fallback to individual queries if function doesn't exist
        logger.warn('School admin stats function not available, using fallback queries', {
          endpoint: '/api/school-admin/stats',
          schoolId,
          error: functionError?.message
        });

        // Fetch school-specific statistics using authenticated client with RLS
        // RLS policies will automatically restrict to school admin's school
        // Optimize: Use count queries with minimal data selection
        const [
          studentsResult,
          teachersResult,
          coursesResult,
          reportsResult,
          leavesResult
        ] = await Promise.all([
          supabase
            .from('student_schools')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .eq('is_active', true),
          supabase
            .from('teacher_schools')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId),
          supabase
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .eq('status', 'Published'),
          supabase
            .from('teacher_reports')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .is('approved_by', null),
          supabase
            .from('teacher_leaves')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .eq('status', 'Pending')
        ]);

        // Calculate average attendance from teacher_reports for this school
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: recentReports, error: reportsError } = await supabase
          .from('teacher_reports')
          .select('id, teacher_id, date')
          .eq('school_id', schoolId)
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
          .limit(1000);
        
        let averageAttendance = 0;
        if (!reportsError && recentReports && recentReports.length > 0) {
          const _uniqueTeachers = new Set(recentReports.map((r: { teacher_id?: string }) => r.teacher_id));
          const totalTeachers = teachersResult.count || 0;
          
          if (totalTeachers > 0) {
            const expectedReports = totalTeachers * 20;
            const actualReports = recentReports.length;
            averageAttendance = expectedReports > 0 
              ? Math.min(100, Math.round((actualReports / expectedReports) * 100))
              : 0;
          }
        }

        const result = {
          totalStudents: studentsResult.count || 0,
          totalTeachers: teachersResult.count || 0,
          activeCourses: coursesResult.count || 0,
          pendingReports: reportsResult.count || 0,
          pendingLeaves: leavesResult.count || 0,
          averageAttendance
        };

        logger.info('School admin stats fetched from database', {
          endpoint: '/api/school-admin/stats',
          schoolId,
          stats: result
        });

        return result;
      },
      CacheTTL.SCHOOL_STATS // 10 minutes - longer TTL for stable school stats
    );

    const requestStartTime = Date.now();
    const response = NextResponse.json({ stats });
    
    // Add HTTP caching headers
    addCacheHeaders(response, stats, {
      ...CachePresets.DASHBOARD_STATS,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/school-admin/stats',
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
      endpoint: '/api/school-admin/stats',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify({ stats }).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/school-admin/stats', {
      endpoint: '/api/school-admin/stats',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/stats' },
      'Failed to fetch school admin stats'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
