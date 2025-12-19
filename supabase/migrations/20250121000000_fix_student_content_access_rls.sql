-- =======================================================================
-- Fix Student Content Access RLS Policies
-- Updates RLS policies to support both enrollments and course_access
-- Date: 2025-01-21
-- =======================================================================

-- ====================================
-- Helper Function: Check Student Course Access
-- ====================================
-- This function checks if a student has access to a course via either:
-- 1. Active enrollment in enrollments table
-- 2. course_access table (school/grade based access)
CREATE OR REPLACE FUNCTION student_has_course_access(check_course_id UUID)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION student_has_course_access(UUID) TO authenticated;

-- ====================================
-- Update CHAPTERS Table Policy
-- ====================================
-- Drop existing policy
DROP POLICY IF EXISTS "students_view_course_chapters" ON chapters;

-- Create new policy that checks both enrollments and course_access
CREATE POLICY "students_view_course_chapters" ON chapters
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(course_id)
  );

-- ====================================
-- Update CHAPTER_CONTENTS Table Policy
-- ====================================
-- Drop existing policy
DROP POLICY IF EXISTS "students_view_chapter_contents" ON chapter_contents;

-- Create new policy that checks both enrollments and course_access
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
-- Update ASSIGNMENTS Table Policy
-- ====================================
-- Drop existing policy
DROP POLICY IF EXISTS "students_view_assignments" ON assignments;

-- Create new policy that checks both enrollments and course_access
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
-- Update VIDEOS Table Policy
-- ====================================
-- Drop existing policy
DROP POLICY IF EXISTS "Students can view published videos" ON videos;

-- Create new policy that checks both enrollments and course_access
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
-- Update MATERIALS Table Policy
-- ====================================
-- Drop existing policy
DROP POLICY IF EXISTS "Students can view published materials" ON materials;

-- Create new policy that checks both enrollments and course_access
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
-- Update COURSES Table Policy (for consistency)
-- ====================================
-- Drop existing policy
DROP POLICY IF EXISTS "students_view_enrolled_courses" ON courses;

-- Create new policy that checks both enrollments and course_access
CREATE POLICY "students_view_enrolled_courses" ON courses
  FOR SELECT
  USING (
    is_published = true
    AND student_has_course_access(courses.id)
  );

-- ====================================
-- Comments
-- ====================================
COMMENT ON FUNCTION student_has_course_access(UUID) IS 'Checks if a student has access to a course via enrollments or course_access table';
COMMENT ON POLICY "students_view_course_chapters" ON chapters IS 'Students can view published chapters of courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "students_view_chapter_contents" ON chapter_contents IS 'Students can view published chapter contents of courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "students_view_assignments" ON assignments IS 'Students can view published assignments for courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "Students can view published videos" ON videos IS 'Students can view published videos for courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "Students can view published materials" ON materials IS 'Students can view published materials for courses they have access to (via enrollment or course_access)';
COMMENT ON POLICY "students_view_enrolled_courses" ON courses IS 'Students can view published courses they have access to (via enrollment or course_access)';


















