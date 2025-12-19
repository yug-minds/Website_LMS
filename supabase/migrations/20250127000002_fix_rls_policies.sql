-- ==========================================================
-- Migration: Fix RLS Policies to Use Correct Source Tables
-- Date: 2025-01-27
-- Purpose: Update RLS policies to use junction tables instead of profiles.school_id
-- ==========================================================

-- ==========================================================
-- PART 1: Fix School Admin RLS Policies
-- ==========================================================

-- Drop old policies that rely on profiles.school_id
DROP POLICY IF EXISTS "School admins can view their school students" ON student_schools;
DROP POLICY IF EXISTS "School admins can manage their school students" ON student_schools;

-- Create new policy that uses school_admins.school_id (more reliable)
CREATE POLICY "School admins can view their school students" ON student_schools
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM school_admins sa
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND sa.school_id = student_schools.school_id
        AND sa.is_active = true
    )
  );

CREATE POLICY "School admins can manage their school students" ON student_schools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM school_admins sa
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND sa.school_id = student_schools.school_id
        AND sa.is_active = true
    )
  );

-- Fix school admin policies for teacher_schools
DROP POLICY IF EXISTS "School admins can view their school teachers" ON teacher_schools;
DROP POLICY IF EXISTS "School admins can manage their school teachers" ON teacher_schools;

CREATE POLICY "School admins can view their school teachers" ON teacher_schools
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM school_admins sa
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND sa.school_id = teacher_schools.school_id
        AND sa.is_active = true
    )
  );

CREATE POLICY "School admins can manage their school teachers" ON teacher_schools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM school_admins sa
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND sa.school_id = teacher_schools.school_id
        AND sa.is_active = true
    )
  );

-- Fix school admin policies for courses
DROP POLICY IF EXISTS "School admins can view their school courses" ON courses;

CREATE POLICY "School admins can view their school courses" ON courses
  FOR SELECT USING (
    -- Course is accessible via course_access table
    EXISTS (
      SELECT 1 FROM course_access ca
      JOIN school_admins sa ON sa.school_id = ca.school_id
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND ca.course_id = courses.id
        AND sa.is_active = true
    )
    OR
    -- Or course has school_id matching school admin's school
    EXISTS (
      SELECT 1 FROM school_admins sa
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND sa.school_id = courses.school_id
        AND sa.is_active = true
    )
  );

-- ==========================================================
-- PART 2: Fix Teacher RLS Policies
-- ==========================================================

-- Fix teacher policies to use teacher_schools instead of profiles.school_id
DROP POLICY IF EXISTS "Teachers can view their school students" ON student_schools;

CREATE POLICY "Teachers can view their school students" ON student_schools
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE p.id = auth.uid() 
        AND p.role = 'teacher'
        AND ts.school_id = student_schools.school_id
    )
  );

-- Fix teacher policies for teacher_reports
DROP POLICY IF EXISTS "Teachers can view their reports" ON teacher_reports;

CREATE POLICY "Teachers can view their reports" ON teacher_reports
  FOR SELECT USING (
    teacher_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM teacher_schools ts
      JOIN profiles p ON p.id = ts.teacher_id
      WHERE p.id = auth.uid() 
        AND p.role = 'teacher'
        AND ts.school_id = teacher_reports.school_id
    )
  );

-- ==========================================================
-- PART 3: Fix Student RLS Policies
-- ==========================================================

-- Students should see their own student_schools records
DROP POLICY IF EXISTS "Students can view own enrollments" ON student_schools;

CREATE POLICY "Students can view own enrollments" ON student_schools
  FOR SELECT USING (student_id = auth.uid());

-- ==========================================================
-- PART 4: Fix Notification Policies
-- ==========================================================

-- Ensure notifications use correct school relationships
-- School admins should see notifications for students in their school
DROP POLICY IF EXISTS "School admins can view their school notifications" ON notifications;

CREATE POLICY "School admins can view their school notifications" ON notifications
  FOR SELECT USING (
    -- Own notifications
    user_id = auth.uid()
    OR
    -- Notifications for students in their school
    EXISTS (
      SELECT 1 FROM student_schools ss
      JOIN school_admins sa ON sa.school_id = ss.school_id
      JOIN profiles p ON p.id = sa.profile_id
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND ss.student_id = notifications.user_id
        AND ss.is_active = true
        AND sa.is_active = true
    )
  );

-- ==========================================================
-- PART 5: Fix Course Access Policies
-- ==========================================================

-- Students should see courses accessible to their school and grade
DROP POLICY IF EXISTS "Students can view accessible courses" ON course_access;

CREATE POLICY "Students can view accessible courses" ON course_access
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_schools ss
      WHERE ss.student_id = auth.uid()
        AND ss.school_id = course_access.school_id
        AND ss.grade = course_access.grade
        AND ss.is_active = true
    )
  );

-- ==========================================================
-- PART 6: Add Comments
-- ==========================================================

COMMENT ON POLICY "School admins can view their school students" ON student_schools IS 
'Uses school_admins.school_id instead of profiles.school_id for accurate access control';

COMMENT ON POLICY "Teachers can view their school students" ON student_schools IS 
'Uses teacher_schools.school_id instead of profiles.school_id for accurate access control';














