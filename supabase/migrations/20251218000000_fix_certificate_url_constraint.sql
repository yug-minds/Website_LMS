-- Fix certificate_url NOT NULL constraint issue
-- The auto-certificate generation trigger sets certificate_url to NULL
-- but the column has a NOT NULL constraint, causing errors

-- Make certificate_url nullable since it's populated later by API
ALTER TABLE certificates 
ALTER COLUMN certificate_url DROP NOT NULL;

-- Add a comment explaining the workflow
COMMENT ON COLUMN certificates.certificate_url IS 'URL to the generated certificate PDF. Initially NULL, populated by certificate generation API after course completion.';

-- Update the auto-generate function to use a placeholder URL instead of NULL
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
          SELECT COALESCE(name, title) INTO course_name
          FROM courses
          WHERE id = NEW.course_id;
          
          SELECT full_name INTO student_name
          FROM profiles
          WHERE id = NEW.student_id;
          
          -- Create certificate record with placeholder URL
          -- Actual PDF generation should be done via API/webhook
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
            'pending', -- Placeholder, will be updated by certificate generation API
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

-- Success message
SELECT 'Certificate URL constraint fixed successfully!' as status;
