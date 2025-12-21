import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger, handleApiError } from '../../../../lib/logger';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';

import { getOrSetCache, CacheTTL } from '../../../../lib/cache';
import { getUserProfile, getAuthenticatedUserId } from '../../../../lib/auth-utils';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  // Skip CSRF token for read-only GET endpoints (minimal overhead, but every ms counts)
  // CSRF protection is only needed for state-changing operations (POST, PUT, DELETE)
  // ensureCsrfToken(request);
  
  // Skip rate limiting for student dashboard (read-only, authenticated, cached endpoint)
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
    // Get authenticated user ID (uses cached token verification)
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a student (use cached getUserProfile to reduce database queries)
    const profile = await getUserProfile(userId);
    if (!profile || profile.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden: Not a student' }, { status: 403 });
    }

    // Cache key for student dashboard stats (user-specific, cache for 5 minutes)
    const cacheKey = `student:dashboard:${userId}`;
    
    // Get dashboard statistics with caching (stale-while-revalidate enabled)
    const stats = await getOrSetCache(
      cacheKey,
      async () => {
        return await getStudentDashboardStats(userId);
      },
      CacheTTL.USER_DASHBOARD, // 5 minutes - optimized for user-specific data
      { staleWhileRevalidate: true } // Serve stale cache while refreshing
    );

    const requestStartTime = Date.now();
    const response = NextResponse.json({ stats }, { status: 200 });
    
    // Add HTTP caching headers
    addCacheHeaders(response, stats, {
      ...CachePresets.USER_DASHBOARD,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/student/dashboard',
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
      endpoint: '/api/student/dashboard',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify({ stats }).length,
      duration: Date.now() - requestStartTime
    });

    return response;
   
  } catch (error: any) {
    logger.error('Unexpected error in GET /api/student/dashboard', {
      endpoint: '/api/student/dashboard',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/student/dashboard' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

async function getStudentDashboardStats(userId: string) {
  const FUNCTION_TIMEOUT_MS = 3000; // 3 second timeout
  
  // Try using optimized function with indexes first (fastest - uses materialized approach)
  // Optimized functions should complete quickly, so we try without timeout first
  const functionStartTime = Date.now();
  let statsData: any = null;
  let functionError: any = null;
  let timedOut = false;
  
  try {
    // Direct call for optimized function (should be fast)
    const result = await supabaseAdmin.rpc('get_student_dashboard_stats_from_mv', { p_student_id: userId });
    statsData = result.data;
    functionError = result.error;
  } catch (error: any) {
    functionError = error;
  }
  
  const functionDuration = Date.now() - functionStartTime;
  
  // Only add timeout for slow functions (> 2 seconds)
  if (functionDuration > 2000 && !statsData && !functionError) {
    // Function is taking too long, add timeout for fallback
    timedOut = true;
    functionError = { message: 'Function taking too long' };
  }
  
  if (!functionError && statsData && !timedOut) {
    logger.debug('Student dashboard stats fetched using optimized function', {
      endpoint: '/api/student/dashboard',
      userId,
      functionDuration: `${functionDuration}ms`,
    });
    return statsData as {
      activeCourses: number;
      pendingAssignments: number;
      attendancePercentage: number;
      averageGrade: number;
      completedAssignments: number;
    };
  }
  
  // Log timeout or error (only in development or if significant)
  if (timedOut) {
    logger.warn('Optimized student function timed out, trying fallback', {
      endpoint: '/api/student/dashboard',
      userId,
      timeout: `${FUNCTION_TIMEOUT_MS}ms`,
    });
  } else if (functionError) {
    logger.debug('Optimized student function not available, trying fallback', {
      endpoint: '/api/student/dashboard',
      userId,
    });
  }
  
  // Fallback to original function if new one doesn't exist or timed out
  const originalFunctionStartTime = Date.now();
  let originalStatsData: any = null;
  let originalFunctionError: any = null;
  let originalTimedOut = false;
  
  try {
    // Use timeout wrapper only for fallback function
    const originalFunctionCall = Promise.resolve(
      supabaseAdmin.rpc('get_student_dashboard_stats', { p_student_id: userId })
    )
      .then(result => ({ ...result, _isTimeout: false }))
      .catch(error => ({ data: null, error, _isTimeout: false }));
    
    const originalTimeoutPromise = new Promise<{ data: null; error: { message: string }; _isTimeout: boolean }>((resolve) => {
      setTimeout(() => {
        resolve({ data: null, error: { message: 'Function call timed out after 3 seconds' }, _isTimeout: true });
      }, FUNCTION_TIMEOUT_MS);
    });
    
    const result = await Promise.race([originalFunctionCall, originalTimeoutPromise]);
    if (result._isTimeout) {
      originalTimedOut = true;
      originalFunctionError = { message: 'Timeout' };
    } else {
      originalStatsData = result.data;
      originalFunctionError = result.error;
    }
  } catch (error: any) {
    originalFunctionError = error;
  }
  
  const originalFunctionDuration = Date.now() - originalFunctionStartTime;
  
  if (!originalFunctionError && originalStatsData && !originalTimedOut) {
    logger.debug('Student dashboard stats fetched using original function', {
      endpoint: '/api/student/dashboard',
      userId,
      functionDuration: `${originalFunctionDuration}ms`,
    });
    return originalStatsData as {
      activeCourses: number;
      pendingAssignments: number;
      attendancePercentage: number;
      averageGrade: number;
      completedAssignments: number;
    };
  }
  
  // Fallback to individual queries if both functions fail
  const fallbackStartTime = Date.now();
  if (originalTimedOut || originalFunctionError) {
    logger.debug('Using fallback queries for student dashboard', {
      endpoint: '/api/student/dashboard',
      userId,
    });
  }

  // Calculate start of month for attendance query
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthISO = startOfMonth.toISOString().split('T')[0];

  // Parallelize all independent queries with optimized selects
  const [
    { data: studentCourses, error: studentCoursesError },
    { data: enrollments, error: enrollmentsError },
    { data: attendance, error: attendanceError },
    { data: gradedSubmissions, error: gradedSubmissionsError }
  ] = await Promise.all([
    // Use index-friendly query with limit
    supabaseAdmin
      .from('student_courses')
      .select('course_id')
      .eq('student_id', userId)
      .eq('is_completed', false)
      .limit(100),
    // Use index-friendly query with status filter and limit
    supabaseAdmin
      .from('enrollments')
      .select('course_id')
      .eq('student_id', userId)
      .eq('status', 'active')
      .limit(100),
    // Optimize attendance query - only select what we need, limit results
    supabaseAdmin
      .from('attendance')
      .select('status')
      .eq('user_id', userId)
      .gte('date', startOfMonthISO)
      .limit(100),
    // Optimize submissions query - limit results
    supabaseAdmin
      .from('submissions')
      .select('grade')
      .eq('student_id', userId)
      .not('grade', 'is', null)
      .limit(100)
  ]);

  // Log errors (non-critical)
  if (studentCoursesError) {
    logger.warn('Error fetching student_courses (non-critical)', {
      endpoint: '/api/student/dashboard',
      userId,
    }, studentCoursesError);
  }

  if (enrollmentsError) {
    logger.warn('Error fetching enrollments (non-critical)', {
      endpoint: '/api/student/dashboard',
      userId,
    }, enrollmentsError);
  }

  if (attendanceError) {
    console.error('Error fetching attendance:', attendanceError);
  }

  if (gradedSubmissionsError) {
    console.error('Error fetching graded submissions:', gradedSubmissionsError);
  }

  // Combine course IDs from both tables
  const courseIds = new Set<string>();
  studentCourses?.forEach(sc => {
    if (sc.course_id) courseIds.add(sc.course_id);
  });
  enrollments?.forEach(e => {
    if (e.course_id) courseIds.add(e.course_id);
  });

  const activeCoursesCount = courseIds.size || 0;

  // Get pending assignments and submissions in parallel (only if we have courses)
  let pendingAssignments: any[] = [];
  let allSubmissions: any[] = [];
  
  if (courseIds.size > 0) {
    const [
      { data: assignments, error: assignmentsError },
      { data: submissions, error: submissionsError }
    ] = await Promise.all([
      // Optimize: Use index-friendly query with proper ordering
      supabaseAdmin
        .from('assignments')
        .select('id, due_date, course_id')
        .in('course_id', Array.from(courseIds))
        .gte('due_date', new Date().toISOString())
        .eq('is_published', true)
        .order('due_date', { ascending: true })
        .limit(100), // Add limit for safety
      // Optimize: Only select what we need
      supabaseAdmin
        .from('submissions')
        .select('assignment_id')
        .eq('student_id', userId)
        .eq('status', 'submitted')
        .limit(100) // Add limit for safety
    ]);

    if (assignmentsError) {
      logger.warn('Error fetching assignments (non-critical)', {
        endpoint: '/api/student/dashboard',
        userId,
      }, assignmentsError);
    }

    if (submissionsError) {
      console.error('Error fetching submissions:', submissionsError);
    }

    allSubmissions = submissions || [];
    const submittedIds = new Set(allSubmissions.map((s: any) => s.assignment_id));
    pendingAssignments = assignments?.filter((a: any) => !submittedIds.has(a.id)) || [];
  }

  // Calculate attendance stats
  const presentCount = attendance?.filter((a: any) => a.status === 'Present').length || 0;
  const totalCount = attendance?.length || 0;

  // Calculate average grade
  const avgGrade = gradedSubmissions && gradedSubmissions.length > 0
    ? gradedSubmissions.reduce((sum: number, s: any) => sum + (s.grade || 0), 0) / gradedSubmissions.length
    : 0;

  const fallbackDuration = Date.now() - fallbackStartTime;
  
  logger.debug('Student dashboard stats fetched using fallback queries', {
    endpoint: '/api/student/dashboard',
    userId,
    fallbackDuration: `${fallbackDuration}ms`,
  });
  
  return {
    activeCourses: activeCoursesCount,
    pendingAssignments: pendingAssignments.length,
    attendancePercentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
    averageGrade: Math.round(avgGrade),
    completedAssignments: allSubmissions.length
  };
}
