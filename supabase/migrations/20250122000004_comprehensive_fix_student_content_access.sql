-- =======================================================================
-- Comprehensive Fix: Student Content Access Issue
-- 
-- This migration addresses the root cause of students not being able to
-- access course content despite seeing course names.
-- 
-- Issues Fixed:
-- 1. Index not being used (Seq Scan instead of Index Scan)
-- 2. RLS function performance (timeouts)
-- 3. Missing or incorrect indexes
-- 4. Outdated table statistics
-- 
-- Date: 2025-01-22
-- =======================================================================

-- ====================================
-- Step 1: Ensure normalize_grade_for_comparison Function Exists
-- ====================================
CREATE OR REPLACE FUNCTION normalize_grade_for_comparison(grade_text TEXT)
RETURNS TEXT AS $normalize$
BEGIN
  IF grade_text IS NULL OR grade_text = '' THEN
    RETURN '';
  END IF;
  
  -- Remove "Grade " prefix (case-sensitive)
  -- Then remove "grade" prefix (case-insensitive)
  -- Then trim and lowercase
  RETURN LOWER(TRIM(
    REPLACE(
      REPLACE(TRIM(grade_text), 'Grade ', ''),
      'grade',
      ''
    )
  ));
END;
$normalize$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_grade_for_comparison(TEXT) IS 
'Normalizes grade strings for comparison (handles "Grade 4", "grade4", "4", etc.)';

-- ====================================
-- Step 2: Drop and Recreate student_has_course_access Function
-- ====================================
-- This ensures the function is optimized and uses indexes correctly
CREATE OR REPLACE FUNCTION student_has_course_access(check_course_id UUID)
RETURNS BOOLEAN AS $function$
DECLARE
  _student_id UUID := auth.uid(); -- Cache auth.uid()
BEGIN
  -- If no user, return false immediately
  IF _student_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- FAST PATH 1: Check enrollments first (most common case - 99% of students)
  -- This MUST use idx_enrollments_student_course_active index
  IF EXISTS (
    SELECT 1 
    FROM enrollments
    WHERE course_id = check_course_id
      AND student_id = _student_id
      AND status = 'active'
    LIMIT 1
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- FAST PATH 2: Check course_access with exact grade match
  -- This should use idx_course_access_course_school_grade index
  IF EXISTS (
    SELECT 1
    FROM course_access ca
    INNER JOIN student_schools ss ON 
      ss.student_id = _student_id
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade  -- Exact match (no function calls - fastest)
      AND ss.is_active = true
    WHERE ca.course_id = check_course_id
    LIMIT 1
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- SLOW PATH: Only if exact match fails, try normalized match
  -- This is the fallback for grade format mismatches
  -- Most students should never reach here
  RETURN EXISTS (
    SELECT 1
    FROM course_access ca
    INNER JOIN student_schools ss ON 
      ss.student_id = _student_id
      AND ss.school_id = ca.school_id
      AND ss.is_active = true
    WHERE ca.course_id = check_course_id
      AND normalize_grade_for_comparison(ss.grade) = normalize_grade_for_comparison(ca.grade)
    LIMIT 1
  );
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

COMMENT ON FUNCTION student_has_course_access(UUID) IS 
'Ultra-fast function to check student course access. Checks enrollments first (fastest), then course_access with exact match, then normalized match. Marked as STABLE for better optimization.';

-- ====================================
-- Step 3: Drop and Recreate Critical Indexes
-- ====================================
-- These indexes are ESSENTIAL for performance

-- Index for enrollments (MOST CRITICAL - used in 99% of cases)
DROP INDEX IF EXISTS idx_enrollments_student_course_active;
CREATE INDEX idx_enrollments_student_course_active 
ON enrollments(student_id, course_id, status) 
WHERE status = 'active';

COMMENT ON INDEX idx_enrollments_student_course_active IS 
'CRITICAL: Optimizes enrollment lookups in student_has_course_access function. Column order: student_id (most selective), course_id, status. Partial index for active enrollments only.';

-- Index for course_access (exact match lookup)
DROP INDEX IF EXISTS idx_course_access_course_school_grade;
CREATE INDEX idx_course_access_course_school_grade 
ON course_access(course_id, school_id, grade);

COMMENT ON INDEX idx_course_access_course_school_grade IS 
'Optimizes course_access lookups in student_has_course_access function. Used for exact grade matching.';

-- Index for student_schools (for JOIN performance)
DROP INDEX IF EXISTS idx_student_schools_student_school_active;
CREATE INDEX idx_student_schools_student_school_active 
ON student_schools(student_id, school_id, is_active) 
WHERE is_active = true;

COMMENT ON INDEX idx_student_schools_student_school_active IS 
'Optimizes student_schools lookups in student_has_course_access function. Partial index for active school assignments only.';

-- ====================================
-- Step 4: Update Table Statistics
-- ====================================
-- This is CRITICAL - outdated statistics cause PostgreSQL to choose seq scan
-- even when index would be faster
ANALYZE enrollments;
ANALYZE course_access;
ANALYZE student_schools;
ANALYZE chapters;
ANALYZE chapter_contents;
ANALYZE materials;
ANALYZE videos;
ANALYZE assignments;

-- ====================================
-- Step 5: Verify RLS Policies Are Correct
-- ====================================
-- Ensure all RLS policies use student_has_course_access function

-- Chapters policy
DROP POLICY IF EXISTS "students_view_course_chapters" ON chapters;
CREATE POLICY "students_view_course_chapters" ON chapters
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(course_id)
  );

-- Chapter contents policy
DROP POLICY IF EXISTS "students_view_chapter_contents" ON chapter_contents;
CREATE POLICY "students_view_chapter_contents" ON chapter_contents
  FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM chapters ch
      WHERE ch.id = chapter_contents.chapter_id
      AND student_has_course_access(ch.course_id)
    )
  );

