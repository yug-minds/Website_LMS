-- Optimize Query Performance
-- This migration adds indexes and optimizations to improve query performance
-- Created: 2025-11-06
-- Purpose: Improve database query performance for common operations

-- ============================================================================
-- 1. Add indexes for analytics log_events table (if it exists)
-- ============================================================================
-- These indexes help with the frequent INSERT operations on analytics tables
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Check if _analytics schema exists and create indexes
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '_analytics') THEN
    -- Get all log_events tables in _analytics schema
    FOR rec IN 
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = '_analytics' 
      AND tablename LIKE 'log_events_%'
    LOOP
      -- Create index on timestamp for faster queries
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_timestamp ON _analytics.%I(timestamp)', 
                     rec.tablename, rec.tablename);
      
      -- Create index on event_message for filtering
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_event_message ON _analytics.%I(event_message)', 
                     rec.tablename, rec.tablename);
    END LOOP;
  END IF;
END $$;

-- ============================================================================
-- 2. Note on pg_stat_statements
-- ============================================================================
-- pg_stat_statements settings need to be configured in postgresql.conf
-- or via ALTER SYSTEM (requires superuser and server restart)
-- These settings are typically already optimized in Supabase

-- ============================================================================
-- 3. Add indexes for frequently queried columns
-- ============================================================================

-- Indexes for course_access table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_access') THEN
    -- Composite index for common query patterns
    CREATE INDEX IF NOT EXISTS idx_course_access_school_grade_course 
    ON public.course_access(school_id, grade, course_id);
    
    -- Index for course lookups
    CREATE INDEX IF NOT EXISTS idx_course_access_course_school 
    ON public.course_access(course_id, school_id);
  END IF;
END $$;

-- Indexes for profiles table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    -- Index for role-based queries
    CREATE INDEX IF NOT EXISTS idx_profiles_role_school 
    ON public.profiles(role, school_id) 
    WHERE school_id IS NOT NULL;
    
    -- Index for email lookups (if not exists)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profiles' AND indexname = 'profiles_email_key') THEN
      CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
    END IF;
  END IF;
END $$;

-- Indexes for schools table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schools') THEN
    -- Index for code lookups (only if column exists)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'schools' 
      AND column_name = 'code'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_schools_code ON public.schools(code) WHERE code IS NOT NULL;
    END IF;
  END IF;
END $$;

-- Indexes for teacher_reports table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'teacher_reports') THEN
    -- Composite index for date range queries
    CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_date 
    ON public.teacher_reports(teacher_id, date DESC);
    
    -- Index for school-based queries
    CREATE INDEX IF NOT EXISTS idx_teacher_reports_school_date 
    ON public.teacher_reports(school_id, date DESC);
  END IF;
END $$;

-- Indexes for student_schools table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'student_schools') THEN
    -- Composite index for school/grade lookups
    CREATE INDEX IF NOT EXISTS idx_student_schools_school_grade 
    ON public.student_schools(school_id, grade);
    
    -- Index for student lookups
    CREATE INDEX IF NOT EXISTS idx_student_schools_student 
    ON public.student_schools(student_id);
  END IF;
END $$;

-- Indexes for teacher_schools table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'teacher_schools') THEN
    -- Index for school-based queries
    CREATE INDEX IF NOT EXISTS idx_teacher_schools_school 
    ON public.teacher_schools(school_id);
    
    -- Index for teacher lookups
    CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher 
    ON public.teacher_schools(teacher_id);
  END IF;
END $$;

-- ============================================================================
-- 4. Analyze tables to update statistics
-- ============================================================================
-- Update table statistics for better query planning
ANALYZE public.profiles;
ANALYZE public.schools;
ANALYZE public.courses;
ANALYZE public.teacher_reports;
ANALYZE public.student_schools;
ANALYZE public.teacher_schools;

-- Analyze course_access if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_access') THEN
    ANALYZE public.course_access;
  END IF;
END $$;

-- ============================================================================
-- 5. Vacuum and optimize
-- ============================================================================
-- Vacuum analyze to reclaim space and update statistics
-- Note: VACUUM cannot run in a transaction, so it's commented out
-- Run manually if needed: VACUUM ANALYZE;
-- VACUUM ANALYZE;

-- Note: The slow queries from Supabase internal tools (schema introspection,
-- linter checks, etc.) cannot be directly optimized as they are part of
-- Supabase's infrastructure. However, these optimizations will help with
-- your application's queries.

