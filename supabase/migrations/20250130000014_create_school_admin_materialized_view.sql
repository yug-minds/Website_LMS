-- ============================================================================
-- Materialized View for School Admin Stats
-- Created: 2025-12-07
-- Purpose: Pre-compute school-specific statistics for faster dashboard queries
-- ============================================================================

-- Drop existing materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS mv_school_admin_stats CASCADE;

-- Create materialized view for school admin statistics (one row per school)
-- This pre-computes stats for all schools, allowing instant lookups
CREATE MATERIALIZED VIEW mv_school_admin_stats AS
WITH school_stats AS (
  SELECT 
    s.id as school_id,
    -- Student count (active only)
    (SELECT COUNT(*) 
     FROM student_schools ss 
     WHERE ss.school_id = s.id AND ss.is_active = true) as total_students,
    -- Teacher count
    (SELECT COUNT(*) 
     FROM teacher_schools ts 
     WHERE ts.school_id = s.id) as total_teachers,
    -- Active courses count
    (SELECT COUNT(*) 
     FROM courses c 
     WHERE c.school_id = s.id AND c.status = 'Published') as active_courses,
    -- Pending reports count
    (SELECT COUNT(*) 
     FROM teacher_reports tr 
     WHERE tr.school_id = s.id AND tr.approved_by IS NULL) as pending_reports,
    -- Pending leaves count
    (SELECT COUNT(*) 
     FROM teacher_leaves tl 
     WHERE tl.school_id = s.id AND tl.status = 'Pending') as pending_leaves,
    -- Average attendance (30-day calculation)
    (SELECT CASE 
       WHEN COUNT(DISTINCT tr.teacher_id) FILTER (WHERE tr.date >= CURRENT_DATE - INTERVAL '30 days') > 0 THEN
         LEAST(100, ROUND((
           COUNT(*) FILTER (WHERE tr.date >= CURRENT_DATE - INTERVAL '30 days')::numeric / 
           (COUNT(DISTINCT tr.teacher_id) FILTER (WHERE tr.date >= CURRENT_DATE - INTERVAL '30 days') * 20::numeric)
         ) * 100))
       ELSE 0
     END
     FROM teacher_reports tr
     WHERE tr.school_id = s.id) as average_attendance,
    NOW() as last_updated
  FROM schools s
)
SELECT * FROM school_stats;

-- Create unique index on school_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_school_admin_stats_school_id 
ON mv_school_admin_stats(school_id);

-- Create index on last_updated for refresh tracking
CREATE INDEX IF NOT EXISTS idx_mv_school_admin_stats_updated 
ON mv_school_admin_stats(last_updated);

-- ============================================================================
-- Update Refresh Function to Include School Admin Stats
-- ============================================================================

-- Update the refresh function to include school admin stats
CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void AS $$
BEGIN
  -- Refresh admin stats materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_stats;
  
  -- Refresh school admin stats materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_school_admin_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT SELECT ON mv_school_admin_stats TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_dashboard_views() TO authenticated;

-- ============================================================================
-- Initial Refresh
-- ============================================================================

-- Perform initial refresh to populate the view
REFRESH MATERIALIZED VIEW mv_school_admin_stats;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON MATERIALIZED VIEW mv_school_admin_stats IS 'Pre-computed school-specific statistics for faster school admin dashboard queries. One row per school. Refresh periodically using refresh_dashboard_views().';
COMMENT ON INDEX idx_mv_school_admin_stats_school_id IS 'Unique index on school_id for fast lookups by school';
COMMENT ON INDEX idx_mv_school_admin_stats_updated IS 'Index on last_updated for refresh tracking';

