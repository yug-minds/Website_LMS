-- ==========================================================
--  Batch Generate Certificates for Existing Students
--  Purpose: Generate certificates for all students who have completed 80%+
--           but don't have certificates yet
-- ==========================================================

-- Function to batch generate certificates for eligible students
CREATE OR REPLACE FUNCTION batch_generate_certificates_for_eligible_students()
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
BEGIN
  -- Find all student-course combinations that should have certificates
  FOR student_course IN
    SELECT DISTINCT
      cp.student_id,
      cp.course_id
    FROM course_progress cp
    INNER JOIN chapters ch ON ch.course_id = cp.course_id AND ch.is_published = true
    WHERE NOT EXISTS (
      SELECT 1 FROM certificates c
      WHERE c.student_id = cp.student_id
        AND c.course_id = cp.course_id
        AND c.certificate_url IS NOT NULL
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
        -- Check if certificate already exists (even without URL)
        SELECT id INTO existing_cert_id
        FROM certificates
        WHERE student_id = student_course.student_id
          AND course_id = student_course.course_id;
        
        -- Create certificate record if it doesn't exist
        IF existing_cert_id IS NULL THEN
          INSERT INTO certificates (
            student_id,
            course_id,
            certificate_name,
            certificate_url,
            issued_at
          )
          SELECT 
            student_course.student_id,
            student_course.course_id,
            COALESCE(c.name, c.title, 'Course') || ' - Certificate of Completion',
            NULL, -- Will be populated by API/background job
            NOW()
          FROM courses c
          WHERE c.id = student_course.course_id
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
            'Congratulations! You have completed ' || 
            (SELECT COALESCE(name, title, 'the course') FROM courses WHERE id = student_course.course_id) || 
            ' and earned a certificate.',
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
        ELSE
          -- Certificate record exists but may need URL generation
          RETURN QUERY SELECT 
            student_course.student_id,
            student_course.course_id,
            completion_pct,
            false;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION batch_generate_certificates_for_eligible_students() IS 
  'Finds all students with 80%+ completion who don''t have certificates and creates certificate records for them. Returns list of student-course pairs that need certificate generation.';


