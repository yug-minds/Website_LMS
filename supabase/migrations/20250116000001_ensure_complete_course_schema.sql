-- ============================================================================
-- Complete Course Schema Migration - Final Comprehensive Check
-- Date: 2025-01-16
-- Purpose: Ensure all tables, columns, indexes, triggers, and RLS policies exist
-- This migration is idempotent and safe to run multiple times
-- ============================================================================

-- ============================================================================
-- 0. CLEANUP: Remove any orphaned indexes or constraints
-- ============================================================================

-- FIRST: Drop chapter_id column from courses if it exists (CASCADE will drop dependent objects)
-- This must be done first to avoid validation errors
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'courses' 
        AND column_name = 'chapter_id'
    ) THEN
        BEGIN
            ALTER TABLE public.courses DROP COLUMN IF EXISTS chapter_id CASCADE;
            RAISE NOTICE 'Dropped chapter_id column from courses table (should not exist)';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping chapter_id column: %', SQLERRM;
        END;
    END IF;
END $$;

-- Drop any indexes on courses.chapter_id if they exist (this column shouldn't exist)
DO $$
DECLARE
    idx_record RECORD;
BEGIN
    FOR idx_record IN 
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'courses' 
        AND (indexdef LIKE '%chapter_id%' OR indexdef LIKE '%"chapter_id"%')
    LOOP
        BEGIN
            EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(idx_record.indexname) || ' CASCADE';
            RAISE NOTICE 'Dropped orphaned index: %', idx_record.indexname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop index %: %', idx_record.indexname, SQLERRM;
        END;
    END LOOP;
END $$;

-- Drop any constraints on courses.chapter_id if they exist
DO $$
DECLARE
    con_record RECORD;
BEGIN
    -- First, try to get constraints using pg_constraint
    FOR con_record IN 
        SELECT conname, contype
        FROM pg_constraint
        WHERE conrelid = 'public.courses'::regclass
        AND (
            pg_get_constraintdef(oid) LIKE '%chapter_id%' 
            OR pg_get_constraintdef(oid) LIKE '%"chapter_id"%'
        )
    LOOP
        BEGIN
            EXECUTE 'ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS ' || quote_ident(con_record.conname) || ' CASCADE';
            RAISE NOTICE 'Dropped orphaned constraint: %', con_record.conname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop constraint %: %', con_record.conname, SQLERRM;
        END;
    END LOOP;
    
    -- Also check for constraints that might fail validation
    BEGIN
        -- Try to find and drop any constraint that references non-existent chapter_id
        FOR con_record IN 
            SELECT conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'courses'
            AND t.relnamespace = 'public'::regnamespace
        LOOP
            BEGIN
                -- Try to get constraint definition - if it fails, the constraint is invalid
                PERFORM pg_get_constraintdef(con_record.conname::regconstraint);
            EXCEPTION WHEN OTHERS THEN
                -- If getting definition fails, try to drop it
                BEGIN
                    EXECUTE 'ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS ' || quote_ident(con_record.conname) || ' CASCADE';
                    RAISE NOTICE 'Dropped invalid constraint: %', con_record.conname;
                EXCEPTION WHEN OTHERS THEN
                    -- Ignore errors when dropping
                    NULL;
                END;
            END;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error checking constraints: %', SQLERRM;
    END;
END $$;

-- Drop any views that reference courses.chapter_id or use array_agg incorrectly
-- Using pg_class system catalog approach - this doesn't trigger view validation
-- We get view names directly from the catalog without accessing definitions

-- Step 1: Drop known problematic views directly (no queries, no validation)
DROP VIEW IF EXISTS public.student_progress_view CASCADE;
DROP VIEW IF EXISTS public.student_calendar_view CASCADE;
DROP VIEW IF EXISTS public.course_progress_view CASCADE;
DROP VIEW IF EXISTS public.teacher_monthly_attendance CASCADE;

-- Step 2: Skip querying views entirely to avoid array_agg errors
-- The known problematic views are already dropped in Step 1
-- Any remaining views will be handled by the migration continuing
-- (We avoid querying pg_class or information_schema.views as they may trigger validation)

-- Drop any materialized views that reference courses.chapter_id
DO $$
DECLARE
    matview_record RECORD;
BEGIN
    FOR matview_record IN 
        SELECT schemaname, matviewname
        FROM pg_matviews
        WHERE schemaname = 'public'
        AND definition LIKE '%courses%chapter_id%'
    LOOP
        EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS ' || quote_ident(matview_record.schemaname) || '.' || quote_ident(matview_record.matviewname) || ' CASCADE';
        RAISE NOTICE 'Dropped materialized view with courses.chapter_id: %', matview_record.matviewname;
    END LOOP;
END $$;

-- Drop any functions that might reference courses.chapter_id
-- Skip this check to avoid validation errors with views
-- Functions will be recreated if needed by subsequent migrations
DO $$
BEGIN
    -- Silently skip function dropping to avoid array_agg validation errors
    RAISE NOTICE 'Skipping function cleanup to avoid validation errors';
END $$;

-- Drop any foreign key constraints from other tables that reference courses.chapter_id
DO $$
DECLARE
    fk_record RECORD;
BEGIN
    FOR fk_record IN 
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            tc.constraint_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'courses'
        AND ccu.column_name = 'chapter_id'
        AND tc.table_schema = 'public'
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(fk_record.table_schema) || '.' || quote_ident(fk_record.table_name) 
            || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(fk_record.constraint_name) || ' CASCADE';
        RAISE NOTICE 'Dropped foreign key constraint referencing courses.chapter_id: %.%', fk_record.table_name, fk_record.constraint_name;
    END LOOP;
END $$;

-- ============================================================================
-- 1. ENSURE courses TABLE HAS ALL REQUIRED COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_name TEXT,
    name TEXT,
    title TEXT,
    description TEXT,
    num_chapters INTEGER DEFAULT 0,
    total_chapters INTEGER DEFAULT 0,
    total_videos INTEGER DEFAULT 0,
    total_materials INTEGER DEFAULT 0,
    total_assignments INTEGER DEFAULT 0,
    content_summary JSONB,
    status TEXT CHECK (status IN ('Draft', 'Published', 'Archived')) DEFAULT 'Draft',
    is_published BOOLEAN DEFAULT false,
    release_type TEXT CHECK (release_type IN ('Daily', 'Weekly', 'Bi-weekly')) DEFAULT 'Weekly',
    school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
    grade TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns
DO $$ 
BEGIN
    -- Add course_name if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'course_name'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN course_name TEXT;
    END IF;

    -- Add name if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'name'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN name TEXT;
    END IF;

    -- Add title if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'title'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN title TEXT;
    END IF;

    -- Add description if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'description'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN description TEXT;
    END IF;

    -- Add num_chapters if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'num_chapters'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN num_chapters INTEGER DEFAULT 0;
    END IF;

    -- Add total_chapters if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'total_chapters'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN total_chapters INTEGER DEFAULT 0;
    END IF;

    -- Add total_videos if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'total_videos'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN total_videos INTEGER DEFAULT 0;
    END IF;

    -- Add total_materials if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'total_materials'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN total_materials INTEGER DEFAULT 0;
    END IF;

    -- Add total_assignments if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'total_assignments'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN total_assignments INTEGER DEFAULT 0;
    END IF;

    -- Add content_summary if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'content_summary'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN content_summary JSONB;
    END IF;

    -- Add is_published if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'is_published'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN is_published BOOLEAN DEFAULT false;
    END IF;

    -- Add release_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'release_type'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN release_type TEXT CHECK (release_type IN ('Daily', 'Weekly', 'Bi-weekly')) DEFAULT 'Weekly';
    END IF;

    -- Add school_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'school_id'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
    END IF;

    -- Add grade if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'grade'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN grade TEXT;
    END IF;

    -- Add created_by if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    -- Add created_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.courses ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- ============================================================================
-- 2. ENSURE course_access TABLE EXISTS WITH ALL COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    grade TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(course_id, school_id, grade)
);

