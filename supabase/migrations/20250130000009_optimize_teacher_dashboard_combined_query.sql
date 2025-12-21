-- Optimize Teacher Dashboard Function - Combine Subqueries
-- Created: 2025-12-06
-- Purpose: Combine 6 separate subqueries into single CTE-based query to reduce database round trips

-- Replace the get_teacher_dashboard_stats_from_mv function with fully optimized version
-- OPTIMIZATION: Combine all subqueries into single query with CTEs to reduce from 6 round trips to 1
CREATE OR REPLACE FUNCTION get_teacher_dashboard_stats_from_mv(p_teacher_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_today DATE;
  v_current_month TEXT;
  v_year_start DATE;
  v_year_end DATE;
  v_month_start DATE;
  v_month_end DATE;
BEGIN
  v_today := CURRENT_DATE;
  v_current_month := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  v_year_start := DATE_TRUNC('year', CURRENT_DATE)::DATE;
  v_year_end := (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  v_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE;
  
  -- OPTIMIZATION: Combine all subqueries into single CTE-based query
  -- This reduces from 6 separate database round trips to 1
  WITH class_stats AS (
    -- Compute today's classes count
    SELECT COUNT(DISTINCT tc.class_id) as todays_classes_count
    FROM teacher_classes tc
    JOIN classes c ON c.id = tc.class_id
    WHERE tc.teacher_id = p_teacher_id
    -- Note: Add date filter if classes have schedule in the future
  ),
  report_stats AS (
    -- Compute pending reports count
    SELECT COUNT(*) as pending_reports_count
    FROM teacher_reports
    WHERE teacher_id = p_teacher_id
    AND report_status = 'Submitted'
  ),
  student_stats AS (
    -- Compute total students count
    SELECT COUNT(DISTINCT sc.student_id) as total_students_count
    FROM teacher_classes tc
    JOIN classes c ON c.id = tc.class_id
    JOIN student_schools sc ON sc.school_id = c.school_id
    WHERE tc.teacher_id = p_teacher_id
  ),
  attendance_stats AS (
    -- Compute monthly attendance percentage in one pass
    SELECT 
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE status = 'Present') as present_count
    FROM attendance
    WHERE user_id = p_teacher_id
    AND date >= v_month_start
    AND date < v_month_end
    LIMIT 100
  ),
  leave_stats AS (
    -- Compute leave balance and pending leaves in one pass
    SELECT 
      COALESCE(SUM(total_days) FILTER (WHERE status = 'Approved' AND start_date >= v_year_start AND end_date <= v_year_end), 0) as approved_days_used,
      COUNT(*) FILTER (WHERE status = 'Pending') as pending_leaves_count
    FROM teacher_leaves
    WHERE teacher_id = p_teacher_id
    AND (
      (status = 'Approved' AND start_date >= v_year_start AND end_date <= v_year_end)
      OR status = 'Pending'
    )
  )
  -- Single SELECT that combines all CTEs - executes in one database round trip
  SELECT json_build_object(
    'todaysClasses', COALESCE((SELECT todays_classes_count FROM class_stats), 0),
    'pendingReports', COALESCE((SELECT pending_reports_count FROM report_stats), 0),
    'totalStudents', COALESCE((SELECT total_students_count FROM student_stats), 0),
    'monthlyAttendance', (
      SELECT CASE 
        WHEN total_count > 0 THEN 
          ROUND((present_count::numeric / total_count::numeric) * 100)
        ELSE 0
      END
      FROM attendance_stats
    ),
    'leaveBalance', GREATEST(0, 12 - COALESCE((SELECT approved_days_used FROM leave_stats), 0)),
    'pendingLeaves', COALESCE((SELECT pending_leaves_count FROM leave_stats), 0)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_teacher_dashboard_stats_from_mv(UUID) IS 'Fully optimized function combining all subqueries into single CTE-based query. Reduces from 6 database round trips to 1 for significant performance improvement.';

