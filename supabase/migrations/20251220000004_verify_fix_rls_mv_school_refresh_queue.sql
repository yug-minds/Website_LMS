-- ==========================================================
-- Migration: Verify and Fix RLS on mv_school_refresh_queue
-- Date: 2025-12-20
-- Purpose: Ensure RLS is definitely enabled on mv_school_refresh_queue
--          This is a verification/repair migration to ensure RLS is enabled
-- ==========================================================

-- First, verify if RLS is enabled and enable it if not
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'mv_school_refresh_queue'
  ) THEN
    -- Check if RLS is enabled
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = 'mv_school_refresh_queue'
    AND relnamespace = 'public'::regnamespace;
    
    -- Enable RLS if not already enabled
    IF NOT rls_enabled THEN
      ALTER TABLE public.mv_school_refresh_queue ENABLE ROW LEVEL SECURITY;
      RAISE NOTICE 'RLS has been enabled on mv_school_refresh_queue';
    ELSE
      RAISE NOTICE 'RLS is already enabled on mv_school_refresh_queue';
    END IF;
  ELSE
    RAISE WARNING 'Table mv_school_refresh_queue does not exist';
  END IF;
END $$;

-- Ensure policies exist (drop and recreate to be sure)
DROP POLICY IF EXISTS "Admins can manage refresh queue" ON public.mv_school_refresh_queue;
DROP POLICY IF EXISTS "School admins can view their school refresh status" ON public.mv_school_refresh_queue;

-- Recreate policies
CREATE POLICY "Admins can manage refresh queue" ON public.mv_school_refresh_queue
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "School admins can view their school refresh status" ON public.mv_school_refresh_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND p.school_id = mv_school_refresh_queue.school_id
    )
  );

-- Update comment
COMMENT ON TABLE public.mv_school_refresh_queue IS 'Tracks which schools need their materialized view stats refreshed. Populated by triggers on data changes. RLS enabled - admins have full access, school admins can view their school status.';




