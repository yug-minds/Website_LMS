-- ============================================================================
-- Update Cron Job for Incremental Refresh
-- Created: 2025-12-07
-- Purpose: Update cron job to use incremental refresh by default
-- ============================================================================

-- Update the cron job to use incremental refresh
DO $$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop existing job if it exists
    BEGIN
      PERFORM cron.unschedule('refresh-dashboard-views');
    EXCEPTION
      WHEN OTHERS THEN
        -- Job doesn't exist, which is fine
        NULL;
    END;
    
    -- Schedule job to run every 5 minutes with incremental refresh
    -- First run of the day (at 00:00) does full refresh, others are incremental
    PERFORM cron.schedule(
      'refresh-dashboard-views',
      '*/5 * * * *', -- Every 5 minutes
      $sql$
        -- Run incremental refresh (only changed schools)
        SELECT refresh_dashboard_views(true);
      $sql$
    );
    
    -- Also schedule a daily full refresh at midnight
    BEGIN
      PERFORM cron.unschedule('refresh-dashboard-views-full');
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
    
    PERFORM cron.schedule(
      'refresh-dashboard-views-full',
      '0 0 * * *', -- Daily at midnight
      $sql$
        -- Run full refresh (all schools)
        SELECT refresh_dashboard_views(false);
      $sql$
    );
    
    RAISE NOTICE '✅ Cron jobs scheduled:';
    RAISE NOTICE '   - refresh-dashboard-views: Incremental refresh every 5 minutes';
    RAISE NOTICE '   - refresh-dashboard-views-full: Full refresh daily at midnight';
  ELSE
    RAISE NOTICE '⚠️  pg_cron extension not available. Manual refresh required.';
    RAISE NOTICE '   To refresh manually:';
    RAISE NOTICE '   - Incremental: SELECT refresh_dashboard_views(true);';
    RAISE NOTICE '   - Full: SELECT refresh_dashboard_views(false);';
  END IF;
END $$;

