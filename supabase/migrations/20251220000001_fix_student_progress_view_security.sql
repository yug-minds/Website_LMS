-- ==========================================================
-- Migration: Fix student_progress_view SECURITY DEFINER Issue
-- Date: 2025-12-20
-- Purpose: Remove SECURITY DEFINER from student_progress_view to use SECURITY INVOKER
--          This ensures the view respects the querying user's permissions
--          and row-level security policies instead of the view creator's
-- ==========================================================

-- Drop and recreate the view to ensure it uses SECURITY INVOKER
-- Views in PostgreSQL default to SECURITY INVOKER behavior, which means
-- they execute with the privileges of the querying user and respect RLS policies
DROP VIEW IF EXISTS public.student_progress_view CASCADE;

-- Recreate the view with explicit security_invoker for PostgreSQL 15+
-- For older versions, views default to SECURITY INVOKER behavior
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    -- PostgreSQL 15+ supports WITH (security_invoker = true)
    -- Create with security_invoker from the start to avoid any SECURITY DEFINER detection
    EXECUTE 'CREATE VIEW public.student_progress_view 
      WITH (security_invoker = true) AS
      SELECT 
        e.student_id,
        e.course_id,
        c.name AS course_name,
        c.title,
        c.description,
        c.grade,
        c.subject,
        c.thumbnail_url,
        c.release_type,
        e.progress_percentage,
        e.last_accessed,
        e.status,
        
        (SELECT COUNT(*) FROM chapters WHERE course_id = c.id AND is_published = true) AS total_chapters,
        
        (SELECT COUNT(*) FROM course_progress cp 
         WHERE cp.course_id = c.id 
         AND cp.student_id = e.student_id 
         AND cp.completed = true) AS completed_chapters,
        
        (SELECT COUNT(*) FROM assignments WHERE course_id = c.id AND is_published = true) AS total_assignments,
        
        (SELECT COUNT(*) FROM submissions s 
         INNER JOIN assignments a ON a.id = s.assignment_id
         WHERE a.course_id = c.id 
         AND s.student_id = e.student_id 
         AND s.status = ''submitted'') AS completed_assignments,
        
        (SELECT AVG(grade) FROM submissions s 
         INNER JOIN assignments a ON a.id = s.assignment_id
         WHERE a.course_id = c.id 
         AND s.student_id = e.student_id 
         AND s.grade IS NOT NULL) AS average_grade

      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.status = ''active''';
  ELSE
    -- For older PostgreSQL versions, create normally (defaults to SECURITY INVOKER)
    EXECUTE 'CREATE VIEW public.student_progress_view AS
      SELECT 
        e.student_id,
        e.course_id,
        c.name AS course_name,
        c.title,
        c.description,
        c.grade,
        c.subject,
        c.thumbnail_url,
        c.release_type,
        e.progress_percentage,
        e.last_accessed,
        e.status,
        
        (SELECT COUNT(*) FROM chapters WHERE course_id = c.id AND is_published = true) AS total_chapters,
        
        (SELECT COUNT(*) FROM course_progress cp 
         WHERE cp.course_id = c.id 
         AND cp.student_id = e.student_id 
         AND cp.completed = true) AS completed_chapters,
        
        (SELECT COUNT(*) FROM assignments WHERE course_id = c.id AND is_published = true) AS total_assignments,
        
        (SELECT COUNT(*) FROM submissions s 
         INNER JOIN assignments a ON a.id = s.assignment_id
         WHERE a.course_id = c.id 
         AND s.student_id = e.student_id 
         AND s.status = ''submitted'') AS completed_assignments,
        
        (SELECT AVG(grade) FROM submissions s 
         INNER JOIN assignments a ON a.id = s.assignment_id
         WHERE a.course_id = c.id 
         AND s.student_id = e.student_id 
         AND s.grade IS NOT NULL) AS average_grade

      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.status = ''active''';
  END IF;
END $$;

-- Grant access to view (preserve original permissions)
GRANT SELECT ON public.student_progress_view TO authenticated;

COMMENT ON VIEW public.student_progress_view IS 'Comprehensive view of student progress across all courses. Uses SECURITY INVOKER to respect querying user permissions and RLS policies.';

