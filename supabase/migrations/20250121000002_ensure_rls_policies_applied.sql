-- =======================================================================
-- Ensure RLS Policies Are Correctly Applied
-- This migration ensures all policies are properly set up and any
-- conflicting policies are removed
-- Date: 2025-01-21
-- =======================================================================

-- ====================================
-- Verify Helper Function Exists
-- ====================================
-- Drop and recreate the function to ensure it exists
CREATE OR REPLACE FUNCTION student_has_course_access(check_course_id UUID)
RETURNS BOOLEAN AS $function$
BEGIN
  RETURN EXISTS (
    -- Check via enrollments
    SELECT 1 FROM enrollments
    WHERE enrollments.course_id = check_course_id
    AND enrollments.student_id = auth.uid()
    AND enrollments.status = 'active'
  ) OR EXISTS (
    -- Check via course_access (school/grade based)
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.student_id = auth.uid()
      AND ss.school_id = ca.school_id
      AND ss.grade = ca.grade
      AND ss.is_active = true
    WHERE ca.course_id = check_course_id
  );
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

-- ====================================
-- Remove Conflicting Policies on Chapters
-- ====================================
-- Drop ALL existing student policies on chapters to avoid conflicts
DROP POLICY IF EXISTS "students_view_course_chapters" ON chapters;
DROP POLICY IF EXISTS "Students can view published chapters" ON chapters;
DROP POLICY IF EXISTS "students_view_published_chapters" ON chapters;

-- Create the correct policy
CREATE POLICY "students_view_course_chapters" ON chapters
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(course_id)
  );

-- ====================================
-- Remove Conflicting Policies on Chapter Contents
-- ====================================
DROP POLICY IF EXISTS "students_view_chapter_contents" ON chapter_contents;
DROP POLICY IF EXISTS "Students can view published chapter contents" ON chapter_contents;
DROP POLICY IF EXISTS "students_view_published_chapter_contents" ON chapter_contents;

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

-- ====================================
-- Remove Conflicting Policies on Assignments
-- ====================================
DROP POLICY IF EXISTS "students_view_assignments" ON assignments;
DROP POLICY IF EXISTS "Students can view published assignments" ON assignments;
DROP POLICY IF EXISTS "students_view_published_assignments" ON assignments;

CREATE POLICY "students_view_assignments" ON assignments
  FOR SELECT
  USING (
    is_published = true
    AND (
      -- Check if assignment has course_id and student has access
      (course_id IS NOT NULL AND student_has_course_access(course_id))
      OR
      -- Check if assignment has chapter_id and student has access to that chapter's course
      (chapter_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM chapters ch
        WHERE ch.id = assignments.chapter_id
        AND student_has_course_access(ch.course_id)
      ))
    )
  );

-- ====================================
-- Remove Conflicting Policies on Videos
-- ====================================
DROP POLICY IF EXISTS "Students can view published videos" ON videos;
DROP POLICY IF EXISTS "students_view_published_videos" ON videos;

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

-- ====================================
-- Remove Conflicting Policies on Materials
-- ====================================
DROP POLICY IF EXISTS "Students can view published materials" ON materials;
DROP POLICY IF EXISTS "students_view_published_materials" ON materials;

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

-- ====================================
-- Remove Conflicting Policies on Courses
-- ====================================
DROP POLICY IF EXISTS "students_view_enrolled_courses" ON courses;
DROP POLICY IF EXISTS "Students can view published courses" ON courses;
DROP POLICY IF EXISTS "students_view_published_courses" ON courses;

CREATE POLICY "students_view_enrolled_courses" ON courses
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(courses.id)
  );

-- ====================================
-- Comments
-- ====================================
COMMENT ON POLICY "students_view_course_chapters" ON chapters IS 
  'Students can view published chapters of courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "students_view_chapter_contents" ON chapter_contents IS 
  'Students can view published chapter contents of courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "students_view_assignments" ON assignments IS 
  'Students can view published assignments for courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "Students can view published videos" ON videos IS 
  'Students can view published videos for courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "Students can view published materials" ON materials IS 
  'Students can view published materials for courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "students_view_enrolled_courses" ON courses IS 
  'Students can view published courses they have access to (via enrollment or course_access)';

