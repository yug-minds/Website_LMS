-- =======================================================================
-- Optimize student_has_course_access Function - Performance Fix
-- 
-- The previous version was timing out due to expensive grade normalization
-- in the RLS function. This optimization:
-- 1. Checks enrollments first (fast index lookup)
-- 2. Only checks course_access if enrollment doesn't exist
-- 3. Uses a simpler, more efficient grade matching approach
-- 4. Adds necessary indexes for performance
-- 
-- Date: 2025-01-22
-- =======================================================================

-- ====================================
-- Create Helper Function for Grade Normalization
-- ====================================
-- This function is more efficient than inline REPLACE operations
CREATE OR REPLACE FUNCTION normalize_grade_for_comparison(grade_text TEXT)
RETURNS TEXT AS $normalize$
BEGIN
  IF grade_text IS NULL OR grade_text = '' THEN
    RETURN '';
  END IF;
  
  -- Remove "Grade " prefix (case-sensitive)
  -- Remove "grade" prefix (case-insensitive)  
  -- Convert to lowercase and trim
  RETURN LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(grade_text, '^Grade\s+', '', 'g'),
      '^grade\s*',
      '',
      'gi'
    )
  ));
END;
$normalize$ LANGUAGE plpgsql IMMUTABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION normalize_grade_for_comparison(TEXT) TO authenticated;

-- ====================================
-- Optimize student_has_course_access Function
-- ====================================
-- Strategy: Check enrollments first (fast), then course_access (slower)
-- Use LIMIT 1 to stop as soon as we find a match
CREATE OR REPLACE FUNCTION student_has_course_access(check_course_id UUID)
RETURNS BOOLEAN AS $function$
BEGIN
  -- First, check enrollments (fast index lookup)
  -- This is the most common case and should be very fast
  -- Use LIMIT 1 to stop immediately when found
  IF EXISTS (
    SELECT 1 FROM enrollments
    WHERE enrollments.course_id = check_course_id
    AND enrollments.student_id = auth.uid()
    AND enrollments.status = 'active'
    LIMIT 1
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Only check course_access if no enrollment exists
  -- Try exact match first (no function call - fastest)
  IF EXISTS (
    SELECT 1 FROM course_access ca
    INNER JOIN student_schools ss ON 
      ss.student_id = auth.uid()
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade  -- Exact match first
      AND ss.is_active = true
    WHERE ca.course_id = check_course_id
    LIMIT 1
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Only if exact match fails, try normalized match
  -- This is slower but handles grade variations
  RETURN EXISTS (
    SELECT 1 FROM course_access ca
    INNER JOIN student_schools ss ON 
      ss.student_id = auth.uid()
      AND ss.school_id = ca.school_id
      AND ss.is_active = true
    WHERE ca.course_id = check_course_id
      AND normalize_grade_for_comparison(ss.grade) = normalize_grade_for_comparison(ca.grade)
    LIMIT 1
  );
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

-- ====================================
-- Add Performance Indexes
-- ====================================
-- Ensure indexes exist for fast lookups

-- Index for enrollments lookup (most common case)
CREATE INDEX IF NOT EXISTS idx_enrollments_student_course_active 
ON enrollments(student_id, course_id, status) 
WHERE status = 'active';

-- Index for course_access lookup
CREATE INDEX IF NOT EXISTS idx_course_access_course_school_grade 
ON course_access(course_id, school_id, grade);

-- Index for student_schools lookup
CREATE INDEX IF NOT EXISTS idx_student_schools_student_active 
ON student_schools(student_id, is_active) 
WHERE is_active = true;

-- Composite index for student_schools with school_id
CREATE INDEX IF NOT EXISTS idx_student_schools_student_school_active 
ON student_schools(student_id, school_id, is_active) 
WHERE is_active = true;

-- ====================================
-- Comments
-- ====================================
COMMENT ON FUNCTION normalize_grade_for_comparison(TEXT) IS 
'Normalizes grade text for comparison. Handles variations like "Grade 4", "grade4", "4", etc. Returns lowercase trimmed string without "Grade"/"grade" prefix.';

COMMENT ON FUNCTION student_has_course_access(UUID) IS 
'Checks if a student has access to a course via enrollments or course_access table. Optimized for performance: checks enrollments first (fast), then course_access only if needed. Uses normalized grade matching.';

COMMENT ON INDEX idx_enrollments_student_course_active IS 
'Optimizes enrollment lookups in student_has_course_access function (most common case)';

COMMENT ON INDEX idx_course_access_course_school_grade IS 
'Optimizes course_access lookups in student_has_course_access function';

COMMENT ON INDEX idx_student_schools_student_active IS 
'Optimizes student_schools lookups in student_has_course_access function';

