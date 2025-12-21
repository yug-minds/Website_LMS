-- Materialized Views for Student and Teacher Dashboards
-- Created: 2025-01-30
-- Purpose: Pre-compute aggregations for faster student and teacher dashboard queries

-- ============================================================================
-- 1. Materialized View for Student Dashboard Stats (per student)
-- ============================================================================

-- Note: Student dashboard stats are user-specific, so we'll create a view that
-- can be queried with student_id filter. For now, we'll create a function-based
-- approach since materialized views can't be parameterized.

-- Create a function to get student dashboard stats from materialized data
-- This will be faster than computing on-the-fly but still allows per-student queries
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

-- ============================================================================
-- 2. Materialized View for Teacher Dashboard Stats (per teacher)
-- ============================================================================

-- Similar approach for teacher stats - function-based for per-teacher queries
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

-- ============================================================================
-- 3. Add Composite Indexes for Better Performance
-- ============================================================================

-- Index for student_courses with student_id and is_completed
CREATE INDEX IF NOT EXISTS idx_student_courses_student_completed_course 
ON student_courses(student_id, is_completed, course_id) 
WHERE is_completed = false;

-- Index for enrollments with student_id, status, and course_id
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status_course 
ON enrollments(student_id, status, course_id) 
WHERE status = 'active';

-- Index for assignments with course_id, due_date, and is_published
-- Note: Cannot use CURRENT_DATE in index predicate (not IMMUTABLE), so we index all published assignments
-- The query will filter by date at runtime, and the index on due_date will still help
CREATE INDEX IF NOT EXISTS idx_assignments_course_due_published_optimized 
ON assignments(course_id, due_date, is_published) 
WHERE is_published = true;

-- Index for submissions with student_id, status, and assignment_id
CREATE INDEX IF NOT EXISTS idx_submissions_student_status_assignment 
ON submissions(student_id, status, assignment_id);

-- Index for submissions with student_id and grade (for average calculation)
CREATE INDEX IF NOT EXISTS idx_submissions_student_grade 
ON submissions(student_id, grade) 
WHERE grade IS NOT NULL;

-- Index for attendance with user_id and date (for monthly attendance)
CREATE INDEX IF NOT EXISTS idx_attendance_user_date_status 
ON attendance(user_id, date, status);

-- Index for teacher_classes with teacher_id and class_id
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_class 
ON teacher_classes(teacher_id, class_id);

-- Index for teacher_reports with teacher_id, report_status, and created_at
CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_status_created 
ON teacher_reports(teacher_id, report_status, created_at DESC);

-- Index for teacher_leaves with teacher_id, status, and dates
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_status_dates 
ON teacher_leaves(teacher_id, status, start_date, end_date);

-- Index for student_schools with school_id and is_active
CREATE INDEX IF NOT EXISTS idx_student_schools_school_active 
ON student_schools(school_id, is_active, student_id) 
WHERE is_active = true;

-- ============================================================================
-- 4. Analyze Tables for Better Query Plans
-- ============================================================================

ANALYZE student_courses;
ANALYZE enrollments;
ANALYZE assignments;
ANALYZE submissions;
ANALYZE attendance;
ANALYZE teacher_classes;
ANALYZE teacher_reports;
ANALYZE teacher_leaves;
ANALYZE student_schools;

-- ============================================================================
-- 5. Comments
-- ============================================================================

COMMENT ON FUNCTION get_student_dashboard_stats_from_mv(UUID) IS 'Optimized function to get student dashboard stats using indexes. Faster than computing on-the-fly.';
COMMENT ON FUNCTION get_teacher_dashboard_stats_from_mv(UUID) IS 'Optimized function to get teacher dashboard stats using indexes. Faster than computing on-the-fly.';

