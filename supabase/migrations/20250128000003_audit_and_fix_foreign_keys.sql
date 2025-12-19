-- ==========================================================
-- Phase 2: Foreign Key Constraints Audit and Fix
-- Date: 2025-01-28
-- Purpose: Audit all foreign key constraints and ensure proper ON DELETE actions
-- ==========================================================

-- ==========================================================
-- PART 1: Audit Current Foreign Key Constraints
-- ==========================================================

-- Create a function to list all foreign keys and their ON DELETE actions
CREATE OR REPLACE FUNCTION audit_foreign_keys()
RETURNS TABLE (
  table_name TEXT,
  constraint_name TEXT,
  column_name TEXT,
  foreign_table_name TEXT,
  foreign_column_name TEXT,
  on_delete_action TEXT,
  on_update_action TEXT
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.table_name::TEXT,
    tc.constraint_name::TEXT,
    kcu.column_name::TEXT,
    ccu.table_name::TEXT AS foreign_table_name,
    ccu.column_name::TEXT AS foreign_column_name,
    CASE 
      WHEN rc.delete_rule = 'CASCADE' THEN 'CASCADE'
      WHEN rc.delete_rule = 'SET NULL' THEN 'SET NULL'
      WHEN rc.delete_rule = 'RESTRICT' THEN 'RESTRICT'
      WHEN rc.delete_rule = 'NO ACTION' THEN 'NO ACTION'
      ELSE 'UNKNOWN'
    END::TEXT AS on_delete_action,
    CASE 
      WHEN rc.update_rule = 'CASCADE' THEN 'CASCADE'
      WHEN rc.update_rule = 'SET NULL' THEN 'SET NULL'
      WHEN rc.update_rule = 'RESTRICT' THEN 'RESTRICT'
      WHEN rc.update_rule = 'NO ACTION' THEN 'NO ACTION'
      ELSE 'UNKNOWN'
    END::TEXT AS on_update_action
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  LEFT JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  ORDER BY tc.table_name, tc.constraint_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit_foreign_keys() IS 'Lists all foreign key constraints with their ON DELETE/UPDATE actions';

-- ==========================================================
-- PART 2: Fix Foreign Keys Missing ON DELETE Actions
-- ==========================================================

-- Note: Most foreign keys should already have ON DELETE CASCADE or SET NULL
-- This section identifies and fixes any that are missing proper actions

-- ==========================================================
-- PART 3: Ensure Critical Foreign Keys Have Proper Actions
-- ==========================================================

-- profiles.school_id -> schools.id
-- Should be SET NULL (school can be deleted, but profile should remain)
DO $$
BEGIN
  -- Check if constraint exists and has correct action
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'profiles'
    AND tc.constraint_name LIKE '%school_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'SET NULL'
  ) THEN
    -- Drop and recreate with SET NULL
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_school_id_fkey;
    ALTER TABLE profiles 
    ADD CONSTRAINT profiles_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Fixed profiles.school_id foreign key to use SET NULL';
  END IF;
END $$;

-- student_schools.student_id -> profiles.id
-- Should be CASCADE (if profile deleted, enrollment should be deleted)
-- Verify it exists and has CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'student_schools'
    AND tc.constraint_name LIKE '%student_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE student_schools DROP CONSTRAINT IF EXISTS student_schools_student_id_fkey;
    ALTER TABLE student_schools 
    ADD CONSTRAINT student_schools_student_id_fkey 
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed student_schools.student_id foreign key to use CASCADE';
  END IF;
END $$;

