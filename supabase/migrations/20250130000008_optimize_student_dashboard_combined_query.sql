-- Optimize Student Dashboard Function - Combine Subqueries
-- Created: 2025-12-06
-- Purpose: Combine 4 separate subqueries into single CTE-based query to reduce database round trips

-- Replace the get_student_dashboard_stats_from_mv function with fully optimized version
-- OPTIMIZATION: Combine all subqueries into single query with CTEs to reduce from 4 round trips to 1
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
  
  -- OPTIMIZATION: Combine all subqueries into single CTE-based query
  -- This reduces from 4 separate database round trips to 1
  WITH submitted_assignments AS (
    -- Pre-compute all submitted assignment IDs for this student once
    SELECT DISTINCT assignment_id
    FROM submissions
    WHERE student_id = p_student_id
    AND status = 'submitted'
  ),
  attendance_stats AS (
    -- Compute attendance percentage in one pass
    SELECT 
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE status = 'Present') as present_count
    FROM attendance
    WHERE user_id = p_student_id
    AND date >= v_start_of_month
    LIMIT 100
  ),
  grade_stats AS (
    -- Compute average grade in one pass
    SELECT 
      COUNT(*) as graded_count,
      CASE 
        WHEN COUNT(*) > 0 THEN ROUND(AVG(grade))
        ELSE 0
      END as avg_grade
    FROM submissions
    WHERE student_id = p_student_id
    AND grade IS NOT NULL
    LIMIT 100
  ),
  completed_assignments_stats AS (
    -- Count completed assignments
    SELECT COUNT(DISTINCT assignment_id) as completed_count
    FROM submissions
    WHERE student_id = p_student_id
    AND status = 'submitted'
  ),
  pending_assignments_query AS (
    -- Use LEFT JOIN to find assignments without submissions (already optimized)
    SELECT COUNT(*) as pending_count
    FROM assignments a
    LEFT JOIN submitted_assignments sa ON a.id = sa.assignment_id
    WHERE a.course_id = ANY(v_course_ids)
    AND a.is_published = true
    AND a.due_date >= CURRENT_DATE
    AND sa.assignment_id IS NULL  -- No submission exists
  )
  -- Single SELECT that combines all CTEs - executes in one database round trip
  SELECT json_build_object(
    'activeCourses', array_length(v_course_ids, 1),
    'pendingAssignments', COALESCE((SELECT pending_count FROM pending_assignments_query), 0),
    'attendancePercentage', (
      SELECT CASE 
        WHEN total_count > 0 THEN 
          ROUND((present_count::numeric / total_count::numeric) * 100)
        ELSE 0
      END
      FROM attendance_stats
    ),
    'averageGrade', COALESCE((SELECT avg_grade FROM grade_stats), 0),
    'completedAssignments', COALESCE((SELECT completed_count FROM completed_assignments_stats), 0)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_student_dashboard_stats_from_mv(UUID) IS 'Fully optimized function combining all subqueries into single CTE-based query. Reduces from 4 database round trips to 1 for significant performance improvement.';

