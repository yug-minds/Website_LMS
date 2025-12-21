-- ============================================================================
-- Migration: Ensure Course Deletion CASCADE Constraints
-- Date: 2025-01-12
-- Purpose: Verify and fix all foreign key constraints to ensure ON DELETE CASCADE
--          is properly set for all course-related tables
-- ============================================================================

-- This migration ensures that when a course is deleted, all related data
-- is automatically deleted via CASCADE constraints. It also serves as a
-- backup to the explicit deletion logic in the API.

-- ============================================================================
-- STEP 0: Ensure required columns exist before adding constraints
-- ============================================================================

-- Ensure assignments table has chapter_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'assignments' 
    AND column_name = 'chapter_id'
  ) THEN
    ALTER TABLE public.assignments 
    ADD COLUMN chapter_id UUID;
    
    RAISE NOTICE 'Added chapter_id column to assignments table';
  ELSE
    RAISE NOTICE 'chapter_id column already exists in assignments table';
  END IF;
END $$;

-- Ensure assignment_questions table has assignment_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'assignment_questions' 
    AND column_name = 'assignment_id'
  ) THEN
    ALTER TABLE public.assignment_questions 
    ADD COLUMN assignment_id UUID;
    
    RAISE NOTICE 'Added assignment_id column to assignment_questions table';
  ELSE
    RAISE NOTICE 'assignment_id column already exists in assignment_questions table';
  END IF;
END $$;

-- ============================================================================
-- STEP 1: Clean up orphaned data before adding constraints
-- ============================================================================

-- Delete orphaned chapters (chapters with course_id that doesn't exist in courses)
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM public.chapters ch
  WHERE ch.course_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = ch.course_id
  );
  
  IF orphaned_count > 0 THEN
    -- Delete orphaned chapters and their related data
    DELETE FROM public.chapter_contents
    WHERE chapter_id IN (
      SELECT id FROM public.chapters ch
      WHERE ch.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = ch.course_id
      )
    );
    
    DELETE FROM public.videos
    WHERE chapter_id IN (
      SELECT id FROM public.chapters ch
      WHERE ch.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = ch.course_id
      )
    );
    
    DELETE FROM public.materials
    WHERE chapter_id IN (
      SELECT id FROM public.chapters ch
      WHERE ch.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = ch.course_id
      )
    );
    
    -- Delete assignments linked to orphaned chapters via course_id
    -- Use course_id only (chapter_id may not exist in all database instances)
    DELETE FROM public.assignment_questions
    WHERE assignment_id IN (
      SELECT a.id FROM public.assignments a
      WHERE a.course_id IN (
        SELECT DISTINCT ch.course_id FROM public.chapters ch
        WHERE ch.course_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.courses c WHERE c.id = ch.course_id
        )
      )
    );
    
    DELETE FROM public.assignments
    WHERE course_id IN (
      SELECT DISTINCT ch.course_id FROM public.chapters ch
      WHERE ch.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = ch.course_id
      )
    );
    
    DELETE FROM public.chapters
    WHERE course_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.courses c WHERE c.id = chapters.course_id
    );
    
    RAISE NOTICE 'Deleted % orphaned chapters and their related data', orphaned_count;
  ELSE
    RAISE NOTICE 'No orphaned chapters found';
  END IF;
END $$;

-- Delete orphaned assignments (assignments with course_id that doesn't exist)
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM public.assignments a
  WHERE a.course_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = a.course_id
  );
  
  IF orphaned_count > 0 THEN
    -- Delete assignment questions first
    DELETE FROM public.assignment_questions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments a
      WHERE a.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = a.course_id
      )
    );
    
    -- Then delete orphaned assignments
    DELETE FROM public.assignments
    WHERE course_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.courses c WHERE c.id = assignments.course_id
    );
    
    RAISE NOTICE 'Deleted % orphaned assignments and their questions', orphaned_count;
  ELSE
    RAISE NOTICE 'No orphaned assignments found';
  END IF;
END $$;

-- Delete orphaned course_access records
DELETE FROM public.course_access
WHERE course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = course_access.course_id
);

-- Delete orphaned student_courses records
DELETE FROM public.student_courses
WHERE course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = student_courses.course_id
);

-- Delete orphaned course_progress records
DELETE FROM public.course_progress
WHERE course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = course_progress.course_id
);

-- Delete orphaned course_schedules records
DELETE FROM public.course_schedules
WHERE course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = course_schedules.course_id
);

-- Delete orphaned course_versions records
DELETE FROM public.course_versions
WHERE course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = course_versions.course_id
);

-- ============================================================================
-- STEP 2: Add foreign key constraints with CASCADE
-- ============================================================================

