-- =======================================================================
-- Verify and Ensure RLS Policies Are Correctly Applied
-- 
-- This migration verifies that all RLS policies for student content
-- access are correctly configured and use the student_has_course_access
-- function consistently.
-- 
-- Date: 2025-01-23
-- =======================================================================

-- ====================================
-- Step 1: Verify student_has_course_access Function Exists
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'student_has_course_access'
  ) THEN
    RAISE EXCEPTION 'student_has_course_access function does not exist. Run comprehensive_fix_student_content_access migration first.';
  ELSE
    RAISE NOTICE '✅ student_has_course_access function exists';
  END IF;
END $$;

-- ====================================
-- Step 2: Ensure Chapters RLS Policy Uses student_has_course_access
-- ====================================
DROP POLICY IF EXISTS "students_view_course_chapters" ON chapters;

CREATE POLICY "students_view_course_chapters" ON chapters
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(course_id)
  );

COMMENT ON POLICY "students_view_course_chapters" ON chapters IS 
'Students can view published chapters of courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 3: Ensure Chapter Contents RLS Policy Uses student_has_course_access
-- ====================================
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

COMMENT ON POLICY "students_view_chapter_contents" ON chapter_contents IS 
'Students can view published chapter contents of courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 4: Ensure Assignments RLS Policy Uses student_has_course_access
-- ====================================
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

COMMENT ON POLICY "students_view_assignments" ON assignments IS 
'Students can view published assignments for courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 5: Ensure Videos RLS Policy Uses student_has_course_access
-- ====================================
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

COMMENT ON POLICY "Students can view published videos" ON videos IS 
'Students can view published videos for courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 6: Ensure Materials RLS Policy Uses student_has_course_access
-- ====================================
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

COMMENT ON POLICY "Students can view published materials" ON materials IS 
'Students can view published materials for courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 7: Ensure Courses RLS Policy Uses student_has_course_access
-- ====================================
DROP POLICY IF EXISTS "students_view_enrolled_courses" ON courses;

CREATE POLICY "students_view_enrolled_courses" ON courses
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(courses.id)
  );

COMMENT ON POLICY "students_view_enrolled_courses" ON courses IS 
'Students can view published courses they have access to (via enrollment or course_access). Uses optimized student_has_course_access function.';

-- ====================================
-- Step 8: Verify All Policies Are Applied
-- ====================================
DO $$
DECLARE
  policy_count INTEGER;
  expected_policies TEXT[] := ARRAY[
    'students_view_course_chapters',
    'students_view_chapter_contents',
    'students_view_assignments',
    'Students can view published videos',
    'Students can view published materials',
    'students_view_enrolled_courses'
  ];
  policy_name TEXT;
  missing_policies TEXT[] := ARRAY[]::TEXT[];
BEGIN
  RAISE NOTICE 'Verifying RLS policies...';
  RAISE NOTICE '';
  
  FOREACH policy_name IN ARRAY expected_policies
  LOOP
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE policyname = policy_name;
    
    IF policy_count = 0 THEN
      missing_policies := array_append(missing_policies, policy_name);
      RAISE WARNING '❌ Policy missing: %', policy_name;
    ELSE
      RAISE NOTICE '✅ Policy exists: %', policy_name;
    END IF;
  END LOOP;
  
  IF array_length(missing_policies, 1) > 0 THEN
    RAISE WARNING '⚠️ % policies are missing', array_length(missing_policies, 1);
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '✅ All RLS policies are correctly applied';
  END IF;
END $$;

-- ====================================
-- Step 9: Grant Necessary Permissions
-- ====================================
-- Ensure authenticated users can execute the function
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

-- ====================================
-- Step 10: Update Statistics
-- ====================================
-- Update statistics to ensure query planner has current data
ANALYZE chapters;
ANALYZE chapter_contents;
ANALYZE assignments;
ANALYZE videos;
ANALYZE materials;
ANALYZE courses;
ANALYZE enrollments;
ANALYZE course_access;
ANALYZE student_schools;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ RLS policy verification complete';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test student content access in frontend';
  RAISE NOTICE '2. Monitor for any RLS-related errors';
  RAISE NOTICE '3. Verify all content types are accessible';
END $$;

