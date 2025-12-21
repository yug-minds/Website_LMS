-- Fix auto_enroll_students_on_course_access_change function
-- Remove reference to non-existent 'students' table
-- Date: 2025-12-10

-- ============================================================================
-- FUNCTION: Auto-enroll students when course_access is created/updated
-- Fixed to only use student_schools table (removed students table reference)
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
    
    -- Find all students matching this school and grade (using only student_schools table)
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

-- Also fix the auto_enroll_students_on_course_publish function
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
    
    -- Get all course_access entries for this course (using only student_schools table)
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

COMMENT ON FUNCTION auto_enroll_students_on_course_access_change() IS 
'Automatically enrolls eligible students when course_access is created for a published course (uses student_schools table only)';

COMMENT ON FUNCTION auto_enroll_students_on_course_publish() IS 
'Automatically enrolls eligible students (matching school and grade from course_access) when a course is published (uses student_schools table only)';





















