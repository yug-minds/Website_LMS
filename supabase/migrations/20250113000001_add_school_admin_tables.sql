-- Migration: Add Missing School Admin Dashboard Tables and Columns
-- Date: 2025-01-13
-- Purpose: Add missing tables and columns required by School Admin dashboard functionality
-- Note: This migration does NOT reset or delete any existing data

-- ============================================================================
-- 1. ADD approved_by and approved_at COLUMNS to teacher_reports TABLE
-- Purpose: Track who approved teacher reports and when
-- Used by: /api/school-admin/reports (GET, PATCH)
-- Critical: Required for report approval functionality
-- ============================================================================

DO $$ 
BEGIN
    -- Add approved_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_reports' 
        AND column_name = 'approved_by'
    ) THEN
        ALTER TABLE public.teacher_reports 
        ADD COLUMN approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN public.teacher_reports.approved_by IS 'ID of the admin/school admin who approved this report. NULL if pending.';
        
        -- Create index for approved_by for faster queries
        CREATE INDEX IF NOT EXISTS idx_teacher_reports_approved_by 
        ON public.teacher_reports(approved_by);
        
        -- Create index for pending reports (where approved_by IS NULL)
        CREATE INDEX IF NOT EXISTS idx_teacher_reports_pending 
        ON public.teacher_reports(school_id) 
        WHERE approved_by IS NULL;
    END IF;

    -- Add approved_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_reports' 
        AND column_name = 'approved_at'
    ) THEN
        ALTER TABLE public.teacher_reports 
        ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;
        
        COMMENT ON COLUMN public.teacher_reports.approved_at IS 'Timestamp when the report was approved. NULL if pending.';
        
        -- Create index for approved_at for faster queries
        CREATE INDEX IF NOT EXISTS idx_teacher_reports_approved_at 
        ON public.teacher_reports(approved_at);
    END IF;
END $$;

-- ============================================================================
-- 2. CREATE course_progress TABLE
-- Purpose: Track student progress per chapter in courses
-- Used by: /api/school-admin/courses/progress/students/detail (GET)
-- Note: This is optional but enhances chapter-wise progress tracking
-- ============================================================================

-- Create course_progress table, handling course_chapters reference conditionally
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_progress') THEN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_chapters') THEN
            -- Create with course_chapters foreign key
            CREATE TABLE public.course_progress (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
                course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
                chapter_id UUID REFERENCES public.course_chapters(id) ON DELETE CASCADE,
                progress_percent NUMERIC(5,2) DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
                completed BOOLEAN DEFAULT false,
                started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                completed_at TIMESTAMP WITH TIME ZONE,
                last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                UNIQUE(student_id, course_id, chapter_id)
            );
        ELSE
            -- Create without course_chapters foreign key (use chapters table if it exists, or make nullable)
            IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'chapters') THEN
                CREATE TABLE public.course_progress (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
                    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
                    chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
                    progress_percent NUMERIC(5,2) DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
                    completed BOOLEAN DEFAULT false,
                    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    completed_at TIMESTAMP WITH TIME ZONE,
                    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    UNIQUE(student_id, course_id, chapter_id)
                );
            ELSE
                -- Create with nullable chapter_id (no foreign key)
                CREATE TABLE public.course_progress (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
                    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
                    chapter_id UUID,
                    progress_percent NUMERIC(5,2) DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
                    completed BOOLEAN DEFAULT false,
                    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    completed_at TIMESTAMP WITH TIME ZONE,
                    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    UNIQUE(student_id, course_id, chapter_id)
                );
            END IF;
        END IF;
    END IF;
END $$;

-- Indexes for course_progress
CREATE INDEX IF NOT EXISTS idx_course_progress_student_id ON public.course_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course_id ON public.course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_chapter_id ON public.course_progress(chapter_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_student_course ON public.course_progress(student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_completed ON public.course_progress(completed);
CREATE INDEX IF NOT EXISTS idx_course_progress_progress_percent ON public.course_progress(progress_percent);

-- ============================================================================
-- 3. CREATE TRIGGER FUNCTION for course_progress updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_course_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    NEW.last_accessed_at = timezone('utc'::text, now());
    
    -- Auto-set completed_at when progress reaches 100%
    IF NEW.progress_percent >= 100 AND NEW.completed = true AND OLD.completed = false THEN
        NEW.completed_at = timezone('utc'::text, now());
    END IF;
    
    -- Auto-set completed when progress reaches 100%
    IF NEW.progress_percent >= 100 THEN
        NEW.completed = true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CREATE TRIGGER for course_progress updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS update_course_progress_updated_at_trigger ON public.course_progress;
CREATE TRIGGER update_course_progress_updated_at_trigger
    BEFORE UPDATE ON public.course_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_course_progress_updated_at();

-- ============================================================================
-- 5. CREATE RLS POLICIES for course_progress (if RLS is enabled)
-- ============================================================================

-- Enable RLS on course_progress table
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can manage all course progress
DROP POLICY IF EXISTS "Admins can manage course progress" ON public.course_progress;
CREATE POLICY "Admins can manage course progress"
    ON public.course_progress
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- RLS Policy: School admins can view course progress for their school
DROP POLICY IF EXISTS "School admins can view their school course progress" ON public.course_progress;
CREATE POLICY "School admins can view their school course progress"
    ON public.course_progress
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND EXISTS (
                SELECT 1 FROM public.courses
                WHERE courses.id = course_progress.course_id
                AND courses.school_id = profiles.school_id
            )
        )
    );

-- RLS Policy: Teachers can view course progress for their courses
DROP POLICY IF EXISTS "Teachers can view course progress for their courses" ON public.course_progress;
CREATE POLICY "Teachers can view course progress for their courses"
    ON public.course_progress
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.teacher_classes
            WHERE teacher_classes.teacher_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.classes
                WHERE classes.id = teacher_classes.class_id
                AND EXISTS (
                    SELECT 1 FROM public.courses
                    WHERE courses.id = course_progress.course_id
                    AND courses.grade = classes.grade
                )
            )
        )
    );

-- RLS Policy: Students can manage their own course progress
DROP POLICY IF EXISTS "Students can manage their own course progress" ON public.course_progress;
CREATE POLICY "Students can manage their own course progress"
    ON public.course_progress
    FOR ALL
    USING (student_id = auth.uid());

-- ============================================================================
-- 6. ADD COMMENTS for documentation
-- ============================================================================

COMMENT ON TABLE public.course_progress IS 'Tracks student progress per chapter in courses. Used by School Admin dashboard for detailed progress tracking.';
COMMENT ON COLUMN public.course_progress.progress_percent IS 'Progress percentage (0-100) for this chapter';
COMMENT ON COLUMN public.course_progress.completed IS 'Whether the student has completed this chapter';
COMMENT ON COLUMN public.course_progress.completed_at IS 'Timestamp when the chapter was completed (auto-set when progress reaches 100%)';
COMMENT ON COLUMN public.course_progress.last_accessed_at IS 'Last time the student accessed this chapter (auto-updated on each update)';

-- ============================================================================
-- 7. UPDATE teacher_reports INDEXES (if needed)
-- ============================================================================

-- Ensure composite index exists for common query pattern (school_id + approved_by)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'teacher_reports' 
        AND indexname = 'idx_teacher_reports_school_approved'
    ) THEN
        CREATE INDEX idx_teacher_reports_school_approved 
        ON public.teacher_reports(school_id, approved_by);
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds:
-- 1. approved_by and approved_at columns to teacher_reports table (CRITICAL)
-- 2. course_progress table for chapter-wise progress tracking (OPTIONAL)
-- 
-- No existing data is modified or deleted
-- All tables include proper foreign keys, indexes, triggers, and RLS policies
-- Migration is idempotent (safe to run multiple times)
-- ============================================================================





