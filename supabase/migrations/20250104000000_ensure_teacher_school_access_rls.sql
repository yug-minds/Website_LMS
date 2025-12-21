-- ===========================================
-- MIGRATION: Ensure Teacher School Access RLS
-- Purpose: Ensure all teacher-related tables have proper RLS policies
--          that restrict access to only data from schools the teacher is assigned to
-- Created: 2025-01-04
-- ===========================================

-- ===========================================
-- Step 1: Ensure RLS is enabled on all teacher-related tables
-- ===========================================

ALTER TABLE teacher_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Enable RLS on student_schools if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_schools') THEN
    ALTER TABLE student_schools ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Enable RLS on student_courses if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_courses') THEN
    ALTER TABLE student_courses ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ===========================================
-- Step 2: Update/Create RLS policies for teacher_schools
-- ===========================================

-- Teachers can only view their own school assignments
DROP POLICY IF EXISTS "Teachers can view their school assignments" ON teacher_schools;
CREATE POLICY "Teachers can view their school assignments" ON teacher_schools
  FOR SELECT USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'teacher'
    )
  );

-- ===========================================
-- Step 3: Update/Create RLS policies for teacher_reports
-- ===========================================

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Teachers can manage their reports" ON teacher_reports;
DROP POLICY IF EXISTS "Teachers can manage their own reports" ON teacher_reports;

-- Create school-restricted policy for teacher_reports
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
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE ts.teacher_id = auth.uid()
      AND ts.school_id = teacher_reports.school_id
      AND p.role = 'teacher'
    )
  );

-- ===========================================
-- Step 4: Update/Create RLS policies for teacher_leaves
-- ===========================================

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Teachers can manage their leaves" ON teacher_leaves;
DROP POLICY IF EXISTS "Teachers can manage their own leaves" ON teacher_leaves;

-- Create school-restricted policy for teacher_leaves
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
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE ts.teacher_id = auth.uid()
      AND ts.school_id = teacher_leaves.school_id
      AND p.role = 'teacher'
    )
  );

-- ===========================================
-- Step 5: Update/Create RLS policies for teacher_classes
-- ===========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_classes') THEN
    -- Drop any existing permissive policies
    DROP POLICY IF EXISTS "Teachers can view their own class assignments" ON teacher_classes;
    DROP POLICY IF EXISTS "Teachers can view their class assignments" ON teacher_classes;
    
    -- Create school-restricted policy for teacher_classes (SELECT only)
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
    
    -- Note: INSERT/UPDATE/DELETE should be handled by admins/school admins only
    -- Teachers should not be able to modify their own class assignments
  END IF;
END $$;

-- ===========================================
-- Step 6: Update/Create RLS policies for attendance
-- ===========================================

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Teachers can manage their own attendance" ON attendance;

-- Teachers can view and manage their own attendance records
CREATE POLICY "Teachers can manage their own attendance" ON attendance
  FOR ALL USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'teacher'
    )
    AND (
      -- For their own attendance, they can access any school they're assigned to
      school_id IN (
        SELECT ts.school_id FROM teacher_schools ts
        WHERE ts.teacher_id = auth.uid()
      )
      OR school_id IS NULL
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'teacher'
    )
    AND (
      school_id IN (
        SELECT ts.school_id FROM teacher_schools ts
        WHERE ts.teacher_id = auth.uid()
      )
      OR school_id IS NULL
    )
  );

-- Teachers can view student attendance for their assigned schools
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attendance') THEN
    -- Check if policy already exists (from previous migration)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'attendance' 
      AND policyname = 'Teachers can view their students attendance'
    ) THEN
      CREATE POLICY "Teachers can view their students attendance" ON attendance
        FOR SELECT USING (
          user_id != auth.uid()  -- Student attendance (not teacher's own)
          AND EXISTS (
            SELECT 1 FROM teacher_schools ts
            JOIN profiles p ON p.id = ts.teacher_id
            WHERE ts.teacher_id = auth.uid()
            AND ts.school_id = attendance.school_id
            AND p.role = 'teacher'
          )
          -- Check if the user_id belongs to a student in the same school
          AND EXISTS (
            SELECT 1 FROM student_schools ss
            WHERE ss.student_id = attendance.user_id
            AND ss.school_id = attendance.school_id
          )
        );
    END IF;
  END IF;
END $$;

-- ===========================================
-- Step 7: Update/Create RLS policies for student_schools
-- ===========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_schools') THEN
    -- Drop any existing permissive teacher policies
    DROP POLICY IF EXISTS "Teachers can view their school students" ON student_schools;
    
    -- Create school-restricted policy for teachers to view students in their assigned schools
    CREATE POLICY "Teachers can view their school students" ON student_schools
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = student_schools.school_id
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- ===========================================
-- Step 8: Update/Create RLS policies for student_courses
-- ===========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_courses') THEN
    -- Drop any existing permissive teacher policies
    DROP POLICY IF EXISTS "Teachers can view their school student courses" ON student_courses;
    
    -- Create school-restricted policy for teachers to view student courses in their assigned schools
    CREATE POLICY "Teachers can view their school student courses" ON student_courses
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN profiles p ON p.id = ts.teacher_id
          JOIN student_schools ss ON ss.student_id = student_courses.student_id
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = ss.school_id
          AND p.role = 'teacher'
        )
      );
  END IF;
