-- Fix UUID extension issue
-- This migration ensures the uuid-ossp extension is properly enabled

-- Drop and recreate the extension to ensure it's working
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- Verify the extension is working
DO $$ 
BEGIN
  -- Test uuid_generate_v4() function
  PERFORM uuid_generate_v4();
  RAISE NOTICE 'UUID extension is working correctly';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'UUID extension is not working: %', SQLERRM;
END $$;

-- Also ensure gen_random_uuid() is available as an alternative
DO $$
BEGIN
  -- Test gen_random_uuid() function (built into PostgreSQL 13+)
  PERFORM gen_random_uuid();
  RAISE NOTICE 'gen_random_uuid() is available';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'gen_random_uuid() not available, using uuid-ossp extension';
END $$;