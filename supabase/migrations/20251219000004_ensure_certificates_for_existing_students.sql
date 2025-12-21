-- ==========================================================
--  Ensure Certificates for Existing Eligible Students
--  Purpose: Create certificate records for students who already
--           have 80%+ completion but no certificate records
-- ==========================================================

-- Function to create certificate records for existing eligible students
CREATE OR REPLACE FUNCTION create_certificates_for_existing_eligible_students()
RETURNS TABLE(
  student_id UUID,
  course_id UUID,
  completion_percent DECIMAL(5,2),
  certificate_created BOOLEAN
) AS $$
DECLARE
  student_course RECORD;
  total_chapters INTEGER;
  completed_chapters INTEGER;
  completion_pct DECIMAL(5,2);
  existing_cert_id UUID;
  cert_id UUID;
  course_name TEXT;
BEGIN
  -- Find all student-course combinations
  FOR student_course IN
    SELECT DISTINCT
      cp.student_id,
      cp.course_id
    FROM course_progress cp
    WHERE NOT EXISTS (
      SELECT 1 FROM certificates c
      WHERE c.student_id = cp.student_id
        AND c.course_id = cp.course_id
    )
  LOOP
    -- Get total published chapters for this course
    SELECT COUNT(*) INTO total_chapters
    FROM chapters
    WHERE course_id = student_course.course_id
      AND is_published = true;
    
    -- Get completed chapters for this student
    SELECT COUNT(*) INTO completed_chapters
    FROM course_progress
    WHERE student_id = student_course.student_id
      AND course_id = student_course.course_id
      AND completed = true;
    
    -- Calculate completion percentage
    IF total_chapters > 0 THEN
      completion_pct := (completed_chapters::DECIMAL / total_chapters::DECIMAL) * 100;
      
      -- Check if completion is >= 80%
      IF completion_pct >= 80 THEN
        -- Get course name
        SELECT COALESCE(name, title, 'Course') INTO course_name
        FROM courses
        WHERE id = student_course.course_id;
        
        -- Create certificate record
        INSERT INTO certificates (
          student_id,
          course_id,
          certificate_name,
          certificate_url,
          issued_at
        ) VALUES (
          student_course.student_id,
          student_course.course_id,
          course_name || ' - Certificate of Completion',
          NULL, -- Will be populated by API/background job
          NOW()
        )
        RETURNING id INTO cert_id;
        
        -- Create notification
        INSERT INTO notifications (
          user_id,
          title,
          body,
          type,
          data
        ) VALUES (
          student_course.student_id,
          'Certificate Available',
          'Congratulations! You have completed ' || course_name || ' and earned a certificate.',
          'course',
          jsonb_build_object(
            'course_id', student_course.course_id,
            'completion_percent', completion_pct,
            'certificate_id', cert_id
          )
        );
        
        RETURN QUERY SELECT 
          student_course.student_id,
          student_course.course_id,
          completion_pct,
          true;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_certificates_for_existing_eligible_students() IS 
  'Creates certificate records for all existing students with 80%+ completion who don''t have certificate records yet. Returns list of created certificates.';

-- Call the function to create certificates for existing eligible students
-- This will create the records, then they can be processed by the background job
DO $$
DECLARE
  result_count INTEGER;
BEGIN
  -- Create certificate records for eligible students
  SELECT COUNT(*) INTO result_count
  FROM create_certificates_for_existing_eligible_students();
  
  RAISE NOTICE 'Created % certificate record(s) for existing eligible students', result_count;
END $$;


