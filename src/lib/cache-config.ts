/**
 * Cache Configuration Utilities
 * 
 * Defines caching strategies for course data
 */

export const CACHE_CONFIG = {
  // Course data - relatively stable, can cache longer
  course: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  },
  // Chapter content - may update more frequently
  chapterContent: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
  },
  // Progress data - updates frequently, shorter cache
  progress: {
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
  },
  // Materials - relatively stable
  materials: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  },
  // Assignments - may update when new assignments are added
  assignments: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
  },
} as const;

/**
 * Get cache configuration for a specific data type
 */
export function getCacheConfig(type: keyof typeof CACHE_CONFIG) {
  return CACHE_CONFIG[type];
}

// Legacy exports for backward compatibility with monitoring dashboard
export const CacheConfig = {
  DASHBOARD_STATS_TTL: 10 * 60 * 1000, // 10 minutes
  USER_DASHBOARD_TTL: 5 * 60 * 1000,   // 5 minutes
  SCHOOL_STATS_TTL: 10 * 60 * 1000,    // 10 minutes
  ADMIN_STATS_TTL: 10 * 60 * 1000,     // 10 minutes
} as const;

export const RefreshConfig = {
  INCREMENTAL_REFRESH_INTERVAL: 5 * 60 * 1000,  // 5 minutes
  FULL_REFRESH_INTERVAL: 30 * 60 * 1000,       // 30 minutes
  FULL_REFRESH_TIME: '02:00',                   // 2 AM
  MAX_SCHOOLS_PER_REFRESH: 10,
  CACHE_WARMING_INTERVAL: 15 * 60 * 1000,      // 15 minutes
} as const;
