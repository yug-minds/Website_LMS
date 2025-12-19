-- Fix infinite recursion in teachers table RLS policies
-- Issue: Teachers policies query profiles table, which can cause recursion
-- Solution: Use the is_admin_user() SECURITY DEFINER function instead

-- Drop all existing teachers policies that query profiles directly
DROP POLICY IF EXISTS "Admins can manage all teachers" ON teachers;
DROP POLICY IF EXISTS "Admin full access teachers" ON teachers;
DROP POLICY IF EXISTS "Admins can manage teachers" ON teachers;
DROP POLICY IF EXISTS "School admins can view their school teachers" ON teachers;
DROP POLICY IF EXISTS "Teachers can view their own profile" ON teachers;
DROP POLICY IF EXISTS "Teachers can access own data" ON teachers;
DROP POLICY IF EXISTS "Allow all access teachers" ON teachers;

-- Ensure is_admin_user() function exists (created in fix_profiles_rls_infinite_recursion.sql)
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

-- Create new policies using is_admin_user() to avoid recursion
CREATE POLICY "Admins can manage all teachers" ON teachers
FOR ALL 
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

-- Allow school admins to view teachers (using function to check role without recursion)
CREATE OR REPLACE FUNCTION public.is_school_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'school_admin'
  );
$$;

CREATE POLICY "School admins can view teachers" ON teachers
FOR SELECT 
USING (public.is_school_admin_user() OR public.is_admin_user());

-- Allow teachers to view their own record (by matching email with profiles)
CREATE POLICY "Teachers can view own record" ON teachers
FOR SELECT 
USING (
  email IN (
    SELECT email FROM public.profiles 
    WHERE id = auth.uid()
  )
  OR public.is_admin_user()
  OR public.is_school_admin_user()
);

-- Note: For service role (supabaseAdmin), RLS is bypassed automatically
-- These policies only apply to authenticated users using the anon key







