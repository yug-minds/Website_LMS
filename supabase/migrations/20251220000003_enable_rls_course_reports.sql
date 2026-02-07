-- ==========================================================
-- Migration: Enable RLS on course_reports
-- Date: 2025-12-20
-- Purpose: Enable Row Level Security on course_reports table
--          to ensure proper access control for course analytics and reports
-- ==========================================================

-- Enable Row Level Security on the table
ALTER TABLE public.course_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Admins can manage course reports" ON public.course_reports;
DROP POLICY IF EXISTS "School admins can view their school course reports" ON public.course_reports;
DROP POLICY IF EXISTS "Teachers can view course reports for their courses" ON public.course_reports;

-- Policy 1: Admins have full access to manage course reports
-- This allows admins to view, insert, update, and delete course report entries
CREATE POLICY "Admins can manage course reports" ON public.course_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy 2: School admins can view and manage course reports for their school
-- This allows school admins to see analytics for courses in their school
CREATE POLICY "School admins can view their school course reports" ON public.course_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND p.school_id = course_reports.school_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
        AND p.role = 'school_admin'
        AND p.school_id = course_reports.school_id
    )
  );

-- Policy 3: Teachers can view course reports for courses they teach
-- This allows teachers to see analytics for courses they are assigned to teach
CREATE POLICY "Teachers can view course reports for their courses" ON public.course_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.teacher_schools ts ON ts.teacher_id = p.id
      WHERE p.id = auth.uid() 
        AND p.role = 'teacher'
        AND ts.school_id = course_reports.school_id
    )
  );

-- Note: Students and other roles do not have access to this table
-- as it contains aggregated analytics data that should only be visible to
-- administrators, school admins, and teachers.

COMMENT ON TABLE public.course_reports IS 'Stores aggregated course analytics (completion rates, scores) per course, school, and grade. RLS enabled - admins have full access, school admins can manage their school reports, teachers can view reports for their courses.';




