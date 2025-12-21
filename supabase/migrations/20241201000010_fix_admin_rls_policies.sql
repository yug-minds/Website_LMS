-- Fix RLS policies for admin access
-- This migration ensures admin users can access all data

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can manage teachers" ON teachers;
DROP POLICY IF EXISTS "Teachers can view their own profile" ON teachers;
DROP POLICY IF EXISTS "School admins can view their school teachers" ON teachers;
DROP POLICY IF EXISTS "Admin full access on all core tables" ON teachers;
DROP POLICY IF EXISTS "Teachers can manage their leaves" ON teacher_leaves;
DROP POLICY IF EXISTS "Admin can manage all data" ON profiles;

-- Create simple, effective policies for admin access
CREATE POLICY "Admin full access teachers" ON teachers
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admin full access teacher leaves" ON teacher_leaves
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admin full access profiles" ON profiles
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "Admin full access schools" ON schools
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admin full access teacher reports" ON teacher_reports
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Also allow users to access their own data
CREATE POLICY "Users can access own profile" ON profiles
FOR ALL USING (id = auth.uid());

CREATE POLICY "Teachers can access own data" ON teachers
FOR ALL USING (
  id IN (
    SELECT t.id FROM teachers t
    JOIN profiles p ON p.email = t.email
    WHERE p.id = auth.uid()
  )
);

CREATE POLICY "Teachers can access own leaves" ON teacher_leaves
FOR ALL USING (teacher_id = auth.uid());












