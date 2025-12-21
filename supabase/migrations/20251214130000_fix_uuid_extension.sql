-- Fix UUID extension issue
-- Ensure uuid-ossp extension is properly enabled

-- Enable the uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify the extension is working
DO $$ 
BEGIN
  -- Test uuid_generate_v4() function
  PERFORM uuid_generate_v4();
  RAISE NOTICE 'UUID extension is working correctly';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'UUID extension is not working: %', SQLERRM;
END $$;