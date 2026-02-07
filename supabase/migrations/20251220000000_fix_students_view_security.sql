-- ==========================================================
-- Migration: Fix students_view SECURITY DEFINER Issue
-- Date: 2025-12-20
-- Purpose: Remove SECURITY DEFINER from students_view to use SECURITY INVOKER
--          This ensures the view respects the querying user's permissions
--          and row-level security policies instead of the view creator's
-- ==========================================================

-- Drop and recreate the view to ensure it uses SECURITY INVOKER
-- Views in PostgreSQL default to SECURITY INVOKER behavior, which means
-- they execute with the privileges of the querying user and respect RLS policies
DROP VIEW IF EXISTS public.students_view;

-- Recreate the view with explicit SECURITY INVOKER for PostgreSQL 15+
-- For older versions, views default to SECURITY INVOKER behavior
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    -- PostgreSQL 15+ supports WITH (security_invoker = true)
    EXECUTE 'CREATE VIEW public.students_view 
      WITH (security_invoker = true) AS
      SELECT 
        p.id as profile_id,
        p.id as id,
        p.full_name,
        p.email,
        p.phone,
        p.address,
        p.parent_name,
        p.parent_phone,
        ss.school_id,
        ss.grade,
        ss.joining_code,
        ss.enrolled_at as created_at,
        ss.enrolled_at,
        NOW() as updated_at,
        NULL::TIMESTAMPTZ as last_login
      FROM profiles p
      LEFT JOIN student_schools ss ON ss.student_id = p.id AND ss.is_active = true
      WHERE p.role = ''student''';
  ELSE
    -- For older PostgreSQL versions, create normally (defaults to SECURITY INVOKER)
    EXECUTE 'CREATE VIEW public.students_view AS
      SELECT 
        p.id as profile_id,
        p.id as id,
        p.full_name,
        p.email,
        p.phone,
        p.address,
        p.parent_name,
        p.parent_phone,
        ss.school_id,
        ss.grade,
        ss.joining_code,
        ss.enrolled_at as created_at,
        ss.enrolled_at,
        NOW() as updated_at,
        NULL::TIMESTAMPTZ as last_login
      FROM profiles p
      LEFT JOIN student_schools ss ON ss.student_id = p.id AND ss.is_active = true
      WHERE p.role = ''student''';
  END IF;
END $$;

COMMENT ON VIEW public.students_view IS 'View combining profiles and student_schools for backward compatibility with students table. Uses SECURITY INVOKER to respect querying user permissions and RLS policies.';