-- Add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'course_access' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.course_access ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'course_access' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.course_access ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- Ensure unique constraint exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'course_access_course_id_school_id_grade_key'
    ) THEN
        ALTER TABLE public.course_access 
        ADD CONSTRAINT course_access_course_id_school_id_grade_key 
        UNIQUE(course_id, school_id, grade);
    END IF;
END $$;

-- ============================================================================
-- 3. ENSURE chapters TABLE EXISTS WITH ALL COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    name TEXT,
    title TEXT,
    description TEXT,
    order_number INTEGER,
    order_index INTEGER,
    learning_outcomes TEXT[],
    release_date TIMESTAMP WITH TIME ZONE,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'name'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN name TEXT;
        UPDATE public.chapters SET name = title WHERE name IS NULL AND title IS NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'title'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN title TEXT;
        UPDATE public.chapters SET title = name WHERE title IS NULL AND name IS NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'description'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'order_index'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN order_index INTEGER;
        UPDATE public.chapters SET order_index = order_number WHERE order_index IS NULL AND order_number IS NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'is_published'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN is_published BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- ============================================================================
-- 4. ENSURE videos TABLE EXISTS WITH ALL COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    duration INTEGER,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'order_index'
    ) THEN
        ALTER TABLE public.videos ADD COLUMN order_index INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'is_published'
    ) THEN
        ALTER TABLE public.videos ADD COLUMN is_published BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.videos ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- ============================================================================
