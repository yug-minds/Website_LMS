-- Create materialized view for admin analytics
-- This pre-computes expensive aggregations for faster analytics queries

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_admin_analytics AS
WITH current_counts AS (
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM schools WHERE is_active = true) as total_schools,
    (SELECT COUNT(*)::INTEGER FROM profiles WHERE role = 'teacher') as total_teachers,
    (SELECT COUNT(*)::INTEGER FROM profiles WHERE role = 'student') as total_students,
    (SELECT COUNT(*)::INTEGER FROM courses WHERE status = 'Published') as active_courses,
    (SELECT COUNT(*)::INTEGER FROM teacher_reports) as total_reports,
    (SELECT COUNT(*)::INTEGER FROM teacher_leaves WHERE status = 'Pending') as pending_leaves
),
last_month_counts AS (
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM schools WHERE is_active = true AND created_at <= (CURRENT_DATE - INTERVAL '1 month')) as schools_last_month,
    (SELECT COUNT(*)::INTEGER FROM profiles WHERE role = 'teacher' AND created_at <= (CURRENT_DATE - INTERVAL '1 month')) as teachers_last_month,
    (SELECT COUNT(*)::INTEGER FROM profiles WHERE role = 'student' AND created_at <= (CURRENT_DATE - INTERVAL '1 month')) as students_last_month,
    (SELECT COUNT(*)::INTEGER FROM courses WHERE status = 'Published' AND created_at <= (CURRENT_DATE - INTERVAL '1 month')) as courses_last_month
),
completion_data AS (
  SELECT 
    COALESCE(AVG(progress_percentage), 0)::INTEGER as avg_completion_rate,
    COUNT(*)::INTEGER as total_enrollments
  FROM student_courses
  WHERE is_completed = false
)
SELECT 
  cc.total_schools,
  cc.total_teachers,
  cc.total_students,
  cc.active_courses,
  cc.total_reports,
  cc.pending_leaves,
  lmc.schools_last_month,
  lmc.teachers_last_month,
  lmc.students_last_month,
  lmc.courses_last_month,
  cd.avg_completion_rate,
  cd.total_enrollments,
  CASE 
    WHEN cc.total_teachers > 0 THEN LEAST(100, GREATEST(0, ROUND((cc.total_reports::NUMERIC / (cc.total_teachers * 20)) * 100)::INTEGER))
    ELSE 0
  END as avg_attendance,
  CURRENT_TIMESTAMP as last_updated
FROM current_counts cc
CROSS JOIN last_month_counts lmc
CROSS JOIN completion_data cd;

-- Create unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_analytics_unique ON mv_admin_analytics (last_updated);

-- Create index on last_updated for refresh tracking
CREATE INDEX IF NOT EXISTS idx_mv_admin_analytics_updated ON mv_admin_analytics (last_updated);

-- Grant permissions
GRANT SELECT ON mv_admin_analytics TO authenticated;

-- Create function to refresh admin analytics materialized view
CREATE OR REPLACE FUNCTION refresh_admin_analytics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_analytics;
END;
$$;

-- Add refresh to existing refresh_dashboard_views function
-- Drop existing function first since we're changing the return type
DROP FUNCTION IF EXISTS refresh_dashboard_views(BOOLEAN);

CREATE OR REPLACE FUNCTION refresh_dashboard_views(p_incremental BOOLEAN DEFAULT FALSE)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_incremental THEN
    -- Incremental refresh for school admin stats only
    PERFORM refresh_school_admin_stats_incrementally();
  ELSE
    -- Full refresh for all materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_school_admin_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_analytics;
  END IF;
END;
$$;

-- Initial refresh
REFRESH MATERIALIZED VIEW mv_admin_analytics;

-- Add comment
COMMENT ON MATERIALIZED VIEW mv_admin_analytics IS 'Pre-computed admin analytics metrics for fast dashboard queries';

