-- ==========================================================
-- Migration: Fix search_path for auto_enroll functions
-- Date: 2025-12-20
-- Purpose: Set immutable search_path for auto_enroll functions to prevent search path injection
-- ==========================================================

-- Fix search_path for auto_enroll_students_on_course_publish function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'auto_enroll_students_on_course_publish'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION public.auto_enroll_students_on_course_publish() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for auto_enroll_students_on_course_publish()';
  END IF;
END $$;

-- Fix search_path for auto_enroll_students_on_course_access_change function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'auto_enroll_students_on_course_access_change'
    AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION public.auto_enroll_students_on_course_access_change() 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for auto_enroll_students_on_course_access_change()';
  END IF;
END $$;

-- Fix search_path for enhanced_auto_enroll_students_on_course_publish function (if it exists)
-- This might be the function the scanner is detecting
DO $$
DECLARE
  rec RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'enhanced_auto_enroll_students_on_course_publish'
  ) THEN
    -- Get the function signature to handle overloads
    FOR rec IN
      SELECT pg_get_function_identity_arguments(p.oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'enhanced_auto_enroll_students_on_course_publish'
    LOOP
      EXECUTE format('ALTER FUNCTION public.enhanced_auto_enroll_students_on_course_publish(%s) SET search_path = ''''', rec.args);
      RAISE NOTICE 'Fixed search_path for enhanced_auto_enroll_students_on_course_publish(%)', rec.args;
    END LOOP;
  END IF;
END $$;

-- Also fix any other auto_enroll related functions that might exist
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT 
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND (
      p.proname LIKE '%auto_enroll%' 
      OR p.proname LIKE '%enhanced%auto_enroll%'
    )
    AND p.proconfig IS NULL  -- Only fix functions without search_path already set
  LOOP
    BEGIN
      IF func_record.func_args = '' THEN
        EXECUTE format('ALTER FUNCTION public.%I() SET search_path = ''''', func_record.func_name);
      ELSE
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = ''''', func_record.func_name, func_record.func_args);
      END IF;
      RAISE NOTICE 'Fixed search_path for %(%)', func_record.func_name, func_record.func_args;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not fix search_path for %(%): %', func_record.func_name, func_record.func_args, SQLERRM;
    END;
  END LOOP;
END $$;

