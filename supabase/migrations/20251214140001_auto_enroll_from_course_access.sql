-- =======================================================================
-- Auto-Enrollment from Course Access (Fixed)
-- Ensures students with course_access have corresponding enrollments
-- Date: 2025-01-21
-- =======================================================================

-- Create a simple auto-enrollment function if it doesn't exist
CREATE OR REPLACE FUNCTION auto_enroll_students_on_course_access_change()
RETURNS TRIGGER AS $$
DECLARE
  student_record RECORD;
  enrollment_count INTEGER := 0;
BEGIN
  -- Only proceed if course is published
  IF EXISTS (
    SELECT 1 FROM courses 
    WHERE id = NEW.course_id 
    AND (status = 'Published' OR is_published = true)
  ) THEN
    
    -- Find all students matching this school and grade
    FOR student_record IN
      SELECT DISTINCT ss.student_id
      FROM student_schools ss
      WHERE ss.school_id = NEW.school_id
        AND ss.is_active = true
        AND (
          ss.grade = NEW.grade OR
          LOWER(TRIM(REPLACE(ss.grade, 'Grade ', ''))) = LOWER(TRIM(REPLACE(NEW.grade, 'Grade ', '')))
        )
    LOOP
      -- Check if student is already enrolled
      IF NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.student_id = student_record.student_id
          AND e.course_id = NEW.course_id
      ) THEN
        -- Create enrollment
        INSERT INTO enrollments (
          student_id,
          course_id,
          status,
          progress_percentage,
          enrolled_on
        ) VALUES (
          student_record.student_id,
          NEW.course_id,
          'active',
          0,
          NOW()
        );
        
        enrollment_count := enrollment_count + 1;
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Auto-enrolled % students for course %', enrollment_count, NEW.course_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_access' AND table_schema = 'public') THEN
    -- Drop existing triggers
    DROP TRIGGER IF EXISTS auto_enroll_on_course_access_insert ON course_access;
    
    -- Create trigger on INSERT
    CREATE TRIGGER auto_enroll_on_course_access_insert
      AFTER INSERT ON course_access
      FOR EACH ROW
      EXECUTE FUNCTION auto_enroll_students_on_course_access_change();
    
    RAISE NOTICE 'Auto-enrollment trigger created for course_access';
  ELSE
    RAISE NOTICE 'Skipping auto-enrollment trigger - course_access table does not exist';
  END IF;
END $$;