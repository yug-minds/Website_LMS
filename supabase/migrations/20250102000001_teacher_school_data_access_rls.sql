-- ===========================================
-- MIGRATION: Teacher School Data Access RLS
-- Purpose: Ensure teachers can only access data from their assigned schools
-- Supports multi-school assignments (teacher can be assigned to multiple schools)
-- ===========================================

-- Helper function to check if teacher is assigned to a school
CREATE OR REPLACE FUNCTION teacher_assigned_to_school(school_id_param uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teacher_schools ts
    JOIN profiles p ON p.id = ts.teacher_id
    WHERE ts.teacher_id = auth.uid()
    AND ts.school_id = school_id_param
    AND p.role = 'teacher'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================
-- STUDENTS TABLE - Teachers can view students from assigned schools
-- Note: Skipped if students table doesn't exist (student data is managed via student_schools)
-- =========================================

-- Skip students table policies if table doesn't exist
-- Student access is handled via student_schools table policies

-- =========================================
-- ENROLLMENTS TABLE - Teachers can view enrollments for their assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'enrollments') THEN
    DROP POLICY IF EXISTS "Teachers can view their school enrollments" ON enrollments;
    -- Only create policy if students table exists, otherwise use student_schools
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      CREATE POLICY "Teachers can view their school enrollments" ON enrollments
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN students s ON s.id = enrollments.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = s.school_id
            AND p.role = 'teacher'
          )
        );
    ELSE
      -- Fallback: use student_schools if students table doesn't exist
      CREATE POLICY "Teachers can view their school enrollments" ON enrollments
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN student_schools ss ON ss.student_id = enrollments.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = ss.school_id
            AND p.role = 'teacher'
          )
        );
    END IF;
  END IF;
END $$;

-- =========================================
-- COURSES TABLE - Teachers can view courses from assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'courses') THEN
    DROP POLICY IF EXISTS "Teachers can view their school courses" ON courses;
    CREATE POLICY "Teachers can view their school courses" ON courses
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = courses.school_id
          AND p.role = 'teacher'
        )
        OR courses.school_id IS NULL  -- Allow global courses
      );
  END IF;
END $$;

-- =========================================
-- COURSE_ACCESS TABLE - Already has policy, but ensure it's correct
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_access') THEN
    DROP POLICY IF EXISTS "Teachers view their school courses" ON course_access;
    CREATE POLICY "Teachers view their school courses" ON course_access
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = course_access.school_id
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- CHAPTERS TABLE - Teachers can view chapters for courses in assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'chapters') THEN
    DROP POLICY IF EXISTS "Teachers can view their school chapters" ON chapters;
    CREATE POLICY "Teachers can view their school chapters" ON chapters
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN courses c ON c.id = chapters.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- CHAPTER_CONTENTS TABLE - Teachers can view chapter contents for assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'chapter_contents') THEN
    DROP POLICY IF EXISTS "Teachers can view their school chapter contents" ON chapter_contents;
    CREATE POLICY "Teachers can view their school chapter contents" ON chapter_contents
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN chapters ch ON ch.id = chapter_contents.chapter_id
          JOIN courses c ON c.id = ch.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- ASSIGNMENTS TABLE - Teachers can view assignments for assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'assignments') THEN
    DROP POLICY IF EXISTS "Teachers can view their school assignments" ON assignments;
    CREATE POLICY "Teachers can view their school assignments" ON assignments
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN courses c ON c.id = assignments.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- ASSIGNMENT_SUBMISSIONS TABLE - Teachers can view and grade submissions
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'assignment_submissions') THEN
    DROP POLICY IF EXISTS "Teachers can view and grade submissions" ON assignment_submissions;
    DROP POLICY IF EXISTS "Teachers can update submission grades" ON assignment_submissions;
    
    CREATE POLICY "Teachers can view their school assignment submissions" ON assignment_submissions
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN assignments a ON a.id = assignment_submissions.assignment_id
          JOIN courses c ON c.id = a.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );

    CREATE POLICY "Teachers can grade their school assignment submissions" ON assignment_submissions
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN assignments a ON a.id = assignment_submissions.assignment_id
          JOIN courses c ON c.id = a.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- Also check for submissions table (if it exists separately)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'submissions') THEN
    DROP POLICY IF EXISTS "Teachers can view and grade submissions" ON submissions;
    DROP POLICY IF EXISTS "Teachers can update submission grades" ON submissions;
    
    CREATE POLICY "Teachers can view their school submissions" ON submissions
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN assignments a ON a.id = submissions.assignment_id
          JOIN courses c ON c.id = a.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );

    CREATE POLICY "Teachers can grade their school submissions" ON submissions
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN assignments a ON a.id = submissions.assignment_id
          JOIN courses c ON c.id = a.course_id
          WHERE ts.teacher_id = auth.uid()
          AND (ts.school_id = c.school_id OR c.school_id IS NULL)
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- COURSE_PROGRESS TABLE - Teachers can view progress for students in assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_progress') THEN
    DROP POLICY IF EXISTS "Teachers can view their school course progress" ON course_progress;
    -- Only create policy if students table exists
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      CREATE POLICY "Teachers can view their school course progress" ON course_progress
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN students s ON s.id = course_progress.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = s.school_id
            AND p.role = 'teacher'
          )
        );
    ELSE
      -- Fallback: use student_schools
      CREATE POLICY "Teachers can view their school course progress" ON course_progress
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN student_schools ss ON ss.student_id = course_progress.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = ss.school_id
            AND p.role = 'teacher'
          )
        );
    END IF;
  END IF;
