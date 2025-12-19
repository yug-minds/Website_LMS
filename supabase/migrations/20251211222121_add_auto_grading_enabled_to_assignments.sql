-- ============================================================================
-- Migration: Add auto_grading_enabled Column to assignments Table
-- Date: 2025-12-11
-- Purpose: Ensure auto_grading_enabled column exists in assignments table
--          This column is used to control whether assignments are auto-graded
-- ============================================================================

-- Add auto_grading_enabled column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'assignments' 
          AND column_name = 'auto_grading_enabled'
    ) THEN
        ALTER TABLE public.assignments 
        ADD COLUMN auto_grading_enabled BOOLEAN DEFAULT false;
        
        RAISE NOTICE 'Added auto_grading_enabled column to assignments table';
    ELSE
        RAISE NOTICE 'Column auto_grading_enabled already exists in assignments table';
    END IF;
END $$;

-- Also ensure max_score column exists (for consistency)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'assignments' 
          AND column_name = 'max_score'
    ) THEN
        ALTER TABLE public.assignments 
        ADD COLUMN max_score INTEGER DEFAULT 100;
        
        RAISE NOTICE 'Added max_score column to assignments table';
    END IF;
END $$;

-- Also ensure chapter_id column exists (for proper foreign key relationship)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'assignments' 
          AND column_name = 'chapter_id'
    ) THEN
        ALTER TABLE public.assignments 
        ADD COLUMN chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added chapter_id column to assignments table';
    END IF;
END $$;



