-- Assignments policy
DROP POLICY IF EXISTS "students_view_assignments" ON assignments;
CREATE POLICY "students_view_assignments" ON assignments
  FOR SELECT
  USING (
    is_published = true
    AND (
      (course_id IS NOT NULL AND student_has_course_access(course_id))
      OR
      (chapter_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM chapters ch
        WHERE ch.id = assignments.chapter_id
        AND student_has_course_access(ch.course_id)
      ))
    )
  );

-- Videos policy
DROP POLICY IF EXISTS "Students can view published videos" ON videos;
CREATE POLICY "Students can view published videos" ON videos
  FOR SELECT
  USING (
    (is_published = true OR is_published IS NULL)
    AND EXISTS (
      SELECT 1 FROM chapters ch
      WHERE ch.id = videos.chapter_id
      AND student_has_course_access(ch.course_id)
    )
  );

-- Materials policy
DROP POLICY IF EXISTS "Students can view published materials" ON materials;
CREATE POLICY "Students can view published materials" ON materials
  FOR SELECT
  USING (
    (is_published = true OR is_published IS NULL)
    AND EXISTS (
      SELECT 1 FROM chapters ch
      WHERE ch.id = materials.chapter_id
      AND student_has_course_access(ch.course_id)
    )
  );

-- Courses policy
DROP POLICY IF EXISTS "students_view_enrolled_courses" ON courses;
CREATE POLICY "students_view_enrolled_courses" ON courses
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(courses.id)
  );

-- ====================================
-- Step 6: Add Comments for Documentation
-- ====================================
COMMENT ON POLICY "students_view_course_chapters" ON chapters IS 
'Students can view published chapters of courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

COMMENT ON POLICY "students_view_chapter_contents" ON chapter_contents IS 
'Students can view published chapter contents of courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

COMMENT ON POLICY "students_view_assignments" ON assignments IS 
'Students can view published assignments for courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

COMMENT ON POLICY "Students can view published videos" ON videos IS 
'Students can view published videos for courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

COMMENT ON POLICY "Students can view published materials" ON materials IS 
'Students can view published materials for courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

COMMENT ON POLICY "students_view_enrolled_courses" ON courses IS 
'Students can view published courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 7: Verification Queries
-- ====================================
-- These queries help verify the fix is working
-- Run these after migration to confirm indexes are being used

DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run EXPLAIN ANALYZE on enrollment query to verify index usage';
  RAISE NOTICE '2. Test student content access in frontend';
  RAISE NOTICE '3. Monitor for any timeout errors';
  RAISE NOTICE '';
  RAISE NOTICE 'To verify index usage, run:';
  RAISE NOTICE 'EXPLAIN (ANALYZE, BUFFERS)';
  RAISE NOTICE 'SELECT EXISTS (';
  RAISE NOTICE '  SELECT 1 FROM enrollments';
  RAISE NOTICE '  WHERE course_id = ''<course_id>''';
  RAISE NOTICE '  AND student_id = ''<student_id>''';
  RAISE NOTICE '  AND status = ''active''';
  RAISE NOTICE '  LIMIT 1';
  RAISE NOTICE ');';
  RAISE NOTICE '';
  RAISE NOTICE 'Expected: Should show "Index Scan using idx_enrollments_student_course_active"';
END $$;


















