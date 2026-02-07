-- =======================================================================
-- Fix student_schools table id column default value
-- 
-- Date: 2025-12-23
-- Purpose: Ensure the id column has a proper default UUID generation
-- =======================================================================

-- First, ensure the UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Check if student_schools table exists and fix the id column default
DO $$
BEGIN
  -- Check if student_schools table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_schools' AND table_schema = 'public') THEN
    -- Ensure id column has default UUID generation
    -- Try gen_random_uuid() first (built-in, no extension needed in PostgreSQL 13+)
    BEGIN
      ALTER TABLE public.student_schools 
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
      RAISE NOTICE 'Set student_schools.id default to gen_random_uuid()';
    EXCEPTION WHEN OTHERS THEN
      -- Fallback to uuid_generate_v4() if gen_random_uuid() is not available
      BEGIN
        ALTER TABLE public.student_schools 
        ALTER COLUMN id SET DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Set student_schools.id default to uuid_generate_v4()';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not set default for student_schools.id: %', SQLERRM;
      END;
    END;
  ELSE
    RAISE NOTICE 'Student_schools table does not exist - skipping';
  END IF;
END $$;




