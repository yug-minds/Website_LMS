-- ==========================================================
--  Auto-generate Certificates Function
--  Purpose: Automatically generate certificates when course completion >= 80%
-- ==========================================================

-- Function to check and generate certificate
CREATE OR REPLACE FUNCTION check_and_generate_certificate()
RETURNS TRIGGER AS $$
DECLARE
  total_chapters INTEGER;
  completed_chapters INTEGER;
  completion_percent DECIMAL(5,2);
  course_name TEXT;
  student_name TEXT;
  existing_cert_id UUID;
BEGIN
  -- Only process if chapter is marked as completed
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    -- Get total published chapters for the course
    SELECT COUNT(*) INTO total_chapters
    FROM chapters
    WHERE course_id = NEW.course_id
      AND is_published = true;
    
    -- Get completed chapters count
    SELECT COUNT(*) INTO completed_chapters
    FROM course_progress
    WHERE student_id = NEW.student_id
      AND course_id = NEW.course_id
      AND completed = true;
    
    -- Calculate completion percentage
    IF total_chapters > 0 THEN
      completion_percent := (completed_chapters::DECIMAL / total_chapters::DECIMAL) * 100;
      
      -- Check if completion is >= 80%
      IF completion_percent >= 80 THEN
        -- Check if certificate already exists
        SELECT id INTO existing_cert_id
        FROM certificates
        WHERE student_id = NEW.student_id
          AND course_id = NEW.course_id;
        
        -- Only create certificate if it doesn't exist
        IF existing_cert_id IS NULL THEN
          -- Get course and student names
          SELECT name, title INTO course_name
          FROM courses
          WHERE id = NEW.course_id;
          
          SELECT full_name INTO student_name
          FROM profiles
          WHERE id = NEW.student_id;
          
          -- Create certificate record
          -- Note: Actual PDF generation should be done via API/webhook
          -- This creates the database record
          INSERT INTO certificates (
            student_id,
            course_id,
            certificate_name,
            certificate_url,
            issued_at
          ) VALUES (
            NEW.student_id,
            NEW.course_id,
            COALESCE(course_name, 'Course') || ' - Certificate of Completion',
            NULL, -- Will be populated by certificate generation API
            NOW()
          );
          
          -- Create notification for student
          INSERT INTO notifications (
            user_id,
            title,
            body,
            type,
            data
          ) VALUES (
            NEW.student_id,
            'Certificate Available',
            'Congratulations! You have completed ' || COALESCE(course_name, 'the course') || ' and earned a certificate.',
            'course',
            jsonb_build_object(
              'course_id', NEW.course_id,
              'completion_percent', completion_percent
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate certificates
DROP TRIGGER IF EXISTS trigger_auto_generate_certificate ON course_progress;
CREATE TRIGGER trigger_auto_generate_certificate
  AFTER INSERT OR UPDATE ON course_progress
  FOR EACH ROW
  EXECUTE FUNCTION check_and_generate_certificate();

COMMENT ON FUNCTION check_and_generate_certificate() IS 'Automatically generates certificates when course completion reaches 80%';


