-- ============================================================================
-- 1. Fix chapters.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  -- Check if constraint exists and has CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'chapters'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    -- Drop existing constraint
    ALTER TABLE public.chapters 
    DROP CONSTRAINT IF EXISTS chapters_course_id_fkey;
    
    -- Recreate with CASCADE
    ALTER TABLE public.chapters 
    ADD CONSTRAINT chapters_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed chapters.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'chapters'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    -- Constraint doesn't exist, but first check for orphaned data
    IF EXISTS (
      SELECT 1 FROM public.chapters ch
      WHERE ch.course_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = ch.course_id)
    ) THEN
      -- Delete orphaned chapters and their related data before creating constraint
      DELETE FROM public.chapter_contents
      WHERE chapter_id IN (
        SELECT id FROM public.chapters ch
        WHERE ch.course_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = ch.course_id)
      );
      
      DELETE FROM public.videos
      WHERE chapter_id IN (
        SELECT id FROM public.chapters ch
        WHERE ch.course_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = ch.course_id)
      );
      
      DELETE FROM public.materials
      WHERE chapter_id IN (
        SELECT id FROM public.chapters ch
        WHERE ch.course_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = ch.course_id)
      );
      
      -- Delete assignments linked to orphaned chapters
      -- Use course_id since chapter_id may not exist in all database instances
      DELETE FROM public.assignment_questions
      WHERE assignment_id IN (
        SELECT a.id FROM public.assignments a
        WHERE a.course_id IN (
          SELECT DISTINCT ch.course_id FROM public.chapters ch
          WHERE ch.course_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = ch.course_id)
        )
      );
      
      DELETE FROM public.assignments
      WHERE course_id IN (
        SELECT DISTINCT ch.course_id FROM public.chapters ch
        WHERE ch.course_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = ch.course_id)
      );
      
      DELETE FROM public.chapters
      WHERE course_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = chapters.course_id);
      
      RAISE NOTICE 'Deleted orphaned chapters before creating constraint';
    END IF;
    
    -- Now create the constraint
    ALTER TABLE public.chapters 
    ADD CONSTRAINT chapters_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created chapters.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'chapters.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 2. Fix chapter_contents.chapter_id -> chapters.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'chapter_contents'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.chapter_contents 
    DROP CONSTRAINT IF EXISTS chapter_contents_chapter_id_fkey;
    
    ALTER TABLE public.chapter_contents 
    ADD CONSTRAINT chapter_contents_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed chapter_contents.chapter_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'chapter_contents'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
  ) THEN
    ALTER TABLE public.chapter_contents 
    ADD CONSTRAINT chapter_contents_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created chapter_contents.chapter_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'chapter_contents.chapter_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 3. Fix assignments.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'assignments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.assignments 
    DROP CONSTRAINT IF EXISTS assignments_course_id_fkey;
    
    ALTER TABLE public.assignments 
    ADD CONSTRAINT assignments_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed assignments.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'assignments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    -- Check for orphaned assignments before creating constraint
    IF EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.course_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = a.course_id)
    ) THEN
      -- Delete orphaned assignment questions first
      DELETE FROM public.assignment_questions
      WHERE assignment_id IN (
        SELECT id FROM public.assignments a
        WHERE a.course_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = a.course_id)
      );
      
      -- Delete orphaned assignments
      DELETE FROM public.assignments
      WHERE course_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = assignments.course_id);
      
      RAISE NOTICE 'Deleted orphaned assignments before creating constraint';
    END IF;
    
    ALTER TABLE public.assignments 
    ADD CONSTRAINT assignments_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created assignments.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'assignments.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 4. Fix assignments.chapter_id -> chapters.id
-- ============================================================================
DO $$
BEGIN
  -- First ensure the column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'assignments' 
    AND column_name = 'chapter_id'
  ) THEN
    ALTER TABLE public.assignments 
    ADD COLUMN chapter_id UUID;
    
    RAISE NOTICE 'Added chapter_id column to assignments table before creating constraint';
  END IF;
  
  -- Now check and create/update the constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'assignments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.assignments 
    DROP CONSTRAINT IF EXISTS assignments_chapter_id_fkey;
    
    ALTER TABLE public.assignments 
    ADD CONSTRAINT assignments_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed assignments.chapter_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'assignments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
  ) THEN
    -- Clean up any orphaned data before creating constraint
    DELETE FROM public.assignment_questions
    WHERE assignment_id IN (
      SELECT a.id FROM public.assignments a
      WHERE a.chapter_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.chapters c WHERE c.id = a.chapter_id)
    );
    
    DELETE FROM public.assignments
    WHERE chapter_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.chapters c WHERE c.id = assignments.chapter_id);
    
    ALTER TABLE public.assignments 
    ADD CONSTRAINT assignments_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created assignments.chapter_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'assignments.chapter_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 5. Fix assignment_questions.assignment_id -> assignments.id
