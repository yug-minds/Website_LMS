-- Setup Materialized View Refresh Schedule
-- Created: 2025-01-30
-- Purpose: Automatically refresh materialized views every 5 minutes

-- ============================================================================
-- 1. Enable pg_cron extension (if not already enabled)
-- ============================================================================

-- Check if pg_cron is available and enable it
DO $$
BEGIN
  -- Try to enable pg_cron extension
  -- Note: This requires superuser privileges, so it might fail
  -- If it fails, the cron job setup will be skipped
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_cron extension requires superuser privileges. Skipping automatic refresh setup.';
    RAISE NOTICE 'You can manually refresh views using: SELECT refresh_dashboard_views();';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available. Skipping automatic refresh setup.';
    RAISE NOTICE 'You can manually refresh views using: SELECT refresh_dashboard_views();';
END $$;

-- ============================================================================
-- 2. Create cron job to refresh materialized views every 5 minutes
-- ============================================================================

-- Only create cron job if pg_cron is available
DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop existing job if it exists (ignore error if it doesn't exist)
    BEGIN
      PERFORM cron.unschedule('refresh-dashboard-views');
    EXCEPTION
      WHEN OTHERS THEN
        -- Job doesn't exist, which is fine for first-time setup
        NULL;
    END;
    
    -- Schedule job to run every 5 minutes
    PERFORM cron.schedule(
      'refresh-dashboard-views',
      '*/5 * * * *', -- Every 5 minutes (cron syntax)
      $sql$SELECT refresh_dashboard_views();$sql$
    );
    
    RAISE NOTICE '✅ Cron job scheduled: refresh-dashboard-views (every 5 minutes)';
  ELSE
    RAISE NOTICE '⚠️  pg_cron extension not available. Manual refresh required.';
    RAISE NOTICE '   To refresh manually: SELECT refresh_dashboard_views();';
    RAISE NOTICE '   Or use the API endpoint: POST /api/admin/refresh-dashboard-views';
  END IF;
END $$;

-- ============================================================================
-- 3. Create function to check cron job status
-- ============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_refresh_status()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_cron_enabled BOOLEAN;
  v_job_exists BOOLEAN;
BEGIN
  -- Check if pg_cron is enabled
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_cron_enabled;
  
  -- Check if job exists
  IF v_cron_enabled THEN
    SELECT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'refresh-dashboard-views'
    ) INTO v_job_exists;
  ELSE
    v_job_exists := false;
  END IF;
  
  -- Get last refresh time from materialized view
  SELECT json_build_object(
    'cronEnabled', v_cron_enabled,
    'jobScheduled', v_job_exists,
    'lastRefresh', (
      SELECT last_updated 
      FROM mv_admin_stats 
      ORDER BY last_updated DESC 
      LIMIT 1
    ),
    'refreshInterval', '5 minutes',
    'status', CASE 
      WHEN v_cron_enabled AND v_job_exists THEN 'active'
      WHEN v_cron_enabled AND NOT v_job_exists THEN 'not_scheduled'
      ELSE 'manual_refresh_required'
    END
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_dashboard_refresh_status() TO authenticated;

-- ============================================================================
-- 5. Comments
-- ============================================================================

COMMENT ON FUNCTION get_dashboard_refresh_status() IS 'Returns the status of the materialized view refresh schedule. Checks if pg_cron is enabled and if the refresh job is scheduled.';

