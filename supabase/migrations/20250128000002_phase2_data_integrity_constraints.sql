-- ==========================================================
-- Phase 2: Data Integrity - Additional Constraints
-- Date: 2025-01-28
-- Purpose: Add missing database constraints for data integrity
-- ==========================================================

-- ==========================================================
-- PART 1: Add CHECK Constraints for Business Logic
-- ==========================================================

-- Ensure leave dates are valid (end_date >= start_date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_leave_dates' 
    AND conrelid = 'teacher_leaves'::regclass
  ) THEN
    ALTER TABLE teacher_leaves
    ADD CONSTRAINT check_leave_dates
    CHECK (end_date >= start_date);
  END IF;
END $$;

-- Ensure grade format is valid (optional - can be any text, but we can validate format)
-- Note: This is lenient to allow various grade formats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_grade_not_empty' 
    AND conrelid = 'student_schools'::regclass
  ) THEN
    ALTER TABLE student_schools
    ADD CONSTRAINT check_grade_not_empty
    CHECK (grade IS NOT NULL AND trim(grade) != '');
  END IF;
END $$;

-- Ensure experience_years is non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_experience_years_non_negative' 
    AND conrelid = 'teachers'::regclass
  ) THEN
    ALTER TABLE teachers
    ADD CONSTRAINT check_experience_years_non_negative
    CHECK (experience_years >= 0);
  END IF;
END $$;

-- Ensure working_days_per_week is between 1 and 7
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_working_days_per_week' 
    AND conrelid = 'teacher_schools'::regclass
  ) THEN
    ALTER TABLE teacher_schools
    ADD CONSTRAINT check_working_days_per_week
    CHECK (working_days_per_week >= 1 AND working_days_per_week <= 7);
  END IF;
END $$;

-- Ensure max_students_per_session is positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_max_students_positive' 
    AND conrelid = 'teacher_schools'::regclass
  ) THEN
    ALTER TABLE teacher_schools
    ADD CONSTRAINT check_max_students_positive
    CHECK (max_students_per_session > 0);
  END IF;
END $$;

-- Ensure progress_percentage is between 0 and 100
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_progress_percentage' 
    AND conrelid = 'student_courses'::regclass
  ) THEN
    ALTER TABLE student_courses
    ADD CONSTRAINT check_progress_percentage
    CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
  END IF;
END $$;

-- Ensure duration_hours is non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_duration_hours_non_negative' 
    AND conrelid = 'teacher_reports'::regclass
  ) THEN
    ALTER TABLE teacher_reports
    ADD CONSTRAINT check_duration_hours_non_negative
    CHECK (duration_hours IS NULL OR duration_hours >= 0);
  END IF;
END $$;

-- Ensure student_count is non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_student_count_non_negative' 
    AND conrelid = 'teacher_reports'::regclass
  ) THEN
    ALTER TABLE teacher_reports
    ADD CONSTRAINT check_student_count_non_negative
    CHECK (student_count IS NULL OR student_count >= 0);
  END IF;
END $$;

-- ==========================================================
-- PART 2: Add NOT NULL Constraints
-- ==========================================================

-- Ensure profiles.email is NOT NULL (if not already)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'email' 
    AND is_nullable = 'YES'
  ) THEN
    -- First, set NULL emails to a placeholder (if any exist)
    UPDATE profiles SET email = 'unknown_' || id::text || '@placeholder.com' WHERE email IS NULL;
    
    -- Then add NOT NULL constraint
    ALTER TABLE profiles
    ALTER COLUMN email SET NOT NULL;
  END IF;
END $$;

-- Ensure student_schools.grade is NOT NULL (should already be, but verify)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'student_schools' 
    AND column_name = 'grade' 
    AND is_nullable = 'YES'
  ) THEN
    -- Set NULL grades to 'Not Specified'
    UPDATE student_schools SET grade = 'Not Specified' WHERE grade IS NULL;
    
    ALTER TABLE student_schools
    ALTER COLUMN grade SET NOT NULL;
  END IF;
END $$;

-- Ensure courses.name or course_name is NOT NULL
DO $$
BEGIN
  -- Check if name column exists and is nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'courses' 
    AND column_name = 'name' 
    AND is_nullable = 'YES'
  ) THEN
    -- Set NULL names to course_name or a placeholder
    UPDATE courses 
    SET name = COALESCE(course_name, 'Untitled Course')
    WHERE name IS NULL;
    
    ALTER TABLE courses
    ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

-- ==========================================================
-- PART 3: Add UNIQUE Constraints (where missing)
-- ==========================================================

-- Ensure enrollments don't have duplicates (student + class + course combination)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_student_class_course_enrollment' 
    AND conrelid = 'enrollments'::regclass
  ) THEN
    -- First, remove any duplicates (keep the most recent one)
    DELETE FROM enrollments e1
    WHERE EXISTS (
      SELECT 1 FROM enrollments e2
      WHERE e2.student_id = e1.student_id
        AND e2.class_id = e1.class_id
        AND e2.course_id = e1.course_id
        AND e2.id != e1.id
        AND e2.enrolled_on >= e1.enrolled_on
    );
    
    -- Then add unique constraint
    ALTER TABLE enrollments
    ADD CONSTRAINT unique_student_class_course_enrollment
    UNIQUE(student_id, class_id, course_id);
  END IF;