-- ============================================================================
DO $$
BEGIN
  -- First ensure the column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'assignment_questions' 
    AND column_name = 'assignment_id'
  ) THEN
    ALTER TABLE public.assignment_questions 
    ADD COLUMN assignment_id UUID;
    
    RAISE NOTICE 'Added assignment_id column to assignment_questions table before creating constraint';
  END IF;
  
  -- Now check and create/update the constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'assignment_questions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%assignment_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.assignment_questions 
    DROP CONSTRAINT IF EXISTS assignment_questions_assignment_id_fkey;
    
    ALTER TABLE public.assignment_questions 
    ADD CONSTRAINT assignment_questions_assignment_id_fkey 
    FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed assignment_questions.assignment_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'assignment_questions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%assignment_id%'
  ) THEN
    -- Clean up any orphaned data before creating constraint
    DELETE FROM public.assignment_questions
    WHERE assignment_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_questions.assignment_id);
    
    ALTER TABLE public.assignment_questions 
    ADD CONSTRAINT assignment_questions_assignment_id_fkey 
    FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created assignment_questions.assignment_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'assignment_questions.assignment_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 6. Fix course_access.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_access'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.course_access 
    DROP CONSTRAINT IF EXISTS course_access_course_id_fkey;
    
    ALTER TABLE public.course_access 
    ADD CONSTRAINT course_access_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed course_access.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_access'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    ALTER TABLE public.course_access 
    ADD CONSTRAINT course_access_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created course_access.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'course_access.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 7. Fix student_courses.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'student_courses'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.student_courses 
    DROP CONSTRAINT IF EXISTS student_courses_course_id_fkey;
    
    ALTER TABLE public.student_courses 
    ADD CONSTRAINT student_courses_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed student_courses.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'student_courses'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    ALTER TABLE public.student_courses 
    ADD CONSTRAINT student_courses_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created student_courses.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'student_courses.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 8. Fix course_progress.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_progress'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.course_progress 
    DROP CONSTRAINT IF EXISTS course_progress_course_id_fkey;
    
    ALTER TABLE public.course_progress 
    ADD CONSTRAINT course_progress_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed course_progress.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_progress'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    ALTER TABLE public.course_progress 
    ADD CONSTRAINT course_progress_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created course_progress.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'course_progress.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 9. Fix course_schedules.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_schedules'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.course_schedules 
    DROP CONSTRAINT IF EXISTS course_schedules_course_id_fkey;
    
    ALTER TABLE public.course_schedules 
    ADD CONSTRAINT course_schedules_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed course_schedules.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_schedules'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    ALTER TABLE public.course_schedules 
    ADD CONSTRAINT course_schedules_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created course_schedules.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'course_schedules.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 10. Fix course_versions.course_id -> courses.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_versions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.course_versions 
    DROP CONSTRAINT IF EXISTS course_versions_course_id_fkey;
    
    ALTER TABLE public.course_versions 
    ADD CONSTRAINT course_versions_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed course_versions.course_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'course_versions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course_id%'
  ) THEN
    ALTER TABLE public.course_versions 
    ADD CONSTRAINT course_versions_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created course_versions.course_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'course_versions.course_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 11. Fix videos.chapter_id -> chapters.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'videos'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.videos 
    DROP CONSTRAINT IF EXISTS videos_chapter_id_fkey;
    
    ALTER TABLE public.videos 
    ADD CONSTRAINT videos_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed videos.chapter_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'videos'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
  ) THEN
    ALTER TABLE public.videos 
    ADD CONSTRAINT videos_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created videos.chapter_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'videos.chapter_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 12. Fix materials.chapter_id -> chapters.id
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'materials'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
    AND rc.delete_rule != 'CASCADE'
  ) THEN
    ALTER TABLE public.materials 
    DROP CONSTRAINT IF EXISTS materials_chapter_id_fkey;
    
    ALTER TABLE public.materials 
    ADD CONSTRAINT materials_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Fixed materials.chapter_id foreign key to use CASCADE';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'materials'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%chapter_id%'
  ) THEN
    ALTER TABLE public.materials 
    ADD CONSTRAINT materials_chapter_id_fkey 
    FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Created materials.chapter_id foreign key with CASCADE';
  ELSE
    RAISE NOTICE 'materials.chapter_id foreign key already has CASCADE';
  END IF;
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- All foreign key constraints for course-related tables have been verified
-- and fixed to ensure ON DELETE CASCADE is properly set. This ensures that
-- when a course is deleted, all related data is automatically removed.
-- ============================================================================
