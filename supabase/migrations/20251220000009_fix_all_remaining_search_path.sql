-- ==========================================================
-- Migration: Fix search_path for all remaining functions
-- Date: 2025-12-20
-- Purpose: Set immutable search_path for all functions to prevent search path injection
--          This is a comprehensive fix for all functions detected by the security scanner
-- ==========================================================

-- Fix search_path for all functions that don't have it set
-- This migration handles all remaining functions with mutable search_path
DO $$
DECLARE
  func_record RECORD;
  fixed_count INTEGER := 0;
  error_count INTEGER := 0;
BEGIN
  -- Find all functions in public and private schemas that don't have search_path set
  FOR func_record IN
    SELECT 
      n.nspname as schema_name,
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args,
      p.oid as func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'private')
    AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql', 'sql'))
    AND (p.proconfig IS NULL OR NOT ('search_path' = ANY(p.proconfig)))
    AND p.proname NOT IN (
      -- Exclude functions that are already fixed or are system functions
      'pg_stat_statements_reset',
      'pg_stat_statements_info'
    )
    ORDER BY n.nspname, p.proname
  LOOP
    BEGIN
      -- Build the ALTER FUNCTION command
      IF func_record.func_args = '' THEN
        EXECUTE format('ALTER FUNCTION %I.%I() SET search_path = ''''', 
          func_record.schema_name, func_record.func_name);
      ELSE
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = ''''', 
          func_record.schema_name, func_record.func_name, func_record.func_args);
      END IF;
      
      fixed_count := fixed_count + 1;
      
      -- Log every 10th function to avoid too much output
      IF fixed_count % 10 = 0 THEN
        RAISE NOTICE 'Fixed search_path for % functions so far...', fixed_count;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      -- Only log warnings for functions that might be important
      IF func_record.func_name IN (
        'update_notification_replies_updated_at',
        'update_course_access',
        'create_student_enrollment',
        'update_student_enrollment',
        'check_and_generate_certificate',
        'get_school_admin_stats',
        'refresh_dashboard_views',
        'student_has_course_access',
        'get_admin_stats',
        'get_student_dashboard_stats',
        'get_teacher_dashboard_stats'
      ) THEN
        RAISE WARNING 'Could not fix search_path for %.%(%): %', 
          func_record.schema_name, func_record.func_name, func_record.func_args, SQLERRM;
      END IF;
    END;
  END LOOP;
  
  RAISE NOTICE 'Migration complete: Fixed % functions, % errors', fixed_count, error_count;
END $$;




