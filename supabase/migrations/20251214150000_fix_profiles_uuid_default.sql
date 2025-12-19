-- ============================================================================
-- Fix profiles table UUID default generation
-- Date: 2025-12-14
-- ============================================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add default UUID generation to profiles table if it doesn't exist
DO $$
BEGIN
  -- Check if profiles table exists and doesn't have default UUID
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    -- Add default UUID generation to id column
    ALTER TABLE public.profiles 
    ALTER COLUMN id SET DEFAULT uuid_generate_v4();
    
    RAISE NOTICE 'Added default UUID generation to profiles.id column';
  ELSE
    RAISE NOTICE 'Profiles table does not exist - skipping';
  END IF;
END $$;