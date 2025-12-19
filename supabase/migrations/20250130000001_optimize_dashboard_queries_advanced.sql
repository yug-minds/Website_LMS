-- Advanced Query Optimization for Dashboard APIs
-- Created: 2025-01-30
-- Purpose: Further optimize dashboard queries using database functions and materialized views

-- ============================================================================
-- 1. Create optimized database functions for dashboard stats
-- ============================================================================

-- Function to get student dashboard stats (aggregated in database)
-- Optimized to use CTEs for better performance
CREATE OR REPLACE FUNCTION get_student_dashboard_stats(p_student_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_course_ids UUID[];
BEGIN
  -- Get all active course IDs once (used in multiple places)
  SELECT ARRAY_AGG(DISTINCT course_id) INTO v_course_ids
  FROM (
    SELECT course_id FROM student_courses WHERE student_id = p_student_id AND is_completed = false
    UNION
    SELECT course_id FROM enrollments WHERE student_id = p_student_id AND status = 'active'
  ) combined_courses;
  
  -- If no courses, return early with zeros
  IF v_course_ids IS NULL OR array_length(v_course_ids, 1) IS NULL THEN
    SELECT json_build_object(
      'activeCourses', 0,
      'pendingAssignments', 0,
      'attendancePercentage', 0,
      'averageGrade', 0,
      'completedAssignments', 0
    ) INTO v_result;
    RETURN v_result;
  END IF;
  
  SELECT json_build_object(
    'activeCourses', array_length(v_course_ids, 1),
    'pendingAssignments', (
      SELECT COUNT(*)
      FROM assignments a
      WHERE a.course_id = ANY(v_course_ids)
      AND a.is_published = true
      AND a.due_date >= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM submissions s 
        WHERE s.assignment_id = a.id 
        AND s.student_id = p_student_id 
        AND s.status = 'submitted'
      )
    ),
    'attendancePercentage', (
      SELECT CASE 
        WHEN COUNT(*) > 0 THEN 
          ROUND((COUNT(*) FILTER (WHERE status = 'Present')::numeric / COUNT(*)::numeric) * 100)
        ELSE 0
      END
      FROM attendance
      WHERE user_id = p_student_id
      AND date >= DATE_TRUNC('month', CURRENT_DATE)
      LIMIT 100
    ),
    'averageGrade', (
      SELECT CASE 
        WHEN COUNT(*) > 0 THEN ROUND(AVG(grade))
        ELSE 0
      END
      FROM submissions
      WHERE student_id = p_student_id
      AND grade IS NOT NULL
      LIMIT 100
    ),
    'completedAssignments', (
      SELECT COUNT(DISTINCT assignment_id)
      FROM submissions
      WHERE student_id = p_student_id
      AND status = 'submitted'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get admin stats (all counts in one query)
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'totalSchools', (SELECT COUNT(*) FROM schools),
    'totalTeachers', (SELECT COUNT(*) FROM teachers),
    'totalStudents', (SELECT COUNT(*) FROM profiles WHERE role = 'student'),
    'activeCourses', (
      SELECT COUNT(*) 
      FROM courses 
      WHERE status = 'Published' AND is_published = true
    ),
    'pendingLeaves', (
      SELECT COUNT(*) 
      FROM teacher_leaves 
      WHERE status = 'Pending'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get teacher dashboard stats
CREATE OR REPLACE FUNCTION get_teacher_dashboard_stats(p_teacher_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_current_month TEXT;
  v_year_start DATE;
  v_year_end DATE;
  v_monthly_attendance INTEGER := 0;
BEGIN
  v_current_month := TO_CHAR(CURRENT_DATE, 'YYYY-MM') || '-01';
  v_year_start := DATE_TRUNC('year', CURRENT_DATE);
  v_year_end := (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  
  -- Calculate monthly attendance from teacher_monthly_attendance view
  -- Note: teacher_monthly_attendance is a view that aggregates attendance table
  -- The view maps user_id (from attendance) to teacher_id
  SELECT COALESCE((
    SELECT CASE 
      WHEN total_days > 0 THEN 
        ROUND((present_count::numeric / total_days::numeric) * 100)
      ELSE 0
    END
    FROM teacher_monthly_attendance
    WHERE teacher_id = p_teacher_id
    AND month = v_current_month
    LIMIT 1
  ), 0) INTO v_monthly_attendance;
  
  SELECT json_build_object(
    'todaysClasses', (
      SELECT COUNT(DISTINCT tc.class_id)
      FROM teacher_classes tc
      WHERE tc.teacher_id = p_teacher_id
    ),
    'pendingReports', (
      SELECT COUNT(*)
      FROM teacher_reports
      WHERE teacher_id = p_teacher_id
      AND report_status = 'Submitted'
    ),
    'totalStudents', 0, -- Would need separate query for student count per class
    'monthlyAttendance', v_monthly_attendance,
    'leaveBalance', GREATEST(0, 12 - COALESCE((
      SELECT SUM(total_days)
      FROM teacher_leaves
      WHERE teacher_id = p_teacher_id
      AND status = 'Approved'
      AND start_date >= v_year_start
      AND end_date <= v_year_end
    ), 0)),
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

-- Function to get school admin stats
CREATE OR REPLACE FUNCTION get_school_admin_stats(p_school_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_thirty_days_ago DATE;
BEGIN
  v_thirty_days_ago := CURRENT_DATE - INTERVAL '30 days';
  
  SELECT json_build_object(
    'totalStudents', (
      SELECT COUNT(*)
      FROM student_schools
      WHERE school_id = p_school_id
      AND is_active = true
    ),
    'totalTeachers', (
      SELECT COUNT(*)
      FROM teacher_schools
      WHERE school_id = p_school_id
    ),
    'activeCourses', (
      SELECT COUNT(*)
      FROM courses
      WHERE school_id = p_school_id
      AND status = 'Published'
    ),
    'pendingReports', (
      SELECT COUNT(*)
      FROM teacher_reports
      WHERE school_id = p_school_id
      AND approved_by IS NULL
    ),
    'pendingLeaves', (
      SELECT COUNT(*)
      FROM teacher_leaves
      WHERE school_id = p_school_id
      AND status = 'Pending'
    ),
    'averageAttendance', (
      SELECT CASE 
        WHEN COUNT(DISTINCT teacher_id) > 0 THEN
          LEAST(100, ROUND((COUNT(*)::numeric / (COUNT(DISTINCT teacher_id) * 20::numeric)) * 100))
        ELSE 0
      END
      FROM teacher_reports
      WHERE school_id = p_school_id
      AND date >= v_thirty_days_ago
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 2. Add indexes for the new functions (if needed)
-- ============================================================================

-- Index for attendance queries (optimized for monthly queries)
-- Note: attendance table uses user_id, not teacher_id
-- Note: Cannot use CURRENT_DATE in index predicate (must be immutable), so using full index
CREATE INDEX IF NOT EXISTS idx_attendance_user_month_optimized 
ON attendance(user_id, date);

-- ============================================================================
-- 3. Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_student_dashboard_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_teacher_dashboard_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_school_admin_stats(UUID) TO authenticated;

-- ============================================================================
-- 4. Analyze tables again after function creation
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
ANALYZE student_schools;
ANALYZE teacher_schools;