END $$;

-- Also check for student_progress table (if it exists separately)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_progress') THEN
    DROP POLICY IF EXISTS "Teachers can view student progress" ON student_progress;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      CREATE POLICY "Teachers can view their school student progress" ON student_progress
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN students s ON s.id = student_progress.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = s.school_id
            AND p.role = 'teacher'
          )
        );
    ELSE
      -- Fallback: use student_schools
      CREATE POLICY "Teachers can view their school student progress" ON student_progress
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN student_schools ss ON ss.student_id = student_progress.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = ss.school_id
            AND p.role = 'teacher'
          )
        );
    END IF;
  END IF;
END $$;

-- =========================================
-- ATTENDANCE TABLE - Teachers can view student attendance for assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attendance') THEN
    DROP POLICY IF EXISTS "Teachers can view their students attendance" ON attendance;
    CREATE POLICY "Teachers can view their students attendance" ON attendance
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = attendance.school_id
          AND p.role = 'teacher'
          AND attendance.user_id != auth.uid()  -- Student attendance (not teacher's own)
        )
        OR attendance.user_id = auth.uid()  -- Teacher's own attendance
      );
  END IF;
END $$;

-- =========================================
-- DOUBTS TABLE - Teachers can view and respond to doubts from assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'doubts') THEN
    DROP POLICY IF EXISTS "Teachers can view and respond to doubts" ON doubts;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      CREATE POLICY "Teachers can view their school doubts" ON doubts
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN students s ON s.id = doubts.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = s.school_id
            AND p.role = 'teacher'
          )
        );

      CREATE POLICY "Teachers can respond to their school doubts" ON doubts
        FOR UPDATE USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN students s ON s.id = doubts.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = s.school_id
            AND p.role = 'teacher'
          )
        );
    ELSE
      -- Fallback: use student_schools
      CREATE POLICY "Teachers can view their school doubts" ON doubts
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN student_schools ss ON ss.student_id = doubts.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = ss.school_id
            AND p.role = 'teacher'
          )
        );

      CREATE POLICY "Teachers can respond to their school doubts" ON doubts
        FOR UPDATE USING (
          EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN student_schools ss ON ss.student_id = doubts.student_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = ss.school_id
            AND p.role = 'teacher'
          )
        );
    END IF;
  END IF;
END $$;