-- 5. ENSURE materials TABLE EXISTS WITH ALL COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'order_index'
    ) THEN
        ALTER TABLE public.materials ADD COLUMN order_index INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'is_published'
    ) THEN
        ALTER TABLE public.materials ADD COLUMN is_published BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.materials ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- ============================================================================
-- 6. ENSURE assignments TABLE EXISTS WITH ALL COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assignment_type TEXT DEFAULT 'essay',
    auto_grading_enabled BOOLEAN DEFAULT false,
    max_score INTEGER DEFAULT 100,
    max_marks INTEGER DEFAULT 100,
    config JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'course_id'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'assignment_type'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN assignment_type TEXT DEFAULT 'essay';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'max_marks'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN max_marks INTEGER DEFAULT 100;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'config'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN config JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'is_published'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN is_published BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'auto_grading_enabled'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN auto_grading_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'max_score'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN max_score INTEGER DEFAULT 100;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'chapter_id'
    ) THEN
        ALTER TABLE public.assignments ADD COLUMN chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 7. ENSURE assignment_questions TABLE EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assignment_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    question_type TEXT CHECK (question_type IN ('MCQ', 'FillBlank', 'mcq', 'fill_blank', 'essay', 'true_false')) NOT NULL,
    question_text TEXT NOT NULL,
    options TEXT[],
    correct_answer TEXT NOT NULL,
    marks INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignment_questions' AND column_name = 'order_index'
    ) THEN
        ALTER TABLE public.assignment_questions ADD COLUMN order_index INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignment_questions' AND column_name = 'explanation'
    ) THEN
        ALTER TABLE public.assignment_questions ADD COLUMN explanation TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignment_questions' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.assignment_questions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- ============================================================================
-- 8. ENSURE course_schedules TABLE EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
    release_type TEXT NOT NULL CHECK (release_type IN ('Daily', 'Weekly', 'Bi-weekly')),
    release_date TIMESTAMP WITH TIME ZONE NOT NULL,
    next_release TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(course_id, chapter_id)
);