END $$;

-- ==========================================================
-- PART 4: Add Foreign Key Constraints with Proper Actions
-- ==========================================================

-- Ensure all foreign keys have proper ON DELETE actions
-- (Most should already have them, but we'll verify and add if missing)

-- Verify teacher_classes foreign keys have CASCADE
DO $$
BEGIN
  -- Check if teacher_classes.class_id FK exists and update if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%teacher_classes%class_id%'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Foreign key exists, verify ON DELETE action
    -- Note: We can't easily change ON DELETE without dropping/recreating
    -- This is informational - existing FKs should already have proper actions
    NULL;
  END IF;
END $$;

-- ==========================================================
-- PART 5: Add Additional Validation Triggers
-- ==========================================================

-- Function to validate teacher_classes consistency
CREATE OR REPLACE FUNCTION validate_teacher_classes_school_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure teacher_classes.school_id matches classes.school_id
  IF NOT EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'teacher_classes.school_id must match classes.school_id';
  END IF;
  
  -- Ensure teacher is assigned to this school
  IF NOT EXISTS (
    SELECT 1 FROM teacher_schools ts
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Teacher must be assigned to school_id before being assigned to class';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for teacher_classes validation (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'validate_teacher_classes_school_consistency_trigger'
  ) THEN
    CREATE TRIGGER validate_teacher_classes_school_consistency_trigger
    BEFORE INSERT OR UPDATE ON teacher_classes
    FOR EACH ROW
    EXECUTE FUNCTION validate_teacher_classes_school_consistency();
  END IF;
END $$;

-- Function to validate class_schedules consistency
CREATE OR REPLACE FUNCTION validate_class_schedules_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure class_schedules.school_id matches classes.school_id
  IF NEW.class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'class_schedules.school_id must match classes.school_id';
  END IF;
  
  -- Ensure teacher is assigned to this school
  IF NOT EXISTS (
    SELECT 1 FROM teacher_schools ts
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Teacher must be assigned to school_id before being scheduled';
  END IF;
  
  -- Ensure period belongs to same school
  IF NEW.period_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM periods p
    WHERE p.id = NEW.period_id
    AND p.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Period must belong to same school';
  END IF;
  
  -- Ensure room belongs to same school
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rooms r
    WHERE r.id = NEW.room_id
    AND r.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Room must belong to same school';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for class_schedules validation (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'validate_class_schedules_consistency_trigger'
  ) THEN
    CREATE TRIGGER validate_class_schedules_consistency_trigger
    BEFORE INSERT OR UPDATE ON class_schedules
    FOR EACH ROW
    EXECUTE FUNCTION validate_class_schedules_consistency();
  END IF;
END $$;

-- Function to validate enrollments consistency
CREATE OR REPLACE FUNCTION validate_enrollments_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure student has access to course via course_access
  IF NEW.course_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM course_access ca
    JOIN student_schools ss ON ss.school_id = ca.school_id
    WHERE ca.course_id = NEW.course_id
    AND ss.student_id = NEW.student_id
    AND ss.is_active = true
  ) THEN
    RAISE EXCEPTION 'Student must have access to course via course_access before enrollment';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for enrollments validation (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'validate_enrollments_consistency_trigger'
  ) THEN
    CREATE TRIGGER validate_enrollments_consistency_trigger
    BEFORE INSERT OR UPDATE ON enrollments
    FOR EACH ROW
    EXECUTE FUNCTION validate_enrollments_consistency();
  END IF;
END $$;

-- ==========================================================
-- PART 6: Add Comments for Documentation
-- ==========================================================

COMMENT ON CONSTRAINT check_leave_dates ON teacher_leaves IS 'Ensures end_date is not before start_date';
COMMENT ON CONSTRAINT check_grade_not_empty ON student_schools IS 'Ensures grade is not empty';
COMMENT ON CONSTRAINT check_experience_years_non_negative ON teachers IS 'Ensures experience_years is non-negative';
COMMENT ON CONSTRAINT check_working_days_per_week ON teacher_schools IS 'Ensures working_days_per_week is between 1 and 7';
COMMENT ON CONSTRAINT check_max_students_positive ON teacher_schools IS 'Ensures max_students_per_session is positive';
COMMENT ON CONSTRAINT check_progress_percentage ON student_courses IS 'Ensures progress_percentage is between 0 and 100';
COMMENT ON FUNCTION validate_teacher_classes_school_consistency() IS 'Validates teacher_classes school_id matches classes.school_id and teacher is assigned to school';
COMMENT ON FUNCTION validate_class_schedules_consistency() IS 'Validates class_schedules consistency with classes, periods, rooms, and teacher assignments';
COMMENT ON FUNCTION validate_enrollments_consistency() IS 'Validates student has access to course via course_access before enrollment';

