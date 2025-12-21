/**
 * Cache Warming Utilities
 * Pre-populates cache with frequently accessed data
 */

import { getOrSetCache, setCache, getCache, CacheTTL } from './cache';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { isRedisAvailable } from './redis-client';
import { RefreshConfig } from './cache-config';

/**
 * Warm cache for admin stats
 * Ensures cache is populated in Redis for fast first requests
 */
export async function warmAdminStatsCache(): Promise<void> {
  try {
    const cacheKey = 'admin:stats:global';
    const startTime = Date.now();
    
    // Check if already cached (don't overwrite if fresh)
    const existing = await getCache(cacheKey);
    if (existing) {
      logger.info('Admin stats cache already warm', {
        cacheKey,
        duration: `${Date.now() - startTime}ms`
      });
      return;
    }
    
    // Fetch from materialized view
    const { data: mvData, error: mvError } = await supabaseAdmin
      .from('mv_admin_stats')
      .select('*')
      .order('last_updated', { ascending: false })
      .limit(1)
      .single();

    if (mvError || !mvData) {
      logger.warn('Failed to fetch materialized view for cache warming', {
        cacheKey,
        error: mvError?.message
      });
      return;
    }

    const statsData = {
      totalSchools: mvData.total_schools || 0,
      totalTeachers: mvData.total_teachers || 0,
      totalStudents: mvData.total_students || 0,
      activeCourses: mvData.active_courses || 0,
      pendingLeaves: mvData.pending_leaves || 0
    };

    // Set cache directly (ensures it's stored in Redis)
    await setCache(cacheKey, statsData, CacheTTL.DASHBOARD_STATS);
    
    // Verify cache was set (especially important for Redis)
    const verifyStart = Date.now();
    const verified = await getCache(cacheKey);
    const verifyDuration = Date.now() - verifyStart;
    
    if (verified) {
      const duration = Date.now() - startTime;
      logger.info('Admin stats cache warmed successfully', {
        cacheKey,
        duration: `${duration}ms`,
        verifyDuration: `${verifyDuration}ms`,
        redisAvailable: isRedisAvailable(),
        stats: {
          totalSchools: statsData.totalSchools,
          totalTeachers: statsData.totalTeachers,
          totalStudents: statsData.totalStudents
        }
      });
    } else {
      logger.warn('Admin stats cache warming failed - cache not verified', {
        cacheKey,
        duration: `${Date.now() - startTime}ms`,
        redisAvailable: isRedisAvailable()
      });
    }
  } catch (error) {
    logger.warn('Failed to warm admin stats cache', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Warm cache for school admin stats (if school IDs are available)
 */
export async function warmSchoolAdminStatsCache(schoolIds: string[]): Promise<void> {
  try {
    if (!schoolIds || schoolIds.length === 0) {
      return;
    }

    const startTime = Date.now();
    logger.info('Warming school admin stats cache', {
      schoolCount: schoolIds.length,
      redisAvailable: isRedisAvailable()
    });

    // Warm cache for each school (in parallel, but limit concurrency)
    const BATCH_SIZE = 5;
    for (let i = 0; i < schoolIds.length; i += BATCH_SIZE) {
      const batch = schoolIds.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (schoolId) => {
          const cacheKey = `school-admin:stats:${schoolId || 'undefined'}`;
          // Check if already cached
          const existing = await getCache(cacheKey);
          if (existing) {
            return; // Already warm
          }
          
          // Call the function to populate cache
          try {
            const { data: statsData, error: functionError } = await supabaseAdmin
              .rpc('get_school_admin_stats', { p_school_id: schoolId || undefined });
            
            if (!functionError && statsData) {
              await setCache(cacheKey, statsData, CacheTTL.SCHOOL_STATS);
              logger.info(`Warmed school admin stats cache for school ${schoolId || 'undefined'}`);
            }
          } catch (error) {
            // Silently fail - cache will be populated on first request
          }
        })
      );
    }

    const duration = Date.now() - startTime;
    logger.info('School admin stats cache warming completed', {
      duration: `${duration}ms`,
      schoolCount: schoolIds.length
    });
  } catch (error) {
    logger.warn('Failed to warm school admin stats cache', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Warm cache for active school admins
 * Pre-populates cache for recently active school admins to improve first-request performance
 */
export async function warmActiveSchoolAdminDashboards(): Promise<void> {
  try {
    const startTime = Date.now();
    const MAX_SCHOOLS_TO_WARM = 10; // Limit to avoid excessive database load
    
    logger.info('Warming active school admin dashboard caches', {
      maxSchools: MAX_SCHOOLS_TO_WARM,
      redisAvailable: isRedisAvailable()
    });
    
    // Get recently active schools (limit to avoid excessive load)
    // We'll get schools that have recent activity (via school_admins with recent activity)
    const { data: activeSchoolAdmins, error: schoolAdminsError } = await supabaseAdmin
      .from('school_admins')
      .select('school_id')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(MAX_SCHOOLS_TO_WARM);
    
    if (schoolAdminsError) {
      logger.warn('Failed to fetch active school admins for cache warming', {
        error: schoolAdminsError.message
      });
      return;
    }
    
    // Extract unique school IDs
    const schoolIds = [...new Set((activeSchoolAdmins || [])
      .map((sa: any) => sa.school_id)
      .filter((id: any): id is string => id !== null))];
    
    if (schoolIds.length === 0) {
      logger.info('No active schools found for cache warming');
      return;
    }
    
    // Warm cache for each school (in parallel, but limit concurrency)
    const BATCH_SIZE = 3; // Limit concurrency to avoid overwhelming database
    for (let i = 0; i < schoolIds.length; i += BATCH_SIZE) {
      const batch = schoolIds.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (schoolId) => {
          const cacheKey = `school-admin:stats:${schoolId || 'undefined'}`;
          // Check if already cached
          const existing = await getCache(cacheKey);
          if (existing) {
            return; // Already warm
          }
          
          // Call the function to populate cache
          try {
            const { data: statsData, error: functionError } = await supabaseAdmin
              .rpc('get_school_admin_stats', { p_school_id: schoolId || undefined });
            
            if (!functionError && statsData) {
              await setCache(cacheKey, statsData, CacheTTL.SCHOOL_STATS);
              logger.info(`Warmed school admin dashboard cache for school ${schoolId || 'undefined'}`);
            }
          } catch (error) {
            // Silently fail - cache will be populated on first request
          }
        })
      );
    }
    
    const duration = Date.now() - startTime;
    logger.info('Active school admin dashboard cache warming completed', {
      duration: `${duration}ms`,
      schoolsWarmed: schoolIds.length
    });
  } catch (error) {
    logger.warn('Failed to warm active school admin dashboards', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Warm cache for active student and teacher dashboards
 * Pre-populates cache for recently active users to improve first-request performance
 */
export async function warmActiveUserDashboards(): Promise<void> {
  try {
    const startTime = Date.now();
    const MAX_USERS_TO_WARM = 10; // Limit to avoid excessive database load
    
    logger.info('Warming active user dashboard caches', {
      maxUsers: MAX_USERS_TO_WARM,
      redisAvailable: isRedisAvailable()
    });
    
    // Get recently active students (limit to avoid excessive load)
    const { data: activeStudents, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .order('updated_at', { ascending: false })
      .limit(MAX_USERS_TO_WARM);
    
    // Get recently active teachers
    const { data: activeTeachers, error: teachersError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'teacher')
      .order('updated_at', { ascending: false })
      .limit(MAX_USERS_TO_WARM);
    
    if (studentsError) {
      logger.warn('Failed to fetch active students for cache warming', {
        error: studentsError.message
      });
    }
    
    if (teachersError) {
      logger.warn('Failed to fetch active teachers for cache warming', {
        error: teachersError.message
      });
    }
    
    // Warm student dashboard caches in parallel (limited concurrency)
    const studentIds = activeStudents?.map((p: any) => p.id) || [];
    const BATCH_SIZE = 3; // Limit concurrency to avoid overwhelming database
    
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const batch = studentIds.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (studentId: string) => {
          const cacheKey = `student:dashboard:${studentId}`;
          // Check if already cached
          const existing = await getCache(cacheKey);
          if (existing) {
            return; // Already warm
          }
          
          // Call the function to populate cache
          try {
            const { data: statsData, error: functionError } = await supabaseAdmin
              .rpc('get_student_dashboard_stats_from_mv', { p_student_id: studentId });
            
            if (!functionError && statsData) {
              await setCache(cacheKey, statsData, CacheTTL.USER_DASHBOARD);
            }
          } catch (error) {
            // Silently fail - cache will be populated on first request
          }
        })
      );
    }
    
    // Warm teacher dashboard caches in parallel (limited concurrency)
    const teacherIds = activeTeachers?.map((p: any) => p.id) || [];
    
    for (let i = 0; i < teacherIds.length; i += BATCH_SIZE) {
      const batch = teacherIds.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (teacherId: string) => {
          const cacheKey = `teacher:dashboard:${teacherId}`;
          // Check if already cached
          const existing = await getCache(cacheKey);
          if (existing) {
            return; // Already warm
          }
          
          // Call the function to populate cache
          try {
            const { data: statsData, error: functionError } = await supabaseAdmin
              .rpc('get_teacher_dashboard_stats_from_mv', { p_teacher_id: teacherId });
            
            if (!functionError && statsData) {
              // Note: Teacher dashboard also needs classes and reports, but stats are the main bottleneck
              await setCache(cacheKey, { stats: statsData }, CacheTTL.USER_DASHBOARD);
            }
          } catch (error) {
            // Silently fail - cache will be populated on first request
          }
        })
      );
    }
    
    const duration = Date.now() - startTime;
    logger.info('Active user dashboard cache warming completed', {
      duration: `${duration}ms`,
      studentsWarmed: studentIds.length,
      teachersWarmed: teacherIds.length,
      redisAvailable: isRedisAvailable()
    });
  } catch (error) {
    logger.warn('Failed to warm active user dashboards', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Warm cache for all dashboard stats
 * Pre-populates cache with materialized view data for instant first requests
 * Ensures Redis is populated for serverless environments
 * OPTIMIZATION: Now includes active user dashboards and school admins for better first-request performance
 */
export async function warmAllDashboardCaches(): Promise<void> {
  try {
    const startTime = Date.now();
    
    logger.info('Starting cache warming', {
      redisAvailable: isRedisAvailable()
    });
    
    // Warm admin stats cache (most critical - used by all admins)
    await warmAdminStatsCache();
    
    // OPTIMIZATION: Warm cache for active students and teachers
    // This improves first-request performance for recently active users
    // Limited to 10 users per role to avoid excessive database load
    await warmActiveUserDashboards();
    
    // OPTIMIZATION: Warm cache for active school admins
    // This improves first-request performance for recently active school admins
    // Limited to 10 schools to avoid excessive database load
    await warmActiveSchoolAdminDashboards();
    
    const duration = Date.now() - startTime;
    logger.info('Cache warming completed', {
      duration: `${duration}ms`,
      redisAvailable: isRedisAvailable()
    });
  } catch (error) {
    logger.warn('Failed to warm all dashboard caches', {
      error: error instanceof Error ? error.message : String(error),
      redisAvailable: isRedisAvailable()
    });
  }
}

