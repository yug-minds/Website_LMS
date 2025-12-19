-- Comprehensive RLS Policy Update for School Admin Security
-- This migration ensures that school admins can ONLY access data from their own school
-- Each school admin is isolated to their school_id

-- Step 1: Create a helper function to get the current user's school_id
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS uuid AS $$
BEGIN
  RETURN (
    SELECT school_id 
    FROM profiles 
    WHERE id = auth.uid() 
      AND role = 'school_admin'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Drop existing school_admin policies that don't filter by school_id
-- Only drop policies for tables that exist
DO $$
BEGIN
  -- Drop policies for tables that exist
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'schools') THEN
    DROP POLICY IF EXISTS "School admins can view their schools" ON schools;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'courses') THEN
    DROP POLICY IF EXISTS "School admins can view their school courses" ON courses;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_schools') THEN
    DROP POLICY IF EXISTS "School admins can view their school students" ON student_schools;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teachers') THEN
    DROP POLICY IF EXISTS "School admins can view their school teachers" ON teachers;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_attendance') THEN
    DROP POLICY IF EXISTS "School admins can view their school teacher attendance" ON teacher_attendance;
    DROP POLICY IF EXISTS "School admins can manage their school teacher attendance" ON teacher_attendance;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_performance') THEN
    DROP POLICY IF EXISTS "School admins can view their school teacher performance" ON teacher_performance;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'classes') THEN
    DROP POLICY IF EXISTS "School admins can manage their school classes" ON classes;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_classes') THEN
    DROP POLICY IF EXISTS "School admins can manage their school teacher classes" ON teacher_classes;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attendance') THEN
    DROP POLICY IF EXISTS "School admins can manage their school attendance" ON attendance;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    DROP POLICY IF EXISTS "School admins can manage their school students" ON students;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'join_codes') THEN
    DROP POLICY IF EXISTS "School admins can view their school join codes" ON join_codes;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_access') THEN
    DROP POLICY IF EXISTS "School Admin can access assigned courses" ON course_access;
  END IF;
END $$;

-- Step 3: Create secure school-admin policies that filter by school_id

-- Schools: School admins can only view their own school
CREATE POLICY "School admins can view their own school" ON schools
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = schools.id
    )
  );

-- Student Schools: School admins can only view/manage students from their school
CREATE POLICY "School admins can manage their school students" ON student_schools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = student_schools.school_id
    )
  );

-- Teacher Schools: School admins can only view/manage teachers from their school
CREATE POLICY "School admins can manage their school teachers" ON teacher_schools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = teacher_schools.school_id
    )
  );

-- Courses: School admins can only view/manage courses from their school
CREATE POLICY "School admins can manage their school courses" ON courses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = courses.school_id
    )
  );

-- Course Chapters: School admins can only manage chapters from their school's courses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_chapters') THEN
    DROP POLICY IF EXISTS "School admins can manage their school course chapters" ON course_chapters;
    CREATE POLICY "School admins can manage their school course chapters" ON course_chapters
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN courses c ON c.school_id = p.school_id
          WHERE p.id = auth.uid() 
            AND p.role = 'school_admin'
            AND course_chapters.course_id = c.id
        )
      );
  END IF;
END $$;

-- Teacher Reports: School admins can only view/manage reports from their school
CREATE POLICY "School admins can manage their school teacher reports" ON teacher_reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = teacher_reports.school_id
    )
  );

-- Teacher Leaves: School admins can only view/manage leaves from their school
CREATE POLICY "School admins can manage their school teacher leaves" ON teacher_leaves
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = teacher_leaves.school_id
    )
  );

-- Teacher Attendance: School admins can only view attendance from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_attendance') THEN
    DROP POLICY IF EXISTS "School admins can view their school teacher attendance" ON teacher_attendance;
    CREATE POLICY "School admins can view their school teacher attendance" ON teacher_attendance
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
            AND role = 'school_admin'
            AND school_id = teacher_attendance.school_id
        )
      );
  END IF;
END $$;

-- Teacher Performance: School admins can only view performance from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_performance') THEN
    DROP POLICY IF EXISTS "School admins can view their school teacher performance" ON teacher_performance;
    CREATE POLICY "School admins can view their school teacher performance" ON teacher_performance
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
            AND role = 'school_admin'
            AND school_id = teacher_performance.school_id
        )
      );
  END IF;
