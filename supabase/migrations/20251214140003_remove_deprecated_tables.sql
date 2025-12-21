-- ==========================================================
-- Migration: Remove Deprecated Tables (Fixed)
-- Date: 2025-01-27
-- Purpose: Remove deprecated tables safely
-- ==========================================================

-- Remove deprecated tables only if they exist
DO $$
BEGIN
  -- Remove students table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students' AND table_schema = 'public') THEN
    DROP TABLE public.students CASCADE;
    RAISE NOTICE 'Removed deprecated students table';
  ELSE
    RAISE NOTICE 'Students table does not exist - skipping';
  END IF;
  
  -- Remove assignment_submissions table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assignment_submissions' AND table_schema = 'public') THEN
    DROP TABLE public.assignment_submissions CASCADE;
    RAISE NOTICE 'Removed deprecated assignment_submissions table';
  ELSE
    RAISE NOTICE 'Assignment_submissions table does not exist - skipping';
  END IF;
  
  RAISE NOTICE 'Deprecated table cleanup completed';
END $$;