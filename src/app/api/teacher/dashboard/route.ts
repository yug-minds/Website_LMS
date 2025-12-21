import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTeacherUserId } from '../../../../lib/teacher-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';

import { getOrSetCache, CacheTTL } from '../../../../lib/cache';
import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

export async function GET(request: NextRequest) {
  // Skip CSRF token for read-only GET endpoints (minimal overhead, but every ms counts)
  // CSRF protection is only needed for state-changing operations (POST, PUT, DELETE)
  // ensureCsrfToken(request);
  
  // Skip rate limiting for teacher dashboard (read-only, authenticated, cached endpoint)
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
    // Get the authenticated teacher's user ID (secure)
    const teacherId = await getTeacherUserId(request);
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Unauthorized: Teacher access required', details: 'Unable to determine teacher_id from auth token' },
        { status: 401 }
      );
    }

    // Cache key for teacher dashboard stats (user-specific, cache for 5 minutes)
    const cacheKey = `teacher:dashboard:${teacherId}`;
    
    // Get dashboard statistics with caching
    const dashboardData = await getOrSetCache(
      cacheKey,
      async () => {
        const FUNCTION_TIMEOUT_MS = 3000; // 3 second timeout
        
        // Try using optimized function with indexes first (fastest - uses materialized approach)
        const functionStartTime = Date.now();
        
        // Wrap RPC call with timeout using Promise.race
        const optimizedFunctionCall = supabaseAdmin
          .rpc('get_teacher_dashboard_stats_from_mv', { p_teacher_id: teacherId })
          .then((result: any) => ({ ...result, _isTimeout: false }))
          .catch((error: any) => ({ data: null, error, _isTimeout: false }));
        
        const timeoutPromise = new Promise<{ data: null; error: { message: string }; _isTimeout: boolean }>((resolve) => {
          setTimeout(() => {
            resolve({ data: null, error: { message: 'Function call timed out after 3 seconds' }, _isTimeout: true });
          }, FUNCTION_TIMEOUT_MS);
        });
        
        let statsData: any = null;
        let functionError: any = null;
        let timedOut = false;
        
        try {
          const result = await Promise.race([optimizedFunctionCall, timeoutPromise]);
          if (result._isTimeout) {
            timedOut = true;
            functionError = { message: 'Timeout' };
          } else {
            statsData = result.data;
            functionError = result.error;
          }
        } catch (error: any) {
          functionError = error;
        }
        
        const functionDuration = Date.now() - functionStartTime;
        
        if (!functionError && statsData && !timedOut) {
          // Use optimized function result (now includes stats, classes, and reports)
          const result = statsData as {
            stats: {
              todaysClasses: number;
              pendingReports: number;
              totalStudents: number;
              monthlyAttendance: number;
              leaveBalance: number;
              pendingLeaves: number;
            };
            todaysClasses: any[];
            recentReports: any[];
          };

          logger.debug('Teacher dashboard stats fetched using optimized function', {
            endpoint: '/api/teacher/dashboard',
            teacherId,
            functionDuration: `${functionDuration}ms`,
          });

          // Function now returns everything - no additional queries needed!
          return {
            stats: result.stats,
            todaysClasses: result.todaysClasses || [],
            recentReports: result.recentReports || []
          };
        }
        
        // Log timeout or error (only in development or if significant)
        if (timedOut) {
          logger.warn('Optimized teacher function timed out, trying fallback', {
            endpoint: '/api/teacher/dashboard',
            teacherId,
            timeout: `${FUNCTION_TIMEOUT_MS}ms`,
          });
        } else if (functionError) {
          logger.debug('Optimized teacher function not available, trying fallback', {
            endpoint: '/api/teacher/dashboard',
            teacherId,
          });
        }
        
        // Fallback to original function if new one doesn't exist or timed out
        const originalFunctionStartTime = Date.now();
        
        const originalFunctionCall = supabaseAdmin
          .rpc('get_teacher_dashboard_stats', { p_teacher_id: teacherId })
          .then((result: any) => ({ ...result, _isTimeout: false }))
          .catch((error: any) => ({ data: null, error, _isTimeout: false }));
        
        const originalTimeoutPromise = new Promise<{ data: null; error: { message: string }; _isTimeout: boolean }>((resolve) => {
          setTimeout(() => {
            resolve({ data: null, error: { message: 'Function call timed out after 3 seconds' }, _isTimeout: true });
          }, FUNCTION_TIMEOUT_MS);
        });
        
        let originalStatsData: any = null;
        let originalFunctionError: any = null;
        let originalTimedOut = false;
        
        try {
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
          // Use original function result for stats (may not include classes/reports)
          const stats = originalStatsData as {
            todaysClasses: number;
            pendingReports: number;
            totalStudents: number;
            monthlyAttendance: number;
            leaveBalance: number;
            pendingLeaves: number;
          };

          // Original function doesn't include classes/reports, so fetch them
          const [
            { data: classesData },
            { data: reportsData }
          ] = await Promise.all([
            supabaseAdmin
              .from('teacher_classes')
              .select('class_id')
              .eq('teacher_id', teacherId)
              .limit(50),
            supabaseAdmin
              .from('teacher_reports')
              .select('id, date, class_name, grade, topics_taught, report_status, created_at')
              .eq('teacher_id', teacherId)
              .order('created_at', { ascending: false })
              .limit(5)
          ]);

          // Fetch class details if needed
          const classIds = classesData?.map((tc: any) => tc.class_id).filter(Boolean) || [];
          let classes: any[] = [];
          
          if (classIds.length > 0) {
            const { data: classDetails } = await supabaseAdmin
              .from('classes')
              .select('id, class_name, grade, subject, max_students')
              .in('id', classIds)
              .limit(50);
            
            classes = (classDetails || []).map((classData: any) => ({
              id: classData.id || '',
              grade: classData.grade || '',
              subject: classData.subject || '',
              max_students: classData.max_students || 0,
              class_name: classData.class_name || '',
              student_count: 0
            }));
          }

          logger.debug('Teacher dashboard stats fetched using original function', {
            endpoint: '/api/teacher/dashboard',
            teacherId,
            functionDuration: `${originalFunctionDuration}ms`,
          });

          return {
            stats,
            todaysClasses: classes,
            recentReports: (reportsData as any) || []
          };
        }

        // Fallback to individual queries if both functions fail
        if (originalTimedOut || originalFunctionError) {
          logger.debug('Using fallback queries for teacher dashboard', {
            endpoint: '/api/teacher/dashboard',
            teacherId,
          });
        }

        // Get today's date and current month/year for queries
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().substring(0, 7);
        const currentYear = new Date().getFullYear();
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;
        
        // Parallelize all independent queries
        const [
          { data: classesData, error: classesError },
          { data: reportsData, error: reportsError },
          { data: attendanceData, error: attendanceError },
          { data: leavesData, error: leavesError },
          { data: approvedLeaves, error: approvedLeavesError }
        ] = await Promise.all([
          supabaseAdmin
            .from('teacher_classes')
            .select('class_id')
            .eq('teacher_id', teacherId)
            .limit(50),
          supabaseAdmin
            .from('teacher_reports')
            .select('id, date, class_name, grade, topics_taught, report_status, created_at')
            .eq('teacher_id', teacherId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabaseAdmin
            .from('teacher_monthly_attendance')
            .select('id, teacher_id, month, days_present, days_absent, days_leave, total_days')
            .eq('teacher_id', teacherId)
            .eq('month', currentMonth + '-01'),
          supabaseAdmin
            .from('teacher_leaves')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .eq('status', 'Pending'),
          supabaseAdmin
            .from('teacher_leaves')
            .select('total_days')
            .eq('teacher_id', teacherId)
            .eq('status', 'Approved')
            .gte('start_date', yearStart)
            .lte('end_date', yearEnd)
            .order('start_date', { ascending: false })
        ]);

        // Process data - fetch class details separately if needed (optimized)
        const classIds = classesData?.map((tc: any) => tc.class_id).filter(Boolean) || [];
        let classes: any[] = [];
        
        if (classIds.length > 0) {
          const { data: classDetails } = await supabaseAdmin
            .from('classes')
            .select('id, class_name, grade, subject, max_students')
            .in('id', classIds)
            .limit(50);
          
          classes = (classDetails || []).map((classData: any) => ({
            id: classData.id || '',
            grade: classData.grade || '',
            subject: classData.subject || '',
            max_students: classData.max_students || 0,
            class_name: classData.class_name || '',
            student_count: 0
          }));
        }

        const reports = (reportsData as any) || [];
        const pendingReports = reports.filter((r: any) => r.report_status === 'Submitted').length;

        let monthlyAttendance = 0;
        if (!attendanceError && attendanceData && attendanceData.length > 0) {
          const attendance = (attendanceData as any)[0];
          monthlyAttendance = attendance.total_days > 0 
            ? Math.round((attendance.present_count / attendance.total_days) * 100)
            : 0;
        }

        const pendingLeaves = leavesData?.length || 0;

        let leaveBalance = 0;
        if (!approvedLeavesError && approvedLeaves) {
          const totalDaysUsed = approvedLeaves.reduce((sum: number, leave: any) => sum + (leave.total_days || 0), 0);
          const standardLeaveBalance = 12;
          leaveBalance = Math.max(0, standardLeaveBalance - totalDaysUsed);
        }

        const dashboardData = {
          stats: {
            todaysClasses: classes.length,
            pendingReports,
            totalStudents: classes.reduce((sum: number, c: any) => sum + c.student_count, 0),
            monthlyAttendance,
            leaveBalance,
            pendingLeaves
          },
          todaysClasses: classes,
          recentReports: reports
        };

        logger.debug('Teacher dashboard stats fetched from database', {
          endpoint: '/api/teacher/dashboard',
          teacherId,
        });

        return dashboardData;
      },
      CacheTTL.USER_DASHBOARD, // 5 minutes - optimized for user-specific data
      { staleWhileRevalidate: true } // Serve stale cache while refreshing
    );

    const requestStartTime = Date.now();
    const response = NextResponse.json(dashboardData);
    
    // Add HTTP caching headers
    addCacheHeaders(response, dashboardData, {
      ...CachePresets.USER_DASHBOARD,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/teacher/dashboard',
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
      endpoint: '/api/teacher/dashboard',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(dashboardData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/teacher/dashboard', {
      endpoint: '/api/teacher/dashboard',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/teacher/dashboard' },
      'Failed to fetch teacher dashboard'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
