-- Fix RLS infinite recursion for profiles table
-- This prevents the "Database error querying schema" error

-- Drop all existing problematic policies on profiles
DROP POLICY IF EXISTS "Admin full access profiles" ON profiles;
DROP POLICY IF EXISTS "Public read" ON profiles;
DROP POLICY IF EXISTS "Profiles can view self" ON profiles;
DROP POLICY IF EXISTS "Profiles can update self" ON profiles;
DROP POLICY IF EXISTS "Users can access own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can manage all data" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow all access profiles" ON profiles;

-- Create SECURITY DEFINER function to avoid recursion
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

-- Policy 1: Users can access their own profile (no recursion)
CREATE POLICY "Users can access own profile" 
ON profiles
FOR ALL 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy 2: Admins can manage all profiles (uses SECURITY DEFINER function)
CREATE POLICY "Admins can manage all profiles" 
ON profiles
FOR ALL 
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