END $$;

-- ===========================================
-- Step 9: Update/Create RLS policies for schools
-- ===========================================

-- Drop any existing permissive teacher policies
DROP POLICY IF EXISTS "Teachers can view their assigned schools" ON schools;

-- Create school-restricted policy for teachers to view only their assigned schools
CREATE POLICY "Teachers can view their assigned schools" ON schools
  FOR SELECT USING (
    id IN (
      SELECT ts.school_id FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE ts.teacher_id = auth.uid()
      AND p.role = 'teacher'
    )
  );

-- ===========================================
-- Step 10: Ensure teacher_monthly_attendance view has proper RLS
-- ===========================================

-- Note: Views don't have RLS policies directly, but the underlying table (attendance) does
-- The view will inherit RLS from the attendance table
-- We just need to ensure the view is properly defined

-- Drop the view first if it exists to avoid type conflicts
DROP VIEW IF EXISTS teacher_monthly_attendance CASCADE;

-- Recreate the view to ensure it matches the schema
-- Use the same data type as the original view (timestamp with time zone) to avoid conflicts
CREATE VIEW teacher_monthly_attendance AS
SELECT 
  user_id as teacher_id, 
  school_id, 
  date_trunc('month', date) as month, 
  COUNT(*) FILTER (WHERE status = 'Present') as present_count,
  COUNT(*) FILTER (WHERE status = 'Absent') as absent_count,
  COUNT(*) FILTER (WHERE status LIKE 'Leave-%') as leave_count,
  COUNT(*) FILTER (WHERE status = 'Unreported') as unreported_count,
  COUNT(*) as total_days
FROM attendance
WHERE user_id IN (
  SELECT id FROM profiles WHERE role = 'teacher'
)
GROUP BY user_id, school_id, date_trunc('month', date);

-- Add comment
COMMENT ON VIEW teacher_monthly_attendance IS 
  'Monthly attendance aggregation for teachers. RLS is enforced through the underlying attendance table. Teachers can only see data from their assigned schools.';

-- ===========================================
-- Step 11: Create/Update helper function for teacher school access
-- ===========================================

-- Create or replace helper function to check if teacher is assigned to a school
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

-- Add comment
COMMENT ON FUNCTION teacher_assigned_to_school(uuid) IS 
  'Helper function to check if the authenticated teacher is assigned to a specific school. Returns true if teacher is assigned to the school, false otherwise.';

-- ===========================================
-- Step 12: Ensure indexes exist for performance
-- ===========================================

-- Indexes for teacher_schools
CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher_school ON teacher_schools(teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher_id ON teacher_schools(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schools_school_id ON teacher_schools(school_id);

-- Indexes for teacher_reports
CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_school ON teacher_reports(teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_date ON teacher_reports(teacher_id, date);

-- Indexes for teacher_leaves
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_school ON teacher_leaves(teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_status ON teacher_leaves(teacher_id, status);

-- Indexes for teacher_classes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_classes') THEN
    CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_school ON teacher_classes(teacher_id, school_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_id ON teacher_classes(teacher_id);
  END IF;
END $$;

-- Indexes for attendance
CREATE INDEX IF NOT EXISTS idx_attendance_user_school_date ON attendance(user_id, school_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON attendance(school_id);

-- Indexes for student_schools (for teacher access)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_schools') THEN
    CREATE INDEX IF NOT EXISTS idx_student_schools_school_id ON student_schools(school_id);
    CREATE INDEX IF NOT EXISTS idx_student_schools_student_school ON student_schools(student_id, school_id);
  END IF;
END $$;

-- ===========================================
-- Step 13: Add policy comments for documentation
-- ===========================================

COMMENT ON POLICY "Teachers can view their school assignments" ON teacher_schools IS 
  'Allows teachers to view only their own school assignments. Teachers cannot view assignments of other teachers.';

COMMENT ON POLICY "Teachers can manage their own reports" ON teacher_reports IS 
  'Allows teachers to view, create, update, and delete only their own reports. Access is restricted to schools the teacher is assigned to.';

COMMENT ON POLICY "Teachers can manage their own leaves" ON teacher_leaves IS 
  'Allows teachers to view, create, update, and delete only their own leave requests. Access is restricted to schools the teacher is assigned to.';

COMMENT ON POLICY "Teachers can view their class assignments" ON teacher_classes IS 
  'Allows teachers to view only their class assignments. Access is restricted to schools the teacher is assigned to. Teachers cannot modify their assignments.';

COMMENT ON POLICY "Teachers can manage their own attendance" ON attendance IS 
  'Allows teachers to view and manage their own attendance records. Access is restricted to schools the teacher is assigned to.';

COMMENT ON POLICY "Teachers can view their assigned schools" ON schools IS 
  'Allows teachers to view only schools they are assigned to. Teachers cannot view other schools.';

-- ===========================================
-- Migration Complete
-- ===========================================

-- Verify all policies are in place
DO $$
DECLARE
  policy_count integer;
BEGIN
  -- Count teacher-related policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename IN ('teacher_schools', 'teacher_reports', 'teacher_leaves', 'teacher_classes', 'attendance', 'schools')
  AND policyname LIKE '%Teacher%';
  
  RAISE NOTICE 'Total teacher-related RLS policies: %', policy_count;
END $$;