-- =========================================
-- NOTIFICATIONS TABLE - Teachers can view notifications for assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notifications') THEN
    DROP POLICY IF EXISTS "Teachers can view their school notifications" ON notifications;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      CREATE POLICY "Teachers can view their school notifications" ON notifications
        FOR SELECT USING (
          user_id = auth.uid()  -- Their own notifications
          OR EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            JOIN students s ON s.profile_id = notifications.user_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = s.school_id
            AND p.role = 'teacher'
          )
        );
    ELSE
      -- Fallback: simpler policy without students table
      CREATE POLICY "Teachers can view their school notifications" ON notifications
        FOR SELECT USING (
          user_id = auth.uid()  -- Their own notifications
          OR EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            WHERE ts.teacher_id = auth.uid()
            AND p.role = 'teacher'
          )
        );
    END IF;
  END IF;
END $$;

-- =========================================
-- CLASSES TABLE - Teachers can view classes from assigned schools
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'classes') THEN
    DROP POLICY IF EXISTS "Teachers can view their assigned classes" ON classes;
    CREATE POLICY "Teachers can view their assigned classes" ON classes
      FOR SELECT USING (
        id IN (
          SELECT tc.class_id FROM teacher_classes tc
          WHERE tc.teacher_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = classes.school_id
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- TEACHER_REPORTS - Ensure school restriction (already exists, but verify)
-- =========================================

-- Update teacher reports policy to ensure school restriction
DROP POLICY IF EXISTS "Teachers can manage their own reports" ON teacher_reports;
CREATE POLICY "Teachers can manage their own reports" ON teacher_reports
  FOR ALL USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE ts.teacher_id = auth.uid()
      AND ts.school_id = teacher_reports.school_id
      AND p.role = 'teacher'
    )
  );

-- =========================================
-- TEACHER_LEAVES - Ensure school restriction (already exists, but verify)
-- =========================================

-- Update teacher leaves policy to ensure school restriction
DROP POLICY IF EXISTS "Teachers can manage their own leaves" ON teacher_leaves;
CREATE POLICY "Teachers can manage their own leaves" ON teacher_leaves
  FOR ALL USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE ts.teacher_id = auth.uid()
      AND ts.school_id = teacher_leaves.school_id
      AND p.role = 'teacher'
    )
  );

-- =========================================
-- TEACHER_CLASSES - Ensure school restriction
-- =========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_classes') THEN
    DROP POLICY IF EXISTS "Teachers can view their class assignments" ON teacher_classes;
    CREATE POLICY "Teachers can view their class assignments" ON teacher_classes
      FOR SELECT USING (
        teacher_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = teacher_classes.school_id
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- =========================================
-- SCHOOLS TABLE - Teachers can view their assigned schools
-- =========================================

DROP POLICY IF EXISTS "Teachers can view their assigned schools" ON schools;
CREATE POLICY "Teachers can view their assigned schools" ON schools
  FOR SELECT USING (
    id IN (
      SELECT ts.school_id FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE ts.teacher_id = auth.uid()
      AND p.role = 'teacher'
    )
  );

-- =========================================
-- INDEXES FOR PERFORMANCE
-- =========================================

-- Ensure indexes exist for efficient queries
CREATE INDEX IF NOT EXISTS idx_teacher_schools_lookup ON teacher_schools(teacher_id, school_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'enrollments') THEN
    CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'courses') THEN
    CREATE INDEX IF NOT EXISTS idx_courses_school_id ON courses(school_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attendance') THEN
    CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON attendance(school_id);
  END IF;
END $$;

-- =========================================
-- COMMENTS
-- =========================================

COMMENT ON FUNCTION teacher_assigned_to_school(uuid) IS 'Helper function to check if a teacher is assigned to a specific school';

-- Add comments only if tables and policies exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'enrollments') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'enrollments' AND policyname = 'Teachers can view their school enrollments') THEN
      COMMENT ON POLICY "Teachers can view their school enrollments" ON enrollments IS 'Allows teachers to view enrollments for students in their assigned schools';
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'courses') THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'courses' AND policyname = 'Teachers can view their school courses') THEN
      COMMENT ON POLICY "Teachers can view their school courses" ON courses IS 'Allows teachers to view courses from their assigned schools or global courses';
    END IF;
  END IF;
END $$;

