-- =======================================================================
-- Student Dashboard RLS Policies
-- Comprehensive security policies for student portal
-- Date: 2025-11-06
-- =======================================================================

-- ====================================
-- Enable RLS on all student-related tables
-- ====================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;

-- ====================================
-- PROFILES TABLE POLICIES
-- ====================================

-- Students can view their own profile
DROP POLICY IF EXISTS "students_view_own_profile" ON profiles;
CREATE POLICY "students_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id AND role = 'student');

-- Students can update their own profile
DROP POLICY IF EXISTS "students_update_own_profile" ON profiles;
CREATE POLICY "students_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id AND role = 'student')
  WITH CHECK (auth.uid() = id AND role = 'student');

-- ====================================
-- STUDENTS TABLE POLICIES (only if table exists)
-- ====================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    -- Students can view their own student record
    DROP POLICY IF EXISTS "students_select_own" ON students;
    CREATE POLICY "students_select_own" ON students
    FOR SELECT
    USING (profile_id = auth.uid());

    -- Students can update their own last_login
    DROP POLICY IF EXISTS "students_update_own_login" ON students;
    CREATE POLICY "students_update_own_login" ON students
    FOR UPDATE
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());
  END IF;
END $$;

-- ====================================
-- ENROLLMENTS TABLE POLICIES
-- ====================================

-- Students can view their own enrollments
DROP POLICY IF EXISTS "enrollments_select_own" ON enrollments;
CREATE POLICY "enrollments_select_own" ON enrollments
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can update their own enrollment last_accessed
DROP POLICY IF EXISTS "enrollments_update_own_access" ON enrollments;
CREATE POLICY "enrollments_update_own_access" ON enrollments
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- ====================================
-- COURSES TABLE POLICIES
-- ====================================

-- Students can view published courses they're enrolled in
DROP POLICY IF EXISTS "students_view_enrolled_courses" ON courses;
CREATE POLICY "students_view_enrolled_courses" ON courses
  FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.course_id = courses.id
      AND enrollments.student_id = auth.uid()
      AND enrollments.status = 'active'
    )
  );

-- ====================================
-- CHAPTERS TABLE POLICIES
-- ====================================

-- Students can view published chapters of enrolled courses
DROP POLICY IF EXISTS "students_view_course_chapters" ON chapters;
CREATE POLICY "students_view_course_chapters" ON chapters
  FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.course_id = chapters.course_id
      AND enrollments.student_id = auth.uid()
      AND enrollments.status = 'active'
    )
  );

-- ====================================
-- CHAPTER_CONTENTS TABLE POLICIES
-- ====================================

-- Students can view published chapter contents of enrolled courses
DROP POLICY IF EXISTS "students_view_chapter_contents" ON chapter_contents;
CREATE POLICY "students_view_chapter_contents" ON chapter_contents
  FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM chapters
      INNER JOIN enrollments ON enrollments.course_id = chapters.course_id
      WHERE chapters.id = chapter_contents.chapter_id
      AND enrollments.student_id = auth.uid()
      AND enrollments.status = 'active'
    )
  );

-- ====================================
-- ASSIGNMENTS TABLE POLICIES
-- ====================================

-- Students can view published assignments for their enrolled courses
DROP POLICY IF EXISTS "students_view_assignments" ON assignments;
CREATE POLICY "students_view_assignments" ON assignments
  FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.course_id = assignments.course_id
      AND enrollments.student_id = auth.uid()
      AND enrollments.status = 'active'
    )
  );

-- ====================================
-- SUBMISSIONS TABLE POLICIES
-- ====================================

-- Students can view their own submissions
CREATE POLICY "submissions_select_own" ON submissions
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can insert their own submissions
CREATE POLICY "submissions_insert_own" ON submissions
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Students can update their own draft submissions
CREATE POLICY "submissions_update_own_draft" ON submissions
  FOR UPDATE
  USING (student_id = auth.uid() AND status IN ('draft', 'in_progress'))
  WITH CHECK (student_id = auth.uid() AND status IN ('draft', 'in_progress', 'submitted'));

-- ====================================
-- ATTENDANCE TABLE POLICIES
-- ====================================

-- Students can view their own attendance records
CREATE POLICY "students_view_own_attendance" ON attendance
  FOR SELECT
  USING (user_id = auth.uid());

-- ====================================
-- NOTIFICATIONS TABLE POLICIES
-- ====================================

-- Students can view their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Students can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ====================================
-- COURSE_PROGRESS TABLE POLICIES
-- ====================================

-- Students can view their own progress
CREATE POLICY "course_progress_select_own" ON course_progress
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can insert/update their own progress
CREATE POLICY "course_progress_upsert_own" ON course_progress
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "course_progress_update_own" ON course_progress
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- ====================================
-- CERTIFICATES TABLE POLICIES
-- ====================================

-- Create certificates table if it doesn't exist
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  certificate_name text NOT NULL,
  certificate_url text,
  issued_at timestamptz DEFAULT now(),
  issued_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Students can view their own certificates
