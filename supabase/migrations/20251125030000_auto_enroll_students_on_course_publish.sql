-- Auto-enroll students when courses are published
-- This ensures students from assigned schools and grades automatically get access to published courses

-- ============================================================================
-- ENSURE UNIQUE CONSTRAINT ON ENROLLMENTS
-- ============================================================================

-- Add unique constraint if it doesn't exist (prevents duplicate enrollments)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'enrollments_student_course_unique'
  ) THEN
    ALTER TABLE enrollments 
    ADD CONSTRAINT enrollments_student_course_unique 
    UNIQUE (student_id, course_id);
  END IF;
END $$;

-- ============================================================================
-- FUNCTION: Auto-enroll eligible students when course is published
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_enroll_students_on_course_publish()
RETURNS TRIGGER AS $$
DECLARE
  course_record RECORD;
  student_record RECORD;
  normalized_grade TEXT;
BEGIN
  -- Only proceed if course is being published (status changed to 'Published' or is_published changed to true)
  IF (NEW.status = 'Published' OR NEW.is_published = true) AND 
     (OLD.status != 'Published' AND OLD.is_published != true) THEN
    
    course_record := NEW;
    
    RAISE NOTICE '📚 Course published: % (ID: %)', course_record.course_name, course_record.id;
    
    -- Get all course_access entries for this course
    FOR student_record IN
      SELECT DISTINCT
        ss.student_id,
        ss.school_id,
        ss.grade,
        ss.is_active
      FROM course_access ca
      INNER JOIN student_schools ss ON 
        ss.school_id = ca.school_id AND
        ss.is_active = true
      WHERE ca.course_id = course_record.id
      
      UNION
      
      -- Also check students table for backward compatibility
      SELECT DISTINCT
        s.profile_id as student_id,
        s.school_id,
        s.grade,
        true as is_active
      FROM course_access ca
      INNER JOIN students s ON 
        s.school_id = ca.school_id
      WHERE ca.course_id = course_record.id
        AND NOT EXISTS (
          SELECT 1 FROM student_schools ss2 
          WHERE ss2.student_id = s.profile_id AND ss2.school_id = s.school_id
        )
    LOOP
      -- Normalize grade for comparison
      normalized_grade := student_record.grade;
      
      -- Check if grade matches (normalize both sides)
      IF EXISTS (
        SELECT 1 FROM course_access ca
        WHERE ca.course_id = course_record.id
          AND ca.school_id = student_record.school_id
          AND (
            -- Exact match
            ca.grade = normalized_grade OR
            -- Normalized match (handle "Grade 4" vs "grade4" etc)
            LOWER(TRIM(REPLACE(ca.grade, 'Grade ', ''))) = LOWER(TRIM(REPLACE(normalized_grade, 'Grade ', ''))) OR
            LOWER(TRIM(REPLACE(ca.grade, 'grade', ''))) = LOWER(TRIM(REPLACE(normalized_grade, 'grade', '')))
          )
      ) THEN
        -- Check if student is already enrolled
        IF NOT EXISTS (
          SELECT 1 FROM enrollments e
          WHERE e.student_id = student_record.student_id
            AND e.course_id = course_record.id
            AND e.status = 'active'
        ) THEN
          -- Auto-enroll the student
          INSERT INTO enrollments (
            student_id,
            course_id,
            status,
            progress_percentage,
            enrolled_on
          ) VALUES (
            student_record.student_id,
            course_record.id,
            'active',
            0,
            NOW()
          )
          ON CONFLICT (student_id, course_id) DO UPDATE
          SET status = 'active';
          
          RAISE NOTICE '✅ Auto-enrolled student % in course %', student_record.student_id, course_record.id;
        END IF;
      END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Auto-enrollment complete for course %', course_record.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-enroll students when course is published
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_enroll_students_on_course_publish ON courses;

