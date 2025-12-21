-- ==========================================================
-- Migration: Fix Data Integrity Issues
-- Date: 2025-01-27
-- Purpose: Fix all data inconsistency, synchronization, and orphaned record issues
-- ==========================================================

-- ==========================================================
-- PART 1: Create Triggers to Sync profiles.school_id
-- ==========================================================

-- Function to sync profiles.school_id from student_schools (for active enrollment)
CREATE OR REPLACE FUNCTION sync_profile_school_id_from_student_schools()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only sync if this is an active enrollment
  IF NEW.is_active = true THEN
    UPDATE profiles 
    SET school_id = NEW.school_id 
    WHERE id = NEW.student_id AND role = 'student';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for student_schools INSERT/UPDATE
DROP TRIGGER IF EXISTS sync_profile_school_id_student ON student_schools;
CREATE TRIGGER sync_profile_school_id_student
  AFTER INSERT OR UPDATE ON student_schools
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION sync_profile_school_id_from_student_schools();

-- Function to sync profiles.school_id from school_admins
CREATE OR REPLACE FUNCTION sync_profile_school_id_from_school_admins()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles 
  SET school_id = NEW.school_id 
  WHERE id = NEW.profile_id AND role = 'school_admin';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for school_admins INSERT/UPDATE
DROP TRIGGER IF EXISTS sync_profile_school_id_school_admin ON school_admins;
CREATE TRIGGER sync_profile_school_id_school_admin
  AFTER INSERT OR UPDATE ON school_admins
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_school_id_from_school_admins();

-- Function to sync profiles.school_id from teacher_schools (primary school only)
CREATE OR REPLACE FUNCTION sync_profile_school_id_from_teacher_schools()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only sync if this is the primary school assignment
  IF NEW.is_primary = true THEN
    UPDATE profiles 
    SET school_id = NEW.school_id 
    WHERE id = NEW.teacher_id AND role = 'teacher';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for teacher_schools INSERT/UPDATE
DROP TRIGGER IF EXISTS sync_profile_school_id_teacher ON teacher_schools;
CREATE TRIGGER sync_profile_school_id_teacher
  AFTER INSERT OR UPDATE ON teacher_schools
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION sync_profile_school_id_from_teacher_schools();

-- Function to clear profiles.school_id when student_schools is deactivated
CREATE OR REPLACE FUNCTION clear_profile_school_id_on_deactivation()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If enrollment is deactivated and this was the active one, clear school_id
  IF OLD.is_active = true AND NEW.is_active = false THEN
    -- Check if there are any other active enrollments
    IF NOT EXISTS (
      SELECT 1 FROM student_schools 
      WHERE student_id = NEW.student_id 
      AND is_active = true 
      AND id != NEW.id
    ) THEN
      UPDATE profiles 
      SET school_id = NULL 
      WHERE id = NEW.student_id AND role = 'student';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to clear school_id on deactivation
DROP TRIGGER IF EXISTS clear_profile_school_id_deactivation ON student_schools;
CREATE TRIGGER clear_profile_school_id_deactivation
  AFTER UPDATE ON student_schools
  FOR EACH ROW
  WHEN (OLD.is_active = true AND NEW.is_active = false)
  EXECUTE FUNCTION clear_profile_school_id_on_deactivation();

-- ==========================================================
-- PART 2: Fix Existing Data Inconsistencies
-- ==========================================================

-- Fix profiles.school_id for students based on active student_schools
UPDATE profiles p
SET school_id = ss.school_id
FROM (
  SELECT DISTINCT ON (student_id) 
    student_id, 
    school_id
  FROM student_schools
  WHERE is_active = true
  ORDER BY student_id, enrolled_at DESC
) ss
WHERE p.id = ss.student_id 
  AND p.role = 'student'
  AND (p.school_id IS DISTINCT FROM ss.school_id);

-- Fix profiles.school_id for school_admins
UPDATE profiles p
SET school_id = sa.school_id
FROM school_admins sa
WHERE p.id = sa.profile_id 
  AND p.role = 'school_admin'
  AND (p.school_id IS DISTINCT FROM sa.school_id);

-- Fix profiles.school_id for teachers based on primary school
UPDATE profiles p
SET school_id = ts.school_id
FROM teacher_schools ts
WHERE p.id = ts.teacher_id 
  AND p.role = 'teacher'
  AND ts.is_primary = true
  AND (p.school_id IS DISTINCT FROM ts.school_id);

-- ==========================================================
-- PART 3: Clean Up Orphaned Records
-- ==========================================================

-- Delete orphaned student_schools records
DELETE FROM student_schools ss
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = ss.school_id
);

-- Delete orphaned teacher_schools records
DELETE FROM teacher_schools ts
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = ts.school_id
);

-- Delete orphaned course_access records
DELETE FROM course_access ca
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = ca.school_id
);

-- Delete orphaned school_admins records
DELETE FROM school_admins sa
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = sa.school_id
);

-- Delete orphaned courses (set school_id to NULL if course should exist without school)
-- Note: Only delete if course has no content, otherwise set school_id to NULL
UPDATE courses c
SET school_id = NULL
WHERE c.school_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM schools s WHERE s.id = c.school_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM chapters ch WHERE ch.course_id = c.id
  );

-- Delete courses that are truly orphaned (no school, no content)
DELETE FROM courses c
WHERE c.school_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM schools s WHERE s.id = c.school_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM chapters ch WHERE ch.course_id = c.id
  );

-- Delete orphaned classes
DELETE FROM classes c
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = c.school_id
);

-- Delete orphaned join_codes
DELETE FROM join_codes jc
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = jc.school_id
);

-- Delete orphaned rooms
DELETE FROM rooms r
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE s.id = r.school_id
);

-- ==========================================================
-- PART 4: Add Validation Constraints
-- ==========================================================

-- Ensure student_schools.student_id references a student profile
-- (This should already be enforced by FK, but adding check for role)
CREATE OR REPLACE FUNCTION validate_student_schools_role()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = NEW.student_id AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'student_id must reference a profile with role = student';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_student_schools_role_trigger ON student_schools;
CREATE TRIGGER validate_student_schools_role_trigger
  BEFORE INSERT OR UPDATE ON student_schools
  FOR EACH ROW
  EXECUTE FUNCTION validate_student_schools_role();

-- Ensure teacher_schools.teacher_id references a teacher profile
CREATE OR REPLACE FUNCTION validate_teacher_schools_role()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = NEW.teacher_id AND role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'teacher_id must reference a profile with role = teacher';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_teacher_schools_role_trigger ON teacher_schools;
CREATE TRIGGER validate_teacher_schools_role_trigger
  BEFORE INSERT OR UPDATE ON teacher_schools
  FOR EACH ROW
  EXECUTE FUNCTION validate_teacher_schools_role();

-- Ensure school_admins.profile_id references a school_admin profile
CREATE OR REPLACE FUNCTION validate_school_admins_role()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = NEW.profile_id AND role = 'school_admin'
  ) THEN
    RAISE EXCEPTION 'profile_id must reference a profile with role = school_admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_school_admins_role_trigger ON school_admins;
CREATE TRIGGER validate_school_admins_role_trigger
  BEFORE INSERT OR UPDATE ON school_admins
  FOR EACH ROW
  EXECUTE FUNCTION validate_school_admins_role();

-- ==========================================================
-- PART 5: Add Indexes for Performance
-- ==========================================================

-- Index for faster lookups when syncing profiles.school_id
CREATE INDEX IF NOT EXISTS idx_student_schools_active_lookup 
ON student_schools(student_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_teacher_schools_primary_lookup 
ON teacher_schools(teacher_id, is_primary) 
WHERE is_primary = true;

-- ==========================================================
-- PART 6: Create Helper Function for Data Validation
-- ==========================================================

-- Function to check data integrity
CREATE OR REPLACE FUNCTION check_data_integrity()
RETURNS TABLE (
  issue_type TEXT,
  table_name TEXT,
  record_count BIGINT,
  description TEXT
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Students with mismatched school_id
  SELECT 
    'data_inconsistency'::TEXT,
    'profiles vs student_schools'::TEXT,
    COUNT(*)::BIGINT,
    'Students with profiles.school_id != student_schools.school_id'::TEXT
  FROM profiles p
  LEFT JOIN student_schools ss ON ss.student_id = p.id AND ss.is_active = true
  WHERE p.role = 'student'
    AND (p.school_id IS DISTINCT FROM ss.school_id)
  
  UNION ALL
  
  -- School admins with mismatched school_id
  SELECT 
    'data_inconsistency'::TEXT,
    'profiles vs school_admins'::TEXT,
    COUNT(*)::BIGINT,
    'School admins with profiles.school_id != school_admins.school_id'::TEXT
  FROM profiles p
  JOIN school_admins sa ON sa.profile_id = p.id
  WHERE p.role = 'school_admin'
    AND p.school_id IS DISTINCT FROM sa.school_id
  
  UNION ALL
  
  -- Teachers with mismatched school_id (primary)
  SELECT 
    'data_inconsistency'::TEXT,
    'profiles vs teacher_schools'::TEXT,
    COUNT(*)::BIGINT,
    'Teachers with profiles.school_id != primary teacher_schools.school_id'::TEXT
  FROM profiles p
  JOIN teacher_schools ts ON ts.teacher_id = p.id AND ts.is_primary = true
  WHERE p.role = 'teacher'
    AND p.school_id IS DISTINCT FROM ts.school_id
  
  UNION ALL
  
  -- Orphaned student_schools
  SELECT 
    'orphaned_record'::TEXT,
    'student_schools'::TEXT,
    COUNT(*)::BIGINT,
    'student_schools records pointing to non-existent schools'::TEXT
  FROM student_schools ss
  LEFT JOIN schools s ON ss.school_id = s.id
  WHERE s.id IS NULL
  
  UNION ALL
  
  -- Orphaned teacher_schools
  SELECT 
    'orphaned_record'::TEXT,
    'teacher_schools'::TEXT,
    COUNT(*)::BIGINT,
    'teacher_schools records pointing to non-existent schools'::TEXT
  FROM teacher_schools ts
  LEFT JOIN schools s ON ts.school_id = s.id
  WHERE s.id IS NULL
  
  UNION ALL
  
  -- Orphaned course_access
  SELECT 
    'orphaned_record'::TEXT,
    'course_access'::TEXT,
    COUNT(*)::BIGINT,
    'course_access records pointing to non-existent schools'::TEXT
  FROM course_access ca
  LEFT JOIN schools s ON ca.school_id = s.id
  WHERE s.id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_data_integrity() TO authenticated;

COMMENT ON FUNCTION check_data_integrity() IS 'Checks for data integrity issues including inconsistencies and orphaned records';














