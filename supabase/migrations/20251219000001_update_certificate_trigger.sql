-- ==========================================================
--  Update Certificate Auto-Generation Trigger
--  Purpose: Enhance trigger to optionally call API via pg_net
--  Note: If pg_net is not available, certificates will be created
--        with NULL certificate_url and processed by background job
-- ==========================================================

-- Check if pg_net extension is available and enabled
DO $$
BEGIN
  -- Try to enable pg_net if it exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net extension is available';
  ELSE
    RAISE NOTICE 'pg_net extension is not available. Certificates will be processed by background job.';
  END IF;
END $$;

-- Update the certificate generation function to optionally call API
CREATE OR REPLACE FUNCTION check_and_generate_certificate()
RETURNS TRIGGER AS $$
DECLARE
  total_chapters INTEGER;
  completed_chapters INTEGER;
  completion_percent DECIMAL(5,2);
  course_name TEXT;
  student_name TEXT;
  existing_cert_id UUID;
  cert_id UUID;
  api_url TEXT;
  response_id BIGINT;
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
          SELECT COALESCE(name, title, 'Course') INTO course_name
          FROM courses
          WHERE id = NEW.course_id;
          
          SELECT COALESCE(full_name, 'Student') INTO student_name
          FROM profiles
          WHERE id = NEW.student_id;
          
          -- Create certificate record (certificate_url will be NULL initially)
          INSERT INTO certificates (
            student_id,
            course_id,
            certificate_name,
            certificate_url,
            issued_at
          ) VALUES (
            NEW.student_id,
            NEW.course_id,
            course_name || ' - Certificate of Completion',
            NULL, -- Will be populated by API call or background job
            NOW()
          )
          RETURNING id INTO cert_id;
          
          -- Try to call API via pg_net if available
          -- Get the API URL from environment or use default
          api_url := COALESCE(
            current_setting('app.api_url', true),
            'http://localhost:3000/api/certificates/auto-generate'
          );
          
          -- Attempt to call API via pg_net (if extension is available)
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
              -- Use pg_net to make HTTP request
              SELECT net.http_post(
                url := api_url,
                headers := jsonb_build_object(
                  'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                  'studentId', NEW.student_id::text,
                  'courseId', NEW.course_id::text
                )
              ) INTO response_id;
              
              RAISE NOTICE 'Certificate generation API called via pg_net, request_id: %', response_id;
            ELSE
              -- pg_net not available, certificate will be processed by background job
              RAISE NOTICE 'pg_net not available. Certificate record created (id: %). Will be processed by background job.', cert_id;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            -- If API call fails, certificate will still be created and processed by background job
            RAISE WARNING 'Failed to call certificate generation API: %. Certificate will be processed by background job.', SQLERRM;
          END;
          
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
            'Congratulations! You have completed ' || course_name || ' and earned a certificate.',
            'course',
            jsonb_build_object(
              'course_id', NEW.course_id,
              'completion_percent', completion_percent,
              'certificate_id', cert_id
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_auto_generate_certificate ON course_progress;
CREATE TRIGGER trigger_auto_generate_certificate
  AFTER INSERT OR UPDATE ON course_progress
  FOR EACH ROW
  EXECUTE FUNCTION check_and_generate_certificate();

COMMENT ON FUNCTION check_and_generate_certificate() IS 
  'Automatically creates certificate records when course completion reaches 80%. Attempts to call API via pg_net if available, otherwise processes via background job.';

-- ==========================================================
--  Background Job Processor Function
--  Purpose: Process pending certificates (those with NULL certificate_url)
-- ==========================================================

CREATE OR REPLACE FUNCTION process_pending_certificates()
RETURNS TABLE(
  processed_count INTEGER,
  success_count INTEGER,
  error_count INTEGER
) AS $$
DECLARE
  cert_record RECORD;
  processed INTEGER := 0;
  success INTEGER := 0;
  errors INTEGER := 0;
BEGIN
  -- Get all certificates with NULL certificate_url that were created in the last 24 hours
  -- (to avoid processing very old records)
  FOR cert_record IN
    SELECT 
      c.id,
      c.student_id,
      c.course_id,
      c.certificate_name,
      c.issued_at
    FROM certificates c
    WHERE c.certificate_url IS NULL
      AND c.issued_at >= NOW() - INTERVAL '24 hours'
    ORDER BY c.issued_at ASC
    LIMIT 10 -- Process 10 at a time to avoid overload
  LOOP
    BEGIN
      -- This function doesn't actually generate the certificate
      -- It just marks records that need processing
      -- The actual generation should be done by calling the API endpoint
      -- from a scheduled job or cron task
      
      processed := processed + 1;
      
      -- Log that this certificate needs processing
      RAISE NOTICE 'Certificate % needs processing: student_id=%, course_id=%', 
        cert_record.id, cert_record.student_id, cert_record.course_id;
      
      success := success + 1;
      
    EXCEPTION WHEN OTHERS THEN
      errors := errors + 1;
      RAISE WARNING 'Error processing certificate %: %', cert_record.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT processed, success, errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_pending_certificates() IS 
  'Identifies pending certificates that need image generation. Should be called by a scheduled job that then calls the API endpoint.';


