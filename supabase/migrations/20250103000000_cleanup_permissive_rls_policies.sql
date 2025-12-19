-- Cleanup migration: Remove permissive RLS policies and re-enable proper security
-- This migration removes temporary/testing policies that bypass RLS security
-- Created: 2025-01-03
-- Purpose: Secure RLS policies by removing permissive "Allow all access" policies

-- ============================================================================
-- Step 1: Remove permissive "Allow all access" policies
-- ============================================================================

-- Drop permissive policies from profiles table
DROP POLICY IF EXISTS "Allow all access profiles" ON profiles;
DROP POLICY IF EXISTS "Allow all access teachers" ON teachers;
DROP POLICY IF EXISTS "Allow all access teacher leaves" ON teacher_leaves;
DROP POLICY IF EXISTS "Allow all access schools" ON schools;
DROP POLICY IF EXISTS "Allow all access teacher reports" ON teacher_reports;

-- ============================================================================
-- Step 2: Ensure RLS is enabled on all critical tables
-- ============================================================================

-- Re-enable RLS on all tables (safe to run even if already enabled)
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_admins ENABLE ROW LEVEL SECURITY;

-- Enable RLS on students table if it exists (using DO block to handle gracefully)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'students') THEN
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Document existing proper policies (these should remain)
-- ============================================================================
-- Note: The following policies should already exist from other migrations:
-- - "Users can access own profile" on profiles (from fix_profiles_rls_recursion.sql)
-- - "Admins can manage all profiles" on profiles (using is_admin_user() function)
-- - Proper school_admin, teacher, and student RLS policies
-- 
-- If proper policies don't exist, they should be created in separate migrations
-- that check for admin role via the is_admin_user() SECURITY DEFINER function

-- ============================================================================
-- Step 4: Create admin access function if it doesn't exist
-- ============================================================================
-- This function is used by RLS policies to check admin status without recursion
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================================
-- Verification: Check that permissive policies are removed
-- ============================================================================
-- Run this query manually to verify:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE policyname LIKE '%Allow all access%' OR qual LIKE '%true%';
--
-- No rows should be returned after this migration runs.

