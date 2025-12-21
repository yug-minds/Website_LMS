-- =======================================================================
-- Fix student_has_course_access Function - Grade Matching
-- 
-- The issue: The RLS function uses exact grade matching (ss.grade = ca.grade)
-- but the API and auto-enrollment use normalized matching. This causes
-- students to see courses in the list but be blocked from accessing content.
-- 
-- Solution: Update the function to use normalized grade matching like
-- the auto-enrollment triggers do.
-- 
-- Date: 2025-01-22
-- =======================================================================

-- ====================================
-- Update student_has_course_access Function
-- ====================================
-- Drop and recreate with normalized grade matching
CREATE OR REPLACE FUNCTION student_has_course_access(check_course_id UUID)
RETURNS BOOLEAN AS $function$
BEGIN
  RETURN EXISTS (
    -- Check via enrollments (active enrollment grants access)
    SELECT 1 FROM enrollments
    WHERE enrollments.course_id = check_course_id
    AND enrollments.student_id = auth.uid()
    AND enrollments.status = 'active'
  ) OR EXISTS (
    -- Check via course_access (school/grade based) with normalized grade matching
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = auth.uid()
      AND ss.school_id = ca.school_id
      AND ss.is_active = true
    WHERE ca.course_id = check_course_id
      AND (
        -- Exact match
        ss.grade = ca.grade OR
        -- Normalized match (handle "Grade 4" vs "grade4" vs "4" etc)
        -- This matches the logic used in auto-enrollment triggers
        LOWER(TRIM(REPLACE(ss.grade, 'Grade ', ''))) = LOWER(TRIM(REPLACE(ca.grade, 'Grade ', ''))) OR
        LOWER(TRIM(REPLACE(ss.grade, 'grade', ''))) = LOWER(TRIM(REPLACE(ca.grade, 'grade', '')))
      )
  );
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

-- ====================================
-- Comments
-- ====================================
COMMENT ON FUNCTION student_has_course_access(UUID) IS 
'Checks if a student has access to a course via enrollments or course_access table. Uses normalized grade matching to handle variations like "Grade 4", "grade4", "4", etc.';


















