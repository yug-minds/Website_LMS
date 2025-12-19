-- Fix Teacher Dashboard Stats Function
-- Created: 2025-12-06
-- Purpose: Fix monthly attendance calculation in get_teacher_dashboard_stats_from_mv

-- Fix the monthly attendance calculation to use the attendance table directly
-- instead of trying to use fields that don't exist
CREATE OR REPLACE FUNCTION get_teacher_dashboard_stats_from_mv(p_teacher_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_today DATE;
  v_current_month TEXT;
  v_year_start DATE;
  v_year_end DATE;
BEGIN
  v_today := CURRENT_DATE;
  v_current_month := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  v_year_start := DATE_TRUNC('year', CURRENT_DATE)::DATE;
  v_year_end := (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  
  SELECT json_build_object(
    'todaysClasses', (
      SELECT COUNT(DISTINCT tc.class_id)
      FROM teacher_classes tc
      JOIN classes c ON c.id = tc.class_id
      WHERE tc.teacher_id = p_teacher_id
      -- Add date filter if classes have schedule
    ),
    'pendingReports', (
      SELECT COUNT(*)
      FROM teacher_reports
      WHERE teacher_id = p_teacher_id
      AND report_status = 'Submitted'
    ),
    'totalStudents', (
      SELECT COUNT(DISTINCT sc.student_id)
      FROM teacher_classes tc
      JOIN classes c ON c.id = tc.class_id
      JOIN student_schools sc ON sc.school_id = c.school_id
      WHERE tc.teacher_id = p_teacher_id
    ),
    'monthlyAttendance', (
      SELECT CASE 
        WHEN COUNT(*) > 0 THEN 
          ROUND((COUNT(*) FILTER (WHERE status = 'Present')::numeric / COUNT(*)::numeric) * 100)
        ELSE 0
      END
      FROM attendance
      WHERE user_id = p_teacher_id
      AND date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
      AND date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE
      LIMIT 100
    ),
    'leaveBalance', (
      SELECT GREATEST(0, 12 - COALESCE(SUM(total_days), 0))
      FROM teacher_leaves
      WHERE teacher_id = p_teacher_id
      AND status = 'Approved'
      AND start_date >= v_year_start
      AND end_date <= v_year_end
    ),
    'pendingLeaves', (
      SELECT COUNT(*)
      FROM teacher_leaves
      WHERE teacher_id = p_teacher_id
      AND status = 'Pending'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_teacher_dashboard_stats_from_mv(UUID) IS 'Optimized function to get teacher dashboard stats using indexes. Fixed monthly attendance calculation.';


