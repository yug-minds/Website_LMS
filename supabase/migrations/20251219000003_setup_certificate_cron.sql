-- ==========================================================
--  Setup Automatic Certificate Processing
--  Purpose: Create a scheduled job to process pending certificates
-- ==========================================================

-- Note: This requires pg_cron extension to be enabled
-- If pg_cron is not available, certificates will be processed
-- via the /api/certificates/process-pending endpoint called manually
-- or via external cron service

-- Check if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule job to process pending certificates every 5 minutes
    -- This will call the API endpoint to generate certificates
    PERFORM cron.schedule(
      'process-pending-certificates',
      '*/5 * * * *', -- Every 5 minutes
      $$
      SELECT net.http_post(
        url := COALESCE(
          current_setting('app.api_url', true),
          'http://localhost:3000/api/certificates/process-pending'
        ),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('limit', 10)
      );
      $$
    );
    
    RAISE NOTICE 'pg_cron is available. Scheduled job created for processing pending certificates.';
  ELSE
    RAISE NOTICE 'pg_cron is not available. Please set up external cron job to call /api/certificates/process-pending endpoint every 5-10 minutes.';
  END IF;
END $$;

-- Alternative: Create a function that can be called manually or via external scheduler
CREATE OR REPLACE FUNCTION trigger_certificate_generation_for_eligible()
RETURNS INTEGER AS $$
DECLARE
  processed_count INTEGER := 0;
BEGIN
  -- This function can be called to trigger certificate generation
  -- It will create certificate records for eligible students
  -- The actual image generation will be done by the API endpoint
  
  -- Find and create certificate records for eligible students
  INSERT INTO certificates (student_id, course_id, certificate_name, certificate_url, issued_at)
  SELECT DISTINCT
    cp.student_id,
    cp.course_id,
    COALESCE(c.name, c.title, 'Course') || ' - Certificate of Completion',
    NULL,
    NOW()
  FROM course_progress cp
  INNER JOIN chapters ch ON ch.course_id = cp.course_id AND ch.is_published = true
  INNER JOIN courses c ON c.id = cp.course_id
  WHERE NOT EXISTS (
    SELECT 1 FROM certificates cert
    WHERE cert.student_id = cp.student_id
      AND cert.course_id = cp.course_id
  )
  AND (
    SELECT COUNT(*)::DECIMAL / NULLIF((
      SELECT COUNT(*) FROM chapters 
      WHERE course_id = cp.course_id AND is_published = true
    ), 0) * 100
    FROM course_progress
    WHERE student_id = cp.student_id
      AND course_id = cp.course_id
      AND completed = true
  ) >= 80
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS processed_count = ROW_COUNT;
  
  RETURN processed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION trigger_certificate_generation_for_eligible() IS 
  'Creates certificate records for all eligible students (80%+ completion) who don''t have certificates yet. Returns count of records created.';