CREATE TRIGGER trigger_auto_enroll_students_on_course_publish
  AFTER UPDATE OF status, is_published ON courses
  FOR EACH ROW
  WHEN (
    (NEW.status = 'Published' OR NEW.is_published = true) AND
    (OLD.status != 'Published' AND OLD.is_published != true)
  )
  EXECUTE FUNCTION auto_enroll_students_on_course_publish();

-- ============================================================================
-- FUNCTION: Auto-enroll students when course_access is created/updated
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_enroll_students_on_course_access_change()
RETURNS TRIGGER AS $$
DECLARE
  course_record RECORD;
  student_record RECORD;
  normalized_grade TEXT;
BEGIN
  -- Get the course
  SELECT * INTO course_record FROM courses WHERE id = NEW.course_id;
  
  -- Only proceed if course is published
  IF course_record.status = 'Published' OR course_record.is_published = true THEN
    
    RAISE NOTICE '📋 Course access updated for course % (ID: %), school: %, grade: %', 
      course_record.course_name, course_record.id, NEW.school_id, NEW.grade;
    
    -- Find all students matching this school and grade
    FOR student_record IN
      SELECT DISTINCT
        ss.student_id,
        ss.school_id,
        ss.grade,
        ss.is_active
      FROM student_schools ss
      WHERE ss.school_id = NEW.school_id
        AND ss.is_active = true
        AND (
          -- Exact match
          ss.grade = NEW.grade OR
          -- Normalized match
          LOWER(TRIM(REPLACE(ss.grade, 'Grade ', ''))) = LOWER(TRIM(REPLACE(NEW.grade, 'Grade ', ''))) OR
          LOWER(TRIM(REPLACE(ss.grade, 'grade', ''))) = LOWER(TRIM(REPLACE(NEW.grade, 'grade', '')))
        )
      
      UNION
      
      -- Also check students table for backward compatibility
      SELECT DISTINCT
        s.profile_id as student_id,
        s.school_id,
        s.grade,
        true as is_active
      FROM students s
      WHERE s.school_id = NEW.school_id
        AND (
          s.grade = NEW.grade OR
          LOWER(TRIM(REPLACE(s.grade, 'Grade ', ''))) = LOWER(TRIM(REPLACE(NEW.grade, 'Grade ', ''))) OR
          LOWER(TRIM(REPLACE(s.grade, 'grade', ''))) = LOWER(TRIM(REPLACE(NEW.grade, 'grade', '')))
        )
        AND NOT EXISTS (
          SELECT 1 FROM student_schools ss2 
          WHERE ss2.student_id = s.profile_id AND ss2.school_id = s.school_id
        )
    LOOP
      -- Check if student is already enrolled
      IF NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.student_id = student_record.student_id
          AND e.course_id = course_record.id
          AND e.status = 'active'
      ) THEN
        -- Auto-enroll the student
        INSERT INTO enrollments (
          student_id,
          course_id,
          status,
          progress_percentage,
          enrolled_on
        ) VALUES (
          student_record.student_id,
          course_record.id,
          'active',
          0,
          NOW()
        )
        ON CONFLICT (student_id, course_id) DO UPDATE
        SET status = 'active';
        
        RAISE NOTICE '✅ Auto-enrolled student % in course %', student_record.student_id, course_record.id;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-enroll students when course_access is created
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_enroll_students_on_course_access_insert ON course_access;

CREATE TRIGGER trigger_auto_enroll_students_on_course_access_insert
  AFTER INSERT ON course_access
  FOR EACH ROW
  EXECUTE FUNCTION auto_enroll_students_on_course_access_change();

-- ============================================================================
-- COMMENT
-- ============================================================================

COMMENT ON FUNCTION auto_enroll_students_on_course_publish() IS 
'Automatically enrolls eligible students (matching school and grade from course_access) when a course is published';

COMMENT ON FUNCTION auto_enroll_students_on_course_access_change() IS 
'Automatically enrolls eligible students when course_access is created for a published course';

