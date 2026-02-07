-- Fix schools table id column default value
-- Ensure the id column has a proper default UUID generation

-- First, ensure the UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Check if schools table exists and fix the id column default
DO $$
BEGIN
  -- Check if schools table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schools' AND table_schema = 'public') THEN
    -- Ensure id column has default UUID generation
    -- Try gen_random_uuid() first (built-in, no extension needed in PostgreSQL 13+)
    BEGIN
      ALTER TABLE public.schools 
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
      RAISE NOTICE 'Set schools.id default to gen_random_uuid()';
    EXCEPTION WHEN OTHERS THEN
      -- Fallback to uuid_generate_v4() if gen_random_uuid() is not available
      BEGIN
        ALTER TABLE public.schools 
        ALTER COLUMN id SET DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Set schools.id default to uuid_generate_v4()';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not set default for schools.id: %', SQLERRM;
      END;
    END;
  ELSE
    RAISE NOTICE 'Schools table does not exist - skipping';
  END IF;
END $$;




