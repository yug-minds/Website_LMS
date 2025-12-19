-- Enable RLS on school_admins table
-- This migration fixes the security issue where RLS policies exist but RLS is disabled
-- Created: 2025-01-12
-- Purpose: Ensure RLS is enabled on school_admins table to enforce security policies

-- Enable Row Level Security on school_admins table
ALTER TABLE school_admins ENABLE ROW LEVEL SECURITY;

-- Verify that the policies exist (they should already exist from previous migrations)
-- If they don't exist, they will be created below

-- Policy: Admins can manage all school admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'school_admins' 
    AND policyname = 'Admins can manage all school admins'
  ) THEN
    CREATE POLICY "Admins can manage all school admins" ON school_admins
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- Policy: School admins can view their own data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'school_admins' 
    AND policyname = 'School admins can view their own data'
  ) THEN
    CREATE POLICY "School admins can view their own data" ON school_admins
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() AND role = 'school_admin' AND school_id = school_admins.school_id
        )
      );
  END IF;
END $$;





