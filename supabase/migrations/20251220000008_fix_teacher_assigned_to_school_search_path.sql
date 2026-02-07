-- ==========================================================
-- Migration: Fix search_path for teacher_assigned_to_school function
-- Date: 2025-12-20
-- Purpose: Set immutable search_path for teacher_assigned_to_school to prevent search path injection
-- ==========================================================

-- Fix search_path for teacher_assigned_to_school function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'teacher_assigned_to_school'
    AND pg_get_function_identity_arguments(p.oid) = 'school_id_param uuid'
  ) THEN
    ALTER FUNCTION public.teacher_assigned_to_school(school_id_param uuid) 
    SET search_path = '';
    RAISE NOTICE 'Fixed search_path for teacher_assigned_to_school(uuid)';
  END IF;
END $$;




