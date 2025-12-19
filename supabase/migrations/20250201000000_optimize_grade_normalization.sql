-- =======================================================================
-- Optimize RLS Performance - Structure Only (No Data Updates)
-- 
-- Date: 2025-02-01
-- Description:
-- 1. Adds normalized_grade columns to student_schools and course_access
-- 2. Adds triggers to auto-populate these columns for NEW/UPDATED rows
-- 3. Creates indexes for fast lookups
-- 4. Updates student_has_course_access to use HYBRID approach:
--    - Uses normalized_grade when available (fast)
--    - Falls back to runtime normalization when NULL (safe)
-- 
-- NOTE: Data backfill is in a separate migration to avoid timeouts
-- =======================================================================

-- 1. Add normalized_grade column to student_schools
ALTER TABLE student_schools 
ADD COLUMN IF NOT EXISTS normalized_grade TEXT;

-- Create index for fast lookups (partial index for active students)
CREATE INDEX IF NOT EXISTS idx_student_schools_normalized_grade 
ON student_schools(student_id, normalized_grade) 
WHERE is_active = true AND normalized_grade IS NOT NULL;

-- Function to keep student_schools.normalized_grade updated
CREATE OR REPLACE FUNCTION update_student_schools_normalized_grade()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_grade := normalize_grade_for_comparison(NEW.grade);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT/UPDATE (auto-populates for new data)
DROP TRIGGER IF EXISTS trg_update_student_schools_normalized_grade ON student_schools;
CREATE TRIGGER trg_update_student_schools_normalized_grade
BEFORE INSERT OR UPDATE OF grade ON student_schools
FOR EACH ROW
EXECUTE FUNCTION update_student_schools_normalized_grade();


-- 2. Add normalized_grade column to course_access
ALTER TABLE course_access 
ADD COLUMN IF NOT EXISTS normalized_grade TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_course_access_normalized_grade 
ON course_access(course_id, school_id, normalized_grade)
WHERE normalized_grade IS NOT NULL;

-- Function to keep course_access.normalized_grade updated
CREATE OR REPLACE FUNCTION update_course_access_normalized_grade()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_grade := normalize_grade_for_comparison(NEW.grade);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT/UPDATE (auto-populates for new data)
DROP TRIGGER IF EXISTS trg_update_course_access_normalized_grade ON course_access;
CREATE TRIGGER trg_update_course_access_normalized_grade
BEFORE INSERT OR UPDATE OF grade ON course_access
FOR EACH ROW
EXECUTE FUNCTION update_course_access_normalized_grade();


-- 3. Update student_has_course_access with HYBRID approach
-- This function works immediately, even with partial data
CREATE OR REPLACE FUNCTION student_has_course_access(check_course_id UUID)
RETURNS BOOLEAN AS $function$
DECLARE
  student_user_id UUID;
BEGIN
  -- Get user ID once
  student_user_id := auth.uid();
  
  -- If no user, return false
  IF student_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- PATH 1: Check enrollments first (Fastest - always works)
  IF EXISTS (
    SELECT 1 FROM enrollments
    WHERE enrollments.course_id = check_course_id
    AND enrollments.student_id = student_user_id
    AND enrollments.status = 'active'
    LIMIT 1
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- PATH 2: HYBRID course_access check
  -- Try optimized path first (uses normalized_grade if available)
  -- Falls back to runtime normalization if normalized_grade is NULL
  RETURN EXISTS (
    SELECT 1 
    FROM course_access ca
    INNER JOIN student_schools ss ON 
      ss.student_id = student_user_id
      AND ss.school_id = ca.school_id
      AND ss.is_active = true
      AND (
        -- FAST PATH: Use pre-computed normalized grades (when available)
        (ss.normalized_grade IS NOT NULL 
         AND ca.normalized_grade IS NOT NULL 
         AND ss.normalized_grade = ca.normalized_grade)
        OR
        -- FALLBACK: Runtime normalization (for rows not yet backfilled)
        (normalize_grade_for_comparison(ss.grade) = normalize_grade_for_comparison(ca.grade))
      )
    WHERE ca.course_id = check_course_id
    LIMIT 1
  );
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

-- Comment
COMMENT ON FUNCTION student_has_course_access(UUID) IS 
'Hybrid optimized check for student course access. Uses pre-computed normalized_grade columns when available (fast), falls back to runtime normalization when NULL (safe). Allows gradual data backfill without breaking functionality.';