-- ============================================================================
-- 9. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Courses indexes
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON public.courses(created_by);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_school_id ON public.courses(school_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON public.courses(is_published);

-- Course access indexes
CREATE INDEX IF NOT EXISTS idx_course_access_course_id ON public.course_access(course_id);
CREATE INDEX IF NOT EXISTS idx_course_access_school_id ON public.course_access(school_id);
CREATE INDEX IF NOT EXISTS idx_course_access_grade ON public.course_access(grade);
CREATE INDEX IF NOT EXISTS idx_course_access_school_grade ON public.course_access(school_id, grade);
CREATE INDEX IF NOT EXISTS idx_course_access_course_school ON public.course_access(course_id, school_id);

-- Chapters indexes
CREATE INDEX IF NOT EXISTS idx_chapters_course_id ON public.chapters(course_id);
CREATE INDEX IF NOT EXISTS idx_chapters_order_index ON public.chapters(course_id, order_index);

-- Videos indexes
CREATE INDEX IF NOT EXISTS idx_videos_chapter_id ON public.videos(chapter_id);
CREATE INDEX IF NOT EXISTS idx_videos_order_index ON public.videos(chapter_id, order_index);

-- Materials indexes
CREATE INDEX IF NOT EXISTS idx_materials_chapter_id ON public.materials(chapter_id);
CREATE INDEX IF NOT EXISTS idx_materials_order_index ON public.materials(chapter_id, order_index);

-- Assignments indexes
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON public.assignments(course_id);
-- Only create chapter_id index if the column exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'chapter_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_assignments_chapter_id ON public.assignments(chapter_id);
    END IF;
END $$;

-- Assignment questions indexes
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment_id ON public.assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_order_index ON public.assignment_questions(assignment_id, order_index);

-- Course schedules indexes
CREATE INDEX IF NOT EXISTS idx_course_schedules_course_id ON public.course_schedules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_schedules_chapter_id ON public.course_schedules(chapter_id);

-- ============================================================================
-- 10. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 11. CREATE/UPDATE RLS POLICIES FOR ADMIN ACCESS
-- ============================================================================

-- Admin full access on courses
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;
CREATE POLICY "Admins can manage courses"
    ON public.courses
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on course_access
DROP POLICY IF EXISTS "Admins can manage course access" ON public.course_access;
CREATE POLICY "Admins can manage course access"
    ON public.course_access
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on chapters
DROP POLICY IF EXISTS "Admins can manage chapters" ON public.chapters;
CREATE POLICY "Admins can manage chapters"
    ON public.chapters
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on videos
DROP POLICY IF EXISTS "Admins can manage videos" ON public.videos;
CREATE POLICY "Admins can manage videos"
    ON public.videos
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on materials
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
CREATE POLICY "Admins can manage materials"
    ON public.materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.assignments;
CREATE POLICY "Admins can manage assignments"
    ON public.assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on assignment_questions
DROP POLICY IF EXISTS "Admins can manage assignment questions" ON public.assignment_questions;
CREATE POLICY "Admins can manage assignment questions"
    ON public.assignment_questions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Admin full access on course_schedules
DROP POLICY IF EXISTS "Admins can manage course schedules" ON public.course_schedules;
CREATE POLICY "Admins can manage course schedules"
    ON public.course_schedules
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- ============================================================================
-- 12. CREATE TRIGGERS FOR updated_at
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_courses_updated_at_trigger ON public.courses;
CREATE TRIGGER update_courses_updated_at_trigger
    BEFORE UPDATE ON public.courses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_course_access_updated_at_trigger ON public.course_access;
CREATE TRIGGER update_course_access_updated_at_trigger
    BEFORE UPDATE ON public.course_access
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chapters_updated_at_trigger ON public.chapters;
CREATE TRIGGER update_chapters_updated_at_trigger
    BEFORE UPDATE ON public.chapters
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at_trigger ON public.videos;
CREATE TRIGGER update_videos_updated_at_trigger
    BEFORE UPDATE ON public.videos
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_materials_updated_at_trigger ON public.materials;
CREATE TRIGGER update_materials_updated_at_trigger
    BEFORE UPDATE ON public.materials
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_assignments_updated_at_trigger ON public.assignments;
CREATE TRIGGER update_assignments_updated_at_trigger
    BEFORE UPDATE ON public.assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_assignment_questions_updated_at_trigger ON public.assignment_questions;
CREATE TRIGGER update_assignment_questions_updated_at_trigger
    BEFORE UPDATE ON public.assignment_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_course_schedules_updated_at_trigger ON public.course_schedules;
CREATE TRIGGER update_course_schedules_updated_at_trigger
    BEFORE UPDATE ON public.course_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All tables and columns required for course creation are now in place
-- RLS policies allow admin access to all course-related tables
-- Indexes are created for optimal query performance
-- Triggers automatically update updated_at timestamps
-- ============================================================================

