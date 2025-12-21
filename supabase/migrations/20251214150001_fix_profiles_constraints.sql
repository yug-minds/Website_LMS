-- ============================================================================
-- Fix profiles table constraints
-- Date: 2025-12-14
-- ============================================================================

-- Remove problematic foreign key constraints from profiles table
DO $$
BEGIN
  -- Check if profiles table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    
    -- Drop any self-referencing foreign key constraints that might be causing issues
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_school_id_fkey;
    
    -- Re-add school_id foreign key constraint if schools table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schools' AND table_schema = 'public') THEN
      ALTER TABLE public.profiles 
      ADD CONSTRAINT profiles_school_id_fkey 
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
      
      RAISE NOTICE 'Re-added profiles.school_id foreign key constraint';
    END IF;
    
    RAISE NOTICE 'Fixed profiles table constraints';
  ELSE
    RAISE NOTICE 'Profiles table does not exist - skipping';
  END IF;
END $$;