-- Migration: Add Missing Student Dashboard Columns to chapters Table
-- Date: 2025-01-13
-- Purpose: Add missing columns required by Student dashboard functionality
-- Note: This migration does NOT reset or delete any existing data

-- ============================================================================
-- 1. ADD order_number COLUMN to chapters TABLE
-- Purpose: Provide consistent column name for chapter ordering
-- Used by: /student/courses/page.tsx, /student/courses/[courseId]/page.tsx, /student/courses/[courseId]/chapters/[chapterId]/page.tsx
-- Note: Table already has order_index, but code expects order_number
-- Strategy: Add order_number and populate from order_index, then keep both for compatibility
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'chapters' 
        AND column_name = 'order_number'
    ) THEN
        -- Add order_number column
        ALTER TABLE public.chapters 
        ADD COLUMN order_number INTEGER;
        
        -- Populate order_number from order_index (existing data)
        UPDATE public.chapters 
        SET order_number = order_index 
        WHERE order_number IS NULL;
        
        -- Make order_number NOT NULL after populating
        ALTER TABLE public.chapters 
        ALTER COLUMN order_number SET NOT NULL;
        
        -- Create index for order_number
        CREATE INDEX IF NOT EXISTS idx_chapters_order_number 
        ON public.chapters(course_id, order_number);
        
        COMMENT ON COLUMN public.chapters.order_number IS 'Chapter order number (same as order_index for consistency with frontend code)';
    END IF;
END $$;

-- ============================================================================
-- 2. ADD name COLUMN to chapters TABLE
-- Purpose: Provide consistent column name for chapter name/title
-- Used by: /student/courses/page.tsx, /student/courses/[courseId]/page.tsx, /student/courses/[courseId]/chapters/[chapterId]/page.tsx
-- Note: Table already has title, but code expects name
-- Strategy: Add name and populate from title, then keep both for compatibility
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'chapters' 
        AND column_name = 'name'
    ) THEN
        -- Add name column
        ALTER TABLE public.chapters 
        ADD COLUMN name TEXT;
        
        -- Populate name from title (existing data)
        UPDATE public.chapters 
        SET name = title 
        WHERE name IS NULL;
        
        -- Make name NOT NULL after populating
        ALTER TABLE public.chapters 
        ALTER COLUMN name SET NOT NULL;
        
        -- Create index for name (for search functionality)
        CREATE INDEX IF NOT EXISTS idx_chapters_name 
        ON public.chapters(name);
        
        COMMENT ON COLUMN public.chapters.name IS 'Chapter name (same as title for consistency with frontend code)';
    END IF;
END $$;

-- ============================================================================
-- 3. ADD learning_outcomes COLUMN to chapters TABLE
-- Purpose: Store learning outcomes for each chapter
-- Used by: /student/courses/page.tsx, /student/courses/[courseId]/page.tsx, /student/courses/[courseId]/chapters/[chapterId]/page.tsx
-- Type: TEXT[] (array of text) for storing multiple learning outcomes
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'chapters' 
        AND column_name = 'learning_outcomes'
    ) THEN
        -- Add learning_outcomes column as TEXT[] (array)
        ALTER TABLE public.chapters 
        ADD COLUMN learning_outcomes TEXT[] DEFAULT ARRAY[]::TEXT[];
        
        COMMENT ON COLUMN public.chapters.learning_outcomes IS 'Learning outcomes for this chapter (array of text strings). Used in Student dashboard to display chapter learning objectives.';
    END IF;
END $$;

-- ============================================================================
-- 4. CREATE TRIGGER to keep order_number and order_index in sync
-- Purpose: Ensure order_number and order_index stay synchronized
-- Note: This ensures backward compatibility while supporting new code
-- ============================================================================

-- Function to sync order_number and order_index
CREATE OR REPLACE FUNCTION sync_chapters_order_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- If order_index is updated, sync to order_number
    IF TG_OP = 'UPDATE' AND (OLD.order_index IS DISTINCT FROM NEW.order_index) THEN
        NEW.order_number = NEW.order_index;
    END IF;
    
    -- If order_number is updated, sync to order_index
    IF TG_OP = 'UPDATE' AND (OLD.order_number IS DISTINCT FROM NEW.order_number) THEN
        NEW.order_index = NEW.order_number;
    END IF;
    
    -- On INSERT, ensure both are set
    IF TG_OP = 'INSERT' THEN
        IF NEW.order_number IS NULL AND NEW.order_index IS NOT NULL THEN
            NEW.order_number = NEW.order_index;
        END IF;
        IF NEW.order_index IS NULL AND NEW.order_number IS NOT NULL THEN
            NEW.order_index = NEW.order_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync columns
DROP TRIGGER IF EXISTS sync_chapters_order_trigger ON public.chapters;
CREATE TRIGGER sync_chapters_order_trigger
    BEFORE INSERT OR UPDATE ON public.chapters
    FOR EACH ROW
    EXECUTE FUNCTION sync_chapters_order_columns();

-- ============================================================================
-- 5. CREATE TRIGGER to keep name and title in sync
-- Purpose: Ensure name and title stay synchronized
-- Note: This ensures backward compatibility while supporting new code
-- ============================================================================

-- Function to sync name and title
CREATE OR REPLACE FUNCTION sync_chapters_name_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- If title is updated, sync to name
    IF TG_OP = 'UPDATE' AND (OLD.title IS DISTINCT FROM NEW.title) THEN
        NEW.name = NEW.title;
    END IF;
    
    -- If name is updated, sync to title
    IF TG_OP = 'UPDATE' AND (OLD.name IS DISTINCT FROM NEW.name) THEN
        NEW.title = NEW.name;
    END IF;
    
    -- On INSERT, ensure both are set
    IF TG_OP = 'INSERT' THEN
        IF NEW.name IS NULL AND NEW.title IS NOT NULL THEN
            NEW.name = NEW.title;
        END IF;
        IF NEW.title IS NULL AND NEW.name IS NOT NULL THEN
            NEW.title = NEW.name;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync columns
DROP TRIGGER IF EXISTS sync_chapters_name_trigger ON public.chapters;
CREATE TRIGGER sync_chapters_name_trigger
    BEFORE INSERT OR UPDATE ON public.chapters
    FOR EACH ROW
    EXECUTE FUNCTION sync_chapters_name_columns();

-- ============================================================================
-- 6. ADD COMMENTS for documentation
-- ============================================================================

COMMENT ON COLUMN public.chapters.order_number IS 'Chapter order number (synced with order_index). Used by Student dashboard for consistent chapter ordering.';
COMMENT ON COLUMN public.chapters.name IS 'Chapter name (synced with title). Used by Student dashboard for consistent chapter naming.';
COMMENT ON COLUMN public.chapters.learning_outcomes IS 'Learning outcomes for this chapter (array of text strings). Displayed in Student dashboard to show chapter learning objectives.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds:
-- 1. order_number column to chapters (synced with order_index)
-- 2. name column to chapters (synced with title)
-- 3. learning_outcomes column to chapters (TEXT[] array)
-- 
-- All columns are properly indexed and have triggers to maintain sync
-- No existing data is modified or deleted
-- All users and data are preserved
-- Migration is idempotent (safe to run multiple times)
-- ============================================================================





