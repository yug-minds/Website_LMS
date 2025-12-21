-- Optimize Student Dashboard Function
-- Created: 2025-12-06
-- Purpose: Fix performance regression by replacing slow NOT EXISTS correlated subquery with efficient LEFT JOIN

-- Replace the get_student_dashboard_stats_from_mv function with optimized version
-- The main optimization: Replace NOT EXISTS correlated subquery with LEFT JOIN using CTE
CREATE OR REPLACE FUNCTION get_student_dashboard_stats_from_mv(p_student_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_course_ids UUID[];
  v_start_of_month DATE;
BEGIN
  -- Calculate start of current month
  v_start_of_month := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  
  -- Get active course IDs (using indexes)
  SELECT ARRAY_AGG(DISTINCT course_id) INTO v_course_ids
  FROM (
    SELECT course_id FROM student_courses 
    WHERE student_id = p_student_id AND is_completed = false
    UNION
    SELECT course_id FROM enrollments 
    WHERE student_id = p_student_id AND status = 'active'
  ) combined_courses;
  
  -- If no courses, return early
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
  
  -- Build result using optimized queries with indexes
  -- OPTIMIZATION: Use CTE and LEFT JOIN instead of NOT EXISTS correlated subquery
  WITH submitted_assignments AS (
    -- Pre-compute all submitted assignment IDs for this student once
    SELECT DISTINCT assignment_id
    FROM submissions
    WHERE student_id = p_student_id
    AND status = 'submitted'
  ),
  pending_assignments_query AS (
    -- Use LEFT JOIN to find assignments without submissions (much faster than NOT EXISTS)
    SELECT COUNT(*) as pending_count
    FROM assignments a
    LEFT JOIN submitted_assignments sa ON a.id = sa.assignment_id
    WHERE a.course_id = ANY(v_course_ids)
    AND a.is_published = true
    AND a.due_date >= CURRENT_DATE
    AND sa.assignment_id IS NULL  -- No submission exists
  )
  SELECT json_build_object(
    'activeCourses', array_length(v_course_ids, 1),
    'pendingAssignments', COALESCE((SELECT pending_count FROM pending_assignments_query), 0),
    'attendancePercentage', (
      SELECT CASE 
        WHEN COUNT(*) > 0 THEN 
          ROUND((COUNT(*) FILTER (WHERE status = 'Present')::numeric / COUNT(*)::numeric) * 100)
        ELSE 0
      END
      FROM attendance
      WHERE user_id = p_student_id
      AND date >= v_start_of_month
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

COMMENT ON FUNCTION get_student_dashboard_stats_from_mv(UUID) IS 'Optimized function to get student dashboard stats using indexes. Uses LEFT JOIN instead of NOT EXISTS for better performance.';


