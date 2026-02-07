-- ==========================================================
-- Migration: Enable RLS on mv_school_refresh_queue
-- Date: 2025-12-20
-- Purpose: Enable Row Level Security on mv_school_refresh_queue table
--          to ensure proper access control for the materialized view refresh queue
-- ==========================================================

-- Enable Row Level Security on the table
-- The table should exist from migration 20250130000016_advanced_materialized_view_optimizations.sql
ALTER TABLE public.mv_school_refresh_queue ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Admins can manage refresh queue" ON public.mv_school_refresh_queue;
DROP POLICY IF EXISTS "School admins can view their school refresh status" ON public.mv_school_refresh_queue;

-- Policy 1: Admins have full access to manage the refresh queue
-- This allows admins to view, insert, update, and delete queue entries
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

-- Policy 2: School admins can view their own school's refresh queue status
-- This allows school admins to see if their school is queued for refresh
-- but they cannot modify the queue (read-only access)
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

-- Note: Regular authenticated users and other roles do not have access to this table
-- as it's an internal system table for managing materialized view refreshes.

COMMENT ON TABLE public.mv_school_refresh_queue IS 'Tracks which schools need their materialized view stats refreshed. Populated by triggers on data changes. RLS enabled - admins have full access, school admins can view their school status.';

