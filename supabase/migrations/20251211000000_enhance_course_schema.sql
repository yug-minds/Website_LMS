-- ============================================================================
-- Course Schema Enhancements
-- Date: 2025-12-11
-- Purpose: Add duration, prerequisites, thumbnail, and version control
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO courses TABLE
-- ============================================================================

DO $$ 
BEGIN
    -- Add duration_weeks if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'duration_weeks'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN duration_weeks INTEGER;
        COMMENT ON COLUMN public.courses.duration_weeks IS 'Course duration in weeks';
    END IF;

    -- Add prerequisites_course_ids if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'prerequisites_course_ids'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN prerequisites_course_ids UUID[];
        COMMENT ON COLUMN public.courses.prerequisites_course_ids IS 'Array of course IDs that are prerequisites for this course';
    END IF;

    -- Add prerequisites_text if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'prerequisites_text'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN prerequisites_text TEXT;
        COMMENT ON COLUMN public.courses.prerequisites_text IS 'Text description of prerequisites';
    END IF;

    -- Add thumbnail_url if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'thumbnail_url'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN thumbnail_url TEXT;
        COMMENT ON COLUMN public.courses.thumbnail_url IS 'URL to course thumbnail image';
    END IF;

    -- Add difficulty_level if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'difficulty_level'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')) DEFAULT 'Beginner';
        COMMENT ON COLUMN public.courses.difficulty_level IS 'Course difficulty level: Beginner, Intermediate, or Advanced';
    END IF;
END $$;

-- ============================================================================
-- 2. CREATE course_versions TABLE FOR VERSION CONTROL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changes_summary TEXT,
    course_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT course_versions_course_version_unique UNIQUE(course_id, version_number)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_versions_course_id 
ON public.course_versions(course_id);

CREATE INDEX IF NOT EXISTS idx_course_versions_published_at 
ON public.course_versions(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_versions_published_by 
ON public.course_versions(published_by);

-- Add comment
COMMENT ON TABLE public.course_versions IS 'Tracks published versions of courses for version control';
COMMENT ON COLUMN public.course_versions.version_number IS 'Sequential version number for this course';
COMMENT ON COLUMN public.course_versions.course_data IS 'Complete course data snapshot at time of publication';
COMMENT ON COLUMN public.course_versions.changes_summary IS 'Human-readable summary of changes in this version';

-- ============================================================================
-- 3. CREATE FUNCTION TO AUTO-INCREMENT VERSION NUMBER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_next_course_version(course_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    next_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM public.course_versions
    WHERE course_id = course_uuid;
    
    RETURN next_version;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_next_course_version(UUID) IS 'Returns the next version number for a course';

-- ============================================================================
-- 4. ENABLE RLS ON course_versions TABLE
-- ============================================================================

ALTER TABLE public.course_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all versions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'course_versions' 
        AND policyname = 'Admins can view all course versions'
    ) THEN
        CREATE POLICY "Admins can view all course versions"
        ON public.course_versions
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'admin'
            )
        );
    END IF;
END $$;

-- RLS Policy: Admins can create versions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'course_versions' 
        AND policyname = 'Admins can create course versions'
    ) THEN
        CREATE POLICY "Admins can create course versions"
        ON public.course_versions
        FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'admin'
            )
        );
    END IF;
END $$;

-- RLS Policy: Admins can update versions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'course_versions' 
        AND policyname = 'Admins can update course versions'
    ) THEN
        CREATE POLICY "Admins can update course versions"
        ON public.course_versions
        FOR UPDATE
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'admin'
            )
        );
    END IF;
END $$;

-- ============================================================================
-- 5. ADD INDEXES FOR NEW COLUMNS (if needed for queries)
-- ============================================================================

-- Index for duration_weeks if filtering by duration
CREATE INDEX IF NOT EXISTS idx_courses_duration_weeks 
ON public.courses(duration_weeks) 
WHERE duration_weeks IS NOT NULL;

-- Index for prerequisites_course_ids using GIN for array operations
CREATE INDEX IF NOT EXISTS idx_courses_prerequisites_course_ids 
ON public.courses USING GIN(prerequisites_course_ids)
WHERE prerequisites_course_ids IS NOT NULL;

-- ============================================================================
-- 6. ADD CONSTRAINT FOR VALID DURATION
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'courses_duration_weeks_positive'
    ) THEN
        ALTER TABLE public.courses 
        ADD CONSTRAINT courses_duration_weeks_positive 
        CHECK (duration_weeks IS NULL OR duration_weeks > 0);
    END IF;
END $$;