END $$;

-- Classes: School admins can only manage classes from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'classes') THEN
    DROP POLICY IF EXISTS "School admins can manage their school classes" ON classes;
    CREATE POLICY "School admins can manage their school classes" ON classes
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
            AND role = 'school_admin'
            AND school_id = classes.school_id
        )
      );
  END IF;
END $$;

-- Teacher Classes: School admins can only manage teacher-class assignments from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_classes') THEN
    DROP POLICY IF EXISTS "School admins can manage their school teacher classes" ON teacher_classes;
    CREATE POLICY "School admins can manage their school teacher classes" ON teacher_classes
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN classes c ON c.school_id = p.school_id
          WHERE p.id = auth.uid() 
            AND p.role = 'school_admin'
            AND teacher_classes.class_id = c.id
        )
      );
  END IF;
END $$;

-- Attendance: School admins can only manage attendance from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attendance') THEN
    DROP POLICY IF EXISTS "School admins can manage their school attendance" ON attendance;
    CREATE POLICY "School admins can manage their school attendance" ON attendance
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN classes c ON c.school_id = p.school_id
          WHERE p.id = auth.uid() 
            AND p.role = 'school_admin'
            AND attendance.class_id = c.id
        )
      );
  END IF;
END $$;

-- Students: School admins can only manage students from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    DROP POLICY IF EXISTS "School admins can manage their school students" ON students;
    CREATE POLICY "School admins can manage their school students" ON students
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN student_schools ss ON ss.student_id = students.id AND ss.school_id = p.school_id
          WHERE p.id = auth.uid() 
            AND p.role = 'school_admin'
        )
      );
  END IF;
END $$;

-- Join Codes: School admins can only view join codes from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'join_codes') THEN
    DROP POLICY IF EXISTS "School admins can view their school join codes" ON join_codes;
    CREATE POLICY "School admins can view their school join codes" ON join_codes
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
            AND role = 'school_admin'
            AND school_id = join_codes.school_id
        )
      );
  END IF;
END $$;

-- Course Access: School admins can only view course access from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_access') THEN
    DROP POLICY IF EXISTS "School Admin can access assigned courses" ON course_access;
    CREATE POLICY "School Admin can access assigned courses" ON course_access
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN courses c ON c.school_id = p.school_id
          WHERE p.id = auth.uid() 
            AND p.role = 'school_admin'
            AND course_access.course_id = c.id
        )
      );
  END IF;
END $$;

-- Student Courses: School admins can view student course enrollments from their school
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_courses') THEN
    DROP POLICY IF EXISTS "School admins can view their school student courses" ON student_courses;
    CREATE POLICY "School admins can view their school student courses" ON student_courses
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN student_schools ss ON ss.student_id = student_courses.student_id AND ss.school_id = p.school_id
          WHERE p.id = auth.uid() 
            AND p.role = 'school_admin'
        )
      );
  END IF;
END $$;

-- Notifications: School admins can view notifications from their school
-- Only apply policy if table exists and has school_id column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notifications') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'notifications' AND column_name = 'school_id'
    ) THEN
      DROP POLICY IF EXISTS "School admins can view their school notifications" ON notifications;
      CREATE POLICY "School admins can view their school notifications" ON notifications
        FOR SELECT USING (
          notifications.school_id IS NULL OR
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
              AND role = 'school_admin'
              AND school_id = notifications.school_id
          )
        );
    END IF;
  END IF;
END $$;

-- Comments: Create indexes for better performance on school_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_school_id_role ON profiles(school_id, role) WHERE role = 'school_admin';
CREATE INDEX IF NOT EXISTS idx_student_schools_school_id_active ON student_schools(school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_teacher_schools_school_id ON teacher_schools(school_id);
CREATE INDEX IF NOT EXISTS idx_courses_school_id_status ON courses(school_id, status);
CREATE INDEX IF NOT EXISTS idx_teacher_reports_school_id ON teacher_reports(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_school_id_status ON teacher_leaves(school_id, status);

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION get_user_school_id() TO authenticated;

COMMENT ON FUNCTION get_user_school_id() IS 'Returns the school_id of the current authenticated school_admin user. Used for RLS policy filtering.';

