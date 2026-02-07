-- ==========================================================
-- Migration: Fix search_path for get_enrollment_statistics function
-- Date: 2025-12-20
-- Purpose: Set immutable search_path for get_enrollment_statistics to prevent search path injection
-- ==========================================================

-- Fix search_path for get_enrollment_statistics function
-- This function may have multiple overloads, so we handle all of them
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Handle all overloads of get_enrollment_statistics
  FOR rec IN
    SELECT 
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'get_enrollment_statistics'
    AND p.proconfig IS NULL  -- Only fix functions without search_path already set
  LOOP
    BEGIN
      IF rec.func_args = '' THEN
        EXECUTE format('ALTER FUNCTION public.%I() SET search_path = ''''', rec.func_name);
      ELSE
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = ''''', rec.func_name, rec.func_args);
      END IF;
      RAISE NOTICE 'Fixed search_path for get_enrollment_statistics(%)', rec.func_args;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not fix search_path for get_enrollment_statistics(%): %', rec.func_args, SQLERRM;
    END;
  END LOOP;
END $$;




