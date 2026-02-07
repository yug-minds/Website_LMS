-- ==========================================================
-- Migration: Move pg_net Extension from Public to Extensions Schema
-- Date: 2025-12-20
-- Purpose: Move pg_net extension to extensions schema for better security
--          This prevents the extension from being in the public schema
-- ==========================================================

-- ============================================================================
-- STEP 1: Ensure extensions schema exists
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS extensions;

-- ============================================================================
-- STEP 2: Move the extension
-- ============================================================================
-- WARNING: This will drop and recreate the extension
-- Functions that depend on it will be dropped and recreated by subsequent migrations
-- This is safe because the migration files have been updated to use extensions.net.*

DO $$
BEGIN
  -- Check if extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pg_net'
    AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'Moving pg_net extension from public to extensions schema...';
    RAISE NOTICE 'This will drop dependent functions, but they will be recreated by migration files';
    
    -- Drop the extension (CASCADE will drop functions that depend on it)
    -- These functions will be recreated by their migration files with updated references
    DROP EXTENSION IF EXISTS pg_net CASCADE;
    
    -- Recreate in extensions schema
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
    
    RAISE NOTICE '✅ pg_net extension moved to extensions schema successfully';
  ELSE
    -- Check if it's already in extensions schema
    IF EXISTS (
      SELECT 1 FROM pg_extension e
      JOIN pg_namespace n ON e.extnamespace = n.oid
      WHERE e.extname = 'pg_net'
      AND n.nspname = 'extensions'
    ) THEN
      RAISE NOTICE 'pg_net extension is already in extensions schema';
    ELSE
      RAISE WARNING 'pg_net extension not found. Creating in extensions schema...';
      CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Recreate monitoring.post_alert function with extensions.net
-- ============================================================================
-- This function was dropped when we moved the extension
-- Recreate it with the correct schema reference

CREATE OR REPLACE FUNCTION monitoring.post_alert(
  category text,
  severity text,
  message text,
  details jsonb DEFAULT '{}'::jsonb
) RETURNS void 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  headers jsonb;
  payload jsonb;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;

  -- Always persist alert locally
  INSERT INTO monitoring.alert_events (severity, category, message, details)
  VALUES (severity, category, message, details);

  -- If webhook not configured or alerts disabled, stop here
  IF cfg.alert_enabled IS NOT TRUE OR cfg.slack_webhook_url IS NULL OR cfg.slack_webhook_url = '' THEN
    RETURN;
  END IF;

  -- Prepare Slack-compatible payload
  headers := pg_catalog.jsonb_build_object('Content-Type','application/json');
  payload := pg_catalog.jsonb_build_object(
    'text', pg_catalog.format('*%s* [%s]: %s', category, severity, message),
    'details', details,
    'timestamp', pg_catalog.now()
  );

  -- Send HTTP POST via pg_net (now in extensions schema)
  PERFORM extensions.net.http_post(
    cfg.slack_webhook_url,
    headers,
    payload::text
  );
EXCEPTION WHEN others THEN
  -- swallow errors to avoid failing cron
  NULL;
END;
$$;

-- ============================================================================
-- STEP 4: Update cron jobs (if any exist)
-- ============================================================================
-- Cron jobs that reference net.http_post need to be updated to extensions.net.http_post
-- Note: The cron job in 20251219000003_setup_certificate_cron.sql has been updated
-- to handle both locations, but existing jobs may need updating

DO $$
DECLARE
  job_record RECORD;
  updated_command TEXT;
BEGIN
  -- Find cron jobs that use net.http_post (but not extensions.net.http_post)
  FOR job_record IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command LIKE '%net.http_post%'
    AND command NOT LIKE '%extensions.net.http_post%'
  LOOP
    -- Replace net.http_post with extensions.net.http_post
    updated_command := REPLACE(job_record.command, 'net.http_post', 'extensions.net.http_post');
    
    -- Update the cron job
    BEGIN
      PERFORM cron.alter_job(job_record.jobid, command := updated_command);
      RAISE NOTICE 'Updated cron job % to use extensions.net', job_record.jobname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not update cron job %: %', job_record.jobname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  ext_schema TEXT;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'pg_net';
  
  IF ext_schema = 'extensions' THEN
    RAISE NOTICE '✅ pg_net extension is now in extensions schema';
  ELSE
    RAISE WARNING '⚠️  pg_net extension is in % schema (expected: extensions)', ext_schema;
  END IF;
END $$;

