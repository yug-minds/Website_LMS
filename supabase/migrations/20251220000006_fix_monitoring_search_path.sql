-- ==========================================================
-- Migration: Fix search_path for monitoring functions
-- Date: 2025-12-20
-- Purpose: Set immutable search_path for monitoring functions to prevent search path injection
-- ==========================================================

-- Fix search_path for monitoring.check_active_connections function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_active_connections'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_active_connections() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_active_connections()';
  END IF;
END $$;

-- Fix search_path for monitoring.check_slow_queries function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_slow_queries'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_slow_queries() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_slow_queries()';
  END IF;
END $$;

-- Fix search_path for monitoring.check_long_transactions function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_long_transactions'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_long_transactions() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_long_transactions()';
  END IF;
END $$;

-- Fix search_path for monitoring.post_alert function
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Handle all overloads of post_alert
  FOR rec IN
    SELECT pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'post_alert'
  LOOP
    BEGIN
      IF rec.args = '' THEN
        EXECUTE 'ALTER FUNCTION monitoring.post_alert() SET search_path = ''''';
      ELSE
        EXECUTE format('ALTER FUNCTION monitoring.post_alert(%s) SET search_path = ''''', rec.args);
      END IF;
      RAISE NOTICE 'Fixed search_path for monitoring.post_alert(%)', rec.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not fix search_path for monitoring.post_alert(%): %', rec.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- Fix search_path for private.set_monitoring_webhook function (if it's plpgsql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'private'
    AND p.proname = 'set_monitoring_webhook'
    AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
  ) THEN
    ALTER FUNCTION private.set_monitoring_webhook(text) 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for private.set_monitoring_webhook(text)';
  END IF;
END $$;

-- Fix search_path for monitoring.check_lock_waits function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_lock_waits'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_lock_waits() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_lock_waits()';
  END IF;
END $$;

-- Fix search_path for monitoring.check_deadlocks function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_deadlocks'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_deadlocks() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_deadlocks()';
  END IF;
END $$;

-- Fix search_path for monitoring.check_storage_growth function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_storage_growth'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_storage_growth() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_storage_growth()';
  END IF;
END $$;

-- Fix search_path for monitoring.check_very_slow_queries function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'monitoring'
    AND p.proname = 'check_very_slow_queries'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION monitoring.check_very_slow_queries() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for monitoring.check_very_slow_queries()';
  END IF;
END $$;

