-- Materialized Views for Dashboard Performance
-- Created: 2025-01-30
-- Purpose: Pre-compute aggregations for faster dashboard queries

-- ============================================================================
-- 1. Materialized View for Admin Stats
-- ============================================================================

-- Drop existing materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS mv_admin_stats CASCADE;

-- Create materialized view for admin statistics
CREATE MATERIALIZED VIEW mv_admin_stats AS
SELECT 
  (SELECT COUNT(*) FROM schools) AS total_schools,
  (SELECT COUNT(*) FROM teachers) AS total_teachers,
  (SELECT COUNT(*) FROM profiles WHERE role = 'student') AS total_students,
  (SELECT COUNT(*) FROM courses WHERE status = 'Published' AND is_published = true) AS active_courses,
  (SELECT COUNT(*) FROM teacher_leaves WHERE status = 'Pending') AS pending_leaves,
  NOW() AS last_updated;

-- Create unique index for fast refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_stats_unique ON mv_admin_stats (last_updated);

-- ============================================================================
-- 2. Refresh Function for Materialized Views
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Grant Permissions
-- ============================================================================

GRANT SELECT ON mv_admin_stats TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_dashboard_views() TO authenticated;

-- ============================================================================
-- 4. Create Indexes for Better Function Performance
-- ============================================================================

-- Ensure indexes exist for function queries
CREATE INDEX IF NOT EXISTS idx_student_courses_student_completed 
ON student_courses(student_id, is_completed) 
WHERE is_completed = false;

CREATE INDEX IF NOT EXISTS idx_enrollments_student_active 
ON enrollments(student_id, status, course_id) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_assignments_course_due_published 
ON assignments(course_id, due_date, is_published) 
WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_submissions_student_status 
ON submissions(student_id, status, assignment_id);

CREATE INDEX IF NOT EXISTS idx_attendance_user_month 
ON attendance(user_id, date);

-- ============================================================================
-- 5. Analyze Tables for Better Query Plans
-- ============================================================================

ANALYZE student_courses;
ANALYZE enrollments;
ANALYZE assignments;
ANALYZE submissions;
ANALYZE attendance;
ANALYZE teacher_classes;
ANALYZE teacher_reports;
ANALYZE teacher_leaves;
ANALYZE schools;
ANALYZE teachers;
ANALYZE profiles;
ANALYZE courses;

-- ============================================================================
-- 6. Comments
-- ============================================================================

COMMENT ON MATERIALIZED VIEW mv_admin_stats IS 'Pre-computed admin statistics for faster dashboard queries. Refresh periodically using refresh_dashboard_views().';
COMMENT ON FUNCTION refresh_dashboard_views() IS 'Refreshes all dashboard materialized views. Should be called periodically (e.g., every 5 minutes).';