CREATE POLICY "certificates_select_own" ON certificates
  FOR SELECT
  USING (student_id = auth.uid());

-- ====================================
-- CREATE STUDENT PROGRESS VIEW
-- ====================================

CREATE OR REPLACE VIEW student_progress_view AS
SELECT 
  e.student_id,
  e.course_id,
  c.name AS course_name,
  c.title,
  c.description,
  c.grade,
  c.subject,
  c.thumbnail_url,
  c.release_type,
  e.progress_percentage,
  e.last_accessed,
  e.status,
  
  -- Count total chapters
  (SELECT COUNT(*) FROM chapters WHERE course_id = c.id AND is_published = true) AS total_chapters,
  
  -- Count completed chapters
  (SELECT COUNT(*) FROM course_progress cp 
   WHERE cp.course_id = c.id 
   AND cp.student_id = e.student_id 
   AND cp.completed = true) AS completed_chapters,
  
  -- Count total assignments
  (SELECT COUNT(*) FROM assignments WHERE course_id = c.id AND is_published = true) AS total_assignments,
  
  -- Count completed assignments
  (SELECT COUNT(*) FROM submissions s 
   INNER JOIN assignments a ON a.id = s.assignment_id
   WHERE a.course_id = c.id 
   AND s.student_id = e.student_id 
   AND s.status = 'submitted') AS completed_assignments,
  
  -- Calculate average grade
  (SELECT AVG(grade) FROM submissions s 
   INNER JOIN assignments a ON a.id = s.assignment_id
   WHERE a.course_id = c.id 
   AND s.student_id = e.student_id 
   AND s.grade IS NOT NULL) AS average_grade

FROM enrollments e
INNER JOIN courses c ON c.id = e.course_id
WHERE e.status = 'active';

-- Grant access to view
GRANT SELECT ON student_progress_view TO authenticated;

-- ====================================
-- CREATE STUDENT_PROGRESS TABLE IF NOT EXISTS
-- ====================================

CREATE TABLE IF NOT EXISTS course_progress (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE CASCADE,
  content_id uuid,
  completed boolean DEFAULT false,
  progress_percent decimal(5,2) DEFAULT 0,
  time_spent_minutes integer DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, chapter_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_course_progress_student ON course_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_chapter ON course_progress(chapter_id);

-- ====================================
-- FUNCTION: Update Last Login
-- ====================================

CREATE OR REPLACE FUNCTION update_student_last_login()
RETURNS TRIGGER AS $$
BEGIN
  -- Update students table last_login if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    EXECUTE format('UPDATE students SET last_login = NOW() WHERE profile_id = %L', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================
-- FUNCTION: Auto-calculate course progress
-- ====================================

CREATE OR REPLACE FUNCTION update_course_progress()
RETURNS TRIGGER AS $$
DECLARE
  total_chapters integer;
  completed_chapters integer;
  progress_pct decimal(5,2);
BEGIN
  -- Get total published chapters for the course
  SELECT COUNT(*) INTO total_chapters
  FROM chapters
  WHERE course_id = NEW.course_id AND is_published = true;

  -- Get completed chapters for this student
  SELECT COUNT(*) INTO completed_chapters
  FROM course_progress
  WHERE student_id = NEW.student_id
  AND course_id = NEW.course_id
  AND completed = true;

  -- Calculate progress percentage
  IF total_chapters > 0 THEN
    progress_pct := (completed_chapters::decimal / total_chapters::decimal) * 100;
  ELSE
    progress_pct := 0;
  END IF;

  -- Update enrollment progress
  UPDATE enrollments
  SET 
    progress_percentage = progress_pct,
    last_accessed = NOW(),
    status = CASE 
      WHEN progress_pct >= 100 THEN 'completed'
      WHEN progress_pct > 0 THEN 'active'
      ELSE status
    END
  WHERE student_id = NEW.student_id
  AND course_id = NEW.course_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for course progress
DROP TRIGGER IF EXISTS trigger_update_course_progress ON course_progress;
CREATE TRIGGER trigger_update_course_progress
  AFTER INSERT OR UPDATE ON course_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_course_progress();

-- ====================================
-- GRANT NECESSARY PERMISSIONS
-- ====================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION update_student_last_login() TO authenticated;
GRANT EXECUTE ON FUNCTION update_course_progress() TO authenticated;

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON POLICY "students_view_own_profile" ON profiles IS 'Students can view their own profile';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'students_select_own') THEN
      COMMENT ON POLICY "students_select_own" ON students IS 'Students can view their own student record';
    END IF;
  END IF;
END $$;
COMMENT ON POLICY "enrollments_select_own" ON enrollments IS 'Students can view their own enrollments';
COMMENT ON POLICY "submissions_select_own" ON submissions IS 'Students can view their own submissions';
COMMENT ON POLICY "notifications_select_own" ON notifications IS 'Students can view their own notifications';
COMMENT ON VIEW student_progress_view IS 'Comprehensive view of student progress across all courses';
COMMENT ON TABLE course_progress IS 'Tracks student progress through course chapters and content';






