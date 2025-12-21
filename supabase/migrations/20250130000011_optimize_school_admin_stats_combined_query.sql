-- ============================================================================
-- Optimize School Admin Stats Function
-- Combine 6 separate subqueries into single CTE-based query
-- Reduces database round trips from 6 to 1
-- ============================================================================

CREATE OR REPLACE FUNCTION get_school_admin_stats(p_school_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_thirty_days_ago DATE;
BEGIN
  v_thirty_days_ago := CURRENT_DATE - INTERVAL '30 days';
  
  -- OPTIMIZATION: Combine all subqueries into single CTE-based query
  WITH student_stats AS (
    SELECT COUNT(*) as total_students_count
    FROM student_schools
    WHERE school_id = p_school_id AND is_active = true
  ),
  teacher_stats AS (
    SELECT COUNT(*) as total_teachers_count
    FROM teacher_schools
    WHERE school_id = p_school_id
  ),
  course_stats AS (
    SELECT COUNT(*) as active_courses_count
    FROM courses
    WHERE school_id = p_school_id AND status = 'Published'
  ),
  report_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE approved_by IS NULL) as pending_reports_count,
      COUNT(*) FILTER (WHERE date >= v_thirty_days_ago) as recent_reports_count,
      COUNT(DISTINCT teacher_id) FILTER (WHERE date >= v_thirty_days_ago) as unique_teachers_count
    FROM teacher_reports
    WHERE school_id = p_school_id
  ),
  leave_stats AS (
    SELECT COUNT(*) as pending_leaves_count
    FROM teacher_leaves
    WHERE school_id = p_school_id AND status = 'Pending'
  )
  SELECT json_build_object(
    'totalStudents', COALESCE((SELECT total_students_count FROM student_stats), 0),
    'totalTeachers', COALESCE((SELECT total_teachers_count FROM teacher_stats), 0),
    'activeCourses', COALESCE((SELECT active_courses_count FROM course_stats), 0),
    'pendingReports', COALESCE((SELECT pending_reports_count FROM report_stats), 0),
    'pendingLeaves', COALESCE((SELECT pending_leaves_count FROM leave_stats), 0),
    'averageAttendance', (
      SELECT CASE 
        WHEN unique_teachers_count > 0 THEN
          LEAST(100, ROUND((recent_reports_count::numeric / (unique_teachers_count * 20::numeric)) * 100))
        ELSE 0
      END
      FROM report_stats
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Add composite indexes for school admin stats queries (if not already exist)
-- ============================================================================

-- Index for student_schools queries (school_id + is_active)
CREATE INDEX IF NOT EXISTS idx_student_schools_school_active 
ON student_schools(school_id, is_active) 
WHERE is_active = true;

-- Index for teacher_schools queries (school_id)
CREATE INDEX IF NOT EXISTS idx_teacher_schools_school 
ON teacher_schools(school_id);

-- Index for courses queries (school_id + status)
CREATE INDEX IF NOT EXISTS idx_courses_school_status 
ON courses(school_id, status) 
WHERE status = 'Published';

-- Index for teacher_reports queries (school_id + approved_by + date)
CREATE INDEX IF NOT EXISTS idx_teacher_reports_school_approved_date 
ON teacher_reports(school_id, approved_by, date);

-- Index for teacher_leaves queries (school_id + status)
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_school_status 
ON teacher_leaves(school_id, status) 
WHERE status = 'Pending';

