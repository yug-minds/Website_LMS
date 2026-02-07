-- Fix school_admins table id column default value
-- Ensure the id column has a proper default UUID generation

-- First, ensure the UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Check if school_admins table exists and fix the id column default
DO $$
BEGIN
  -- Check if school_admins table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'school_admins' AND table_schema = 'public') THEN
    -- Ensure id column has default UUID generation
    -- Try gen_random_uuid() first (built-in, no extension needed in PostgreSQL 13+)
    BEGIN
      ALTER TABLE public.school_admins 
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
      RAISE NOTICE 'Set school_admins.id default to gen_random_uuid()';
    EXCEPTION WHEN OTHERS THEN
      -- Fallback to uuid_generate_v4() if gen_random_uuid() is not available
      BEGIN
        ALTER TABLE public.school_admins 
        ALTER COLUMN id SET DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Set school_admins.id default to uuid_generate_v4()';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not set default for school_admins.id: %', SQLERRM;
      END;
    END;
  ELSE
    RAISE NOTICE 'School_admins table does not exist - skipping';
  END IF;
END $$;




