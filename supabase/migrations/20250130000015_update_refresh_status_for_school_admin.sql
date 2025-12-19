-- ============================================================================
-- Update Refresh Status Function to Include School Admin Stats
-- Created: 2025-12-07
-- Purpose: Include school admin stats materialized view in refresh status
-- ============================================================================

-- Update the refresh status function to include school admin stats
CREATE OR REPLACE FUNCTION get_dashboard_refresh_status()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_cron_enabled BOOLEAN;
  v_job_exists BOOLEAN;
  v_admin_last_refresh TIMESTAMP;
  v_school_admin_last_refresh TIMESTAMP;
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
  
  -- Get last refresh time from admin stats materialized view
  SELECT last_updated 
  INTO v_admin_last_refresh
  FROM mv_admin_stats 
  ORDER BY last_updated DESC 
  LIMIT 1;
  
  -- Get last refresh time from school admin stats materialized view
  SELECT MAX(last_updated)
  INTO v_school_admin_last_refresh
  FROM mv_school_admin_stats;
  
  -- Build result with both materialized views
  SELECT json_build_object(
    'cronEnabled', v_cron_enabled,
    'jobScheduled', v_job_exists,
    'adminStats', json_build_object(
      'lastRefresh', v_admin_last_refresh,
      'viewName', 'mv_admin_stats'
    ),
    'schoolAdminStats', json_build_object(
      'lastRefresh', v_school_admin_last_refresh,
      'viewName', 'mv_school_admin_stats',
      'schoolCount', (SELECT COUNT(*) FROM mv_school_admin_stats)
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
-- Comments
-- ============================================================================

COMMENT ON FUNCTION get_dashboard_refresh_status() IS 'Returns the status of the materialized view refresh schedule. Includes status for both admin stats and school admin stats materialized views.';

