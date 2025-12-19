-- ============================================================================
-- Migration: Ensure Course Deletion CASCADE Constraints (Fixed)
-- Date: 2025-01-12
-- Purpose: Verify and fix foreign key constraints for existing tables only
-- ============================================================================

-- Only fix constraints for tables that actually exist
DO $$
BEGIN
  -- Fix chapters.course_id -> courses.id (if both tables exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chapters' AND table_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'courses' AND table_schema = 'public') THEN
    
    ALTER TABLE public.chapters 
    DROP CONSTRAINT IF EXISTS chapters_course_id_fkey;
    
    ALTER TABLE public.chapters 
    ADD CONSTRAINT chapters_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed chapters.course_id foreign key to use CASCADE';
  END IF;

  -- Fix course_access.course_id -> courses.id (if both tables exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_access' AND table_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'courses' AND table_schema = 'public') THEN
    
    ALTER TABLE public.course_access 
    DROP CONSTRAINT IF EXISTS course_access_course_id_fkey;
    
    ALTER TABLE public.course_access 
    ADD CONSTRAINT course_access_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed course_access.course_id foreign key to use CASCADE';
  END IF;

  -- Fix enrollments.course_id -> courses.id (if both tables exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollments' AND table_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'courses' AND table_schema = 'public') THEN
    
    ALTER TABLE public.enrollments 
    DROP CONSTRAINT IF EXISTS enrollments_course_id_fkey;
    
    ALTER TABLE public.enrollments 
    ADD CONSTRAINT enrollments_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed enrollments.course_id foreign key to use CASCADE';
  END IF;

  RAISE NOTICE 'Course deletion CASCADE constraints verified and fixed';
END $$;