-- student_schools.school_id -> schools.id
-- Should be CASCADE (if school deleted, enrollment should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'student_schools'
    AND tc.constraint_name LIKE '%school_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE student_schools DROP CONSTRAINT IF EXISTS student_schools_school_id_fkey;
    ALTER TABLE student_schools 
    ADD CONSTRAINT student_schools_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed student_schools.school_id foreign key to use CASCADE';
  END IF;
END $$;

-- teacher_schools.teacher_id -> profiles.id
-- Should be CASCADE (if profile deleted, assignment should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'teacher_schools'
    AND tc.constraint_name LIKE '%teacher_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE teacher_schools DROP CONSTRAINT IF EXISTS teacher_schools_teacher_id_fkey;
    ALTER TABLE teacher_schools 
    ADD CONSTRAINT teacher_schools_teacher_id_fkey 
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed teacher_schools.teacher_id foreign key to use CASCADE';
  END IF;
END $$;

-- teacher_schools.school_id -> schools.id
-- Should be CASCADE (if school deleted, assignment should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'teacher_schools'
    AND tc.constraint_name LIKE '%school_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE teacher_schools DROP CONSTRAINT IF EXISTS teacher_schools_school_id_fkey;
    ALTER TABLE teacher_schools 
    ADD CONSTRAINT teacher_schools_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed teacher_schools.school_id foreign key to use CASCADE';
  END IF;
END $$;

-- courses.school_id -> schools.id
-- Should be SET NULL (course can exist without school, but school reference should be cleared)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'courses'
    AND tc.constraint_name LIKE '%school_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'SET NULL'
  ) THEN
    ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_school_id_fkey;
    ALTER TABLE courses 
    ADD CONSTRAINT courses_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Fixed courses.school_id foreign key to use SET NULL';
  END IF;
END $$;

-- chapters.course_id -> courses.id
-- Should be CASCADE (if course deleted, chapters should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'chapters'
    AND tc.constraint_name LIKE '%course_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE chapters DROP CONSTRAINT IF EXISTS chapters_course_id_fkey;
    ALTER TABLE chapters 
    ADD CONSTRAINT chapters_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed chapters.course_id foreign key to use CASCADE';
  END IF;
END $$;

-- enrollments.student_id -> profiles.id
-- Should be CASCADE (if student deleted, enrollments should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'enrollments'
    AND tc.constraint_name LIKE '%student_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey;
    ALTER TABLE enrollments 
    ADD CONSTRAINT enrollments_student_id_fkey 
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed enrollments.student_id foreign key to use CASCADE';
  END IF;
END $$;

-- enrollments.course_id -> courses.id
-- Should be CASCADE (if course deleted, enrollments should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'enrollments'
    AND tc.constraint_name LIKE '%course_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_course_id_fkey;
    ALTER TABLE enrollments 
    ADD CONSTRAINT enrollments_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed enrollments.course_id foreign key to use CASCADE';
  END IF;
END $$;

-- enrollments.class_id -> classes.id
-- Should be SET NULL (if class deleted, enrollment can remain but class reference cleared)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'enrollments'
    AND tc.constraint_name LIKE '%class_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'SET NULL'
  ) THEN
    ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_class_id_fkey;
    ALTER TABLE enrollments 
    ADD CONSTRAINT enrollments_class_id_fkey 
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Fixed enrollments.class_id foreign key to use SET NULL';
  END IF;
END $$;

-- teacher_reports.teacher_id -> profiles.id
-- Should be CASCADE (if teacher deleted, reports should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'teacher_reports'
    AND tc.constraint_name LIKE '%teacher_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE teacher_reports DROP CONSTRAINT IF EXISTS teacher_reports_teacher_id_fkey;
    ALTER TABLE teacher_reports 
    ADD CONSTRAINT teacher_reports_teacher_id_fkey 
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed teacher_reports.teacher_id foreign key to use CASCADE';
  END IF;
END $$;

-- teacher_reports.school_id -> schools.id
-- Should be CASCADE (if school deleted, reports should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'teacher_reports'
    AND tc.constraint_name LIKE '%school_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE teacher_reports DROP CONSTRAINT IF EXISTS teacher_reports_school_id_fkey;
    ALTER TABLE teacher_reports 
    ADD CONSTRAINT teacher_reports_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed teacher_reports.school_id foreign key to use CASCADE';
  END IF;
END $$;

-- teacher_leaves.teacher_id -> profiles.id
-- Should be CASCADE (if teacher deleted, leaves should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'teacher_leaves'
    AND tc.constraint_name LIKE '%teacher_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE teacher_leaves DROP CONSTRAINT IF EXISTS teacher_leaves_teacher_id_fkey;
    ALTER TABLE teacher_leaves 
    ADD CONSTRAINT teacher_leaves_teacher_id_fkey 
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed teacher_leaves.teacher_id foreign key to use CASCADE';
  END IF;
END $$;

-- teacher_leaves.school_id -> schools.id
-- Should be CASCADE (if school deleted, leaves should be deleted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'teacher_leaves'
    AND tc.constraint_name LIKE '%school_id%'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE teacher_leaves DROP CONSTRAINT IF EXISTS teacher_leaves_school_id_fkey;
    ALTER TABLE teacher_leaves 
    ADD CONSTRAINT teacher_leaves_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed teacher_leaves.school_id foreign key to use CASCADE';
  END IF;
END $$;

-- ==========================================================
-- PART 4: Create Summary Report Function
-- ==========================================================

-- Function to generate a summary of all foreign keys
CREATE OR REPLACE FUNCTION foreign_key_summary()
RETURNS TABLE (
  table_name TEXT,
  constraint_name TEXT,
  column_name TEXT,
  references_table TEXT,
  on_delete_action TEXT,
  recommendation TEXT
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.table_name::TEXT,
    tc.constraint_name::TEXT,
    kcu.column_name::TEXT,
    ccu.table_name::TEXT AS references_table,
    CASE 
      WHEN rc.delete_rule = 'CASCADE' THEN 'CASCADE'
      WHEN rc.delete_rule = 'SET NULL' THEN 'SET NULL'
      WHEN rc.delete_rule = 'RESTRICT' THEN 'RESTRICT'
      WHEN rc.delete_rule = 'NO ACTION' THEN 'NO ACTION'
      ELSE 'UNKNOWN'
    END::TEXT AS on_delete_action,
    CASE 
      WHEN rc.delete_rule = 'CASCADE' THEN 'OK - Dependent records deleted'
      WHEN rc.delete_rule = 'SET NULL' THEN 'OK - Reference cleared'
      WHEN rc.delete_rule = 'RESTRICT' THEN 'OK - Prevents deletion'
      WHEN rc.delete_rule = 'NO ACTION' THEN 'WARNING - May cause issues'
      ELSE 'UNKNOWN'
    END::TEXT AS recommendation
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  LEFT JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  ORDER BY tc.table_name, tc.constraint_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION foreign_key_summary() IS 'Generates a summary report of all foreign key constraints with recommendations';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION audit_foreign_keys() TO authenticated;
GRANT EXECUTE ON FUNCTION foreign_key_summary() TO authenticated;

