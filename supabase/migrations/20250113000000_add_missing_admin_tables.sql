-- Migration: Add Missing Admin Dashboard Tables and Columns
-- Date: 2025-01-13
-- Purpose: Add missing tables and columns required by admin dashboard functionality
-- Note: This migration does NOT reset or delete any existing data

-- Ensure courses table exists and has PK
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID DEFAULT gen_random_uuid(),
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_pkey') THEN
        -- Check if constraint exists with different name? 
        -- Or just try to add it
        BEGIN
            ALTER TABLE public.courses ADD PRIMARY KEY (id);
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Ignore if fails (e.g. duplicates), manual intervention required
        END;
    END IF;
END $$;

-- ============================================================================
-- 1. CREATE course_access TABLE
-- Purpose: Multi-school/multi-grade course access control
-- Used by: /api/admin/courses (GET, POST, PUT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    grade TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(course_id, school_id, grade)
);

-- Indexes for course_access
CREATE INDEX IF NOT EXISTS idx_course_access_course_id ON public.course_access(course_id);
CREATE INDEX IF NOT EXISTS idx_course_access_school_id ON public.course_access(school_id);
CREATE INDEX IF NOT EXISTS idx_course_access_grade ON public.course_access(grade);
CREATE INDEX IF NOT EXISTS idx_course_access_school_grade ON public.course_access(school_id, grade);

-- ============================================================================
-- 2. CREATE course_schedules TABLE
-- Purpose: Chapter release scheduling (Daily, Weekly, Bi-weekly)
-- Used by: /api/admin/courses (POST, PUT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
    release_type TEXT NOT NULL CHECK (release_type IN ('Daily', 'Weekly', 'Bi-weekly')),
    release_date TIMESTAMP WITH TIME ZONE NOT NULL,
    next_release TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(course_id, chapter_id)
);

-- Indexes for course_schedules
CREATE INDEX IF NOT EXISTS idx_course_schedules_course_id ON public.course_schedules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_schedules_chapter_id ON public.course_schedules(chapter_id);
CREATE INDEX IF NOT EXISTS idx_course_schedules_release_date ON public.course_schedules(release_date);
CREATE INDEX IF NOT EXISTS idx_course_schedules_release_type ON public.course_schedules(release_type);

-- ============================================================================
-- 3. CREATE videos TABLE
-- Purpose: Video content for chapters
-- Used by: /api/admin/courses (GET, POST, PUT)
-- Note: Even though chapter_contents exists, the code expects this table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    duration INTEGER, -- Duration in minutes
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for videos
CREATE INDEX IF NOT EXISTS idx_videos_chapter_id ON public.videos(chapter_id);
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_by ON public.videos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_videos_is_published ON public.videos(is_published);
CREATE INDEX IF NOT EXISTS idx_videos_order_index ON public.videos(chapter_id, order_index);

-- ============================================================================
-- 4. CREATE materials TABLE
-- Purpose: Material files (PDFs, documents) for chapters
-- Used by: /api/admin/courses (GET, POST, PUT)
-- Note: Even though chapter_contents exists, the code expects this table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT, -- e.g., 'pdf', 'doc', 'docx', 'ppt', etc.
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for materials
CREATE INDEX IF NOT EXISTS idx_materials_chapter_id ON public.materials(chapter_id);
CREATE INDEX IF NOT EXISTS idx_materials_uploaded_by ON public.materials(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_materials_is_published ON public.materials(is_published);
CREATE INDEX IF NOT EXISTS idx_materials_order_index ON public.materials(chapter_id, order_index);
CREATE INDEX IF NOT EXISTS idx_materials_file_type ON public.materials(file_type);

-- ============================================================================
-- 5. CREATE assignment_questions TABLE
-- Purpose: MCQ/Quiz questions for assignments
-- Used by: /api/admin/courses (POST, PUT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assignment_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'essay', 'true_false', 'short_answer', 'fill_blank')),
    question_text TEXT NOT NULL,
    options JSONB, -- For MCQ: array of options, e.g., ["Option A", "Option B", "Option C", "Option D"]
    correct_answer TEXT NOT NULL, -- For MCQ: the correct option, for essay: expected keywords/answer
    marks INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    explanation TEXT, -- Explanation for the correct answer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for assignment_questions
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment_id ON public.assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_question_type ON public.assignment_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_order_index ON public.assignment_questions(assignment_id, order_index);

-- ============================================================================
-- 6. ADD admin_remarks COLUMN to teacher_leaves TABLE
-- Purpose: Allow admins to add remarks when approving/rejecting leaves
-- Used by: /api/admin/leaves (PUT)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_leaves' 
        AND column_name = 'admin_remarks'
    ) THEN
        ALTER TABLE public.teacher_leaves 
        ADD COLUMN admin_remarks TEXT;
        
        COMMENT ON COLUMN public.teacher_leaves.admin_remarks IS 'Remarks added by admin when reviewing leave request';
    END IF;
END $$;

-- ============================================================================
-- 6b. ADD updated_at COLUMN to teacher_attendance TABLE
-- Purpose: Track when attendance records are updated
-- Used by: /api/admin/teacher-attendance (POST)
-- ============================================================================

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_attendance') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'teacher_attendance' 
            AND column_name = 'updated_at'
        ) THEN
            ALTER TABLE public.teacher_attendance 
            ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
            
            COMMENT ON COLUMN public.teacher_attendance.updated_at IS 'Timestamp when attendance record was last updated';
        END IF;
    END IF;
END $$;

-- ============================================================================
-- 7. CREATE TRIGGER FUNCTIONS for updated_at columns
-- ============================================================================

-- Function for course_access updated_at
CREATE OR REPLACE FUNCTION update_course_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for course_schedules updated_at
CREATE OR REPLACE FUNCTION update_course_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for videos updated_at
CREATE OR REPLACE FUNCTION update_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for materials updated_at
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for assignment_questions updated_at
CREATE OR REPLACE FUNCTION update_assignment_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for teacher_attendance updated_at
CREATE OR REPLACE FUNCTION update_teacher_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. CREATE TRIGGERS for updated_at columns
-- ============================================================================

-- Trigger for course_access
DROP TRIGGER IF EXISTS update_course_access_updated_at_trigger ON public.course_access;
CREATE TRIGGER update_course_access_updated_at_trigger
    BEFORE UPDATE ON public.course_access
    FOR EACH ROW
    EXECUTE FUNCTION update_course_access_updated_at();

-- Trigger for course_schedules
DROP TRIGGER IF EXISTS update_course_schedules_updated_at_trigger ON public.course_schedules;
CREATE TRIGGER update_course_schedules_updated_at_trigger
    BEFORE UPDATE ON public.course_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_course_schedules_updated_at();

-- Trigger for videos
DROP TRIGGER IF EXISTS update_videos_updated_at_trigger ON public.videos;
CREATE TRIGGER update_videos_updated_at_trigger
    BEFORE UPDATE ON public.videos
    FOR EACH ROW
    EXECUTE FUNCTION update_videos_updated_at();

-- Trigger for materials
DROP TRIGGER IF EXISTS update_materials_updated_at_trigger ON public.materials;
CREATE TRIGGER update_materials_updated_at_trigger
    BEFORE UPDATE ON public.materials
    FOR EACH ROW
    EXECUTE FUNCTION update_materials_updated_at();

-- Trigger for assignment_questions
DROP TRIGGER IF EXISTS update_assignment_questions_updated_at_trigger ON public.assignment_questions;
CREATE TRIGGER update_assignment_questions_updated_at_trigger
    BEFORE UPDATE ON public.assignment_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_assignment_questions_updated_at();

-- Trigger for teacher_attendance (if updated_at column was just added)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_attendance') THEN
        DROP TRIGGER IF EXISTS update_teacher_attendance_updated_at_trigger ON public.teacher_attendance;
        CREATE TRIGGER update_teacher_attendance_updated_at_trigger
            BEFORE UPDATE ON public.teacher_attendance
            FOR EACH ROW
            EXECUTE FUNCTION update_teacher_attendance_updated_at();
    END IF;
END $$;

-- ============================================================================
-- 9. CREATE RLS POLICIES (if RLS is enabled)
-- ============================================================================

-- Enable RLS on new tables (if not already enabled)
ALTER TABLE public.course_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for course_access
DROP POLICY IF EXISTS "Admins can manage course access" ON public.course_access;
CREATE POLICY "Admins can manage course access"
    ON public.course_access
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "School admins can view their school course access" ON public.course_access;
CREATE POLICY "School admins can view their school course access"
    ON public.course_access
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND profiles.school_id = course_access.school_id
        )
    );

-- RLS Policies for course_schedules
DROP POLICY IF EXISTS "Admins can manage course schedules" ON public.course_schedules;
CREATE POLICY "Admins can manage course schedules"
    ON public.course_schedules
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "School admins can view their school course schedules" ON public.course_schedules;
CREATE POLICY "School admins can view their school course schedules"
    ON public.course_schedules
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND EXISTS (
                SELECT 1 FROM public.courses
                WHERE courses.id = course_schedules.course_id
                AND courses.school_id = profiles.school_id
            )
        )
    );

-- RLS Policies for videos
DROP POLICY IF EXISTS "Admins can manage videos" ON public.videos;
CREATE POLICY "Admins can manage videos"
    ON public.videos
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "School admins can manage their school videos" ON public.videos;
CREATE POLICY "School admins can manage their school videos"
    ON public.videos
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND EXISTS (
                SELECT 1 FROM public.chapters
                JOIN public.courses ON courses.id = chapters.course_id
                WHERE chapters.id = videos.chapter_id
                AND courses.school_id = profiles.school_id
            )
        )
    );

DROP POLICY IF EXISTS "Students can view published videos" ON public.videos;
CREATE POLICY "Students can view published videos"
    ON public.videos
    FOR SELECT
    USING (is_published = true);

-- RLS Policies for materials
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
CREATE POLICY "Admins can manage materials"
    ON public.materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "School admins can manage their school materials" ON public.materials;
CREATE POLICY "School admins can manage their school materials"
    ON public.materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND EXISTS (
                SELECT 1 FROM public.chapters
                JOIN public.courses ON courses.id = chapters.course_id
                WHERE chapters.id = materials.chapter_id
                AND courses.school_id = profiles.school_id
            )
        )
    );

DROP POLICY IF EXISTS "Students can view published materials" ON public.materials;
CREATE POLICY "Students can view published materials"
    ON public.materials
    FOR SELECT
    USING (is_published = true);

-- RLS Policies for assignment_questions
DROP POLICY IF EXISTS "Admins can manage assignment questions" ON public.assignment_questions;
CREATE POLICY "Admins can manage assignment questions"
    ON public.assignment_questions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "School admins can manage their school assignment questions" ON public.assignment_questions;
CREATE POLICY "School admins can manage their school assignment questions"
    ON public.assignment_questions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND EXISTS (
                SELECT 1 FROM public.assignments
                JOIN public.courses ON courses.id = assignments.course_id
                WHERE assignments.id = assignment_questions.assignment_id
                AND courses.school_id = profiles.school_id
            )
        )
    );

DROP POLICY IF EXISTS "Students can view assignment questions for published assignments" ON public.assignment_questions;
CREATE POLICY "Students can view assignment questions for published assignments"
    ON public.assignment_questions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments
            WHERE assignments.id = assignment_questions.assignment_id
            AND assignments.is_published = true
        )
    );

-- ============================================================================
-- 10. ADD COMMENTS for documentation
-- ============================================================================

COMMENT ON TABLE public.course_access IS 'Multi-school/multi-grade course access control. Links courses to specific schools and grades.';
COMMENT ON TABLE public.course_schedules IS 'Chapter release scheduling for courses. Supports Daily, Weekly, and Bi-weekly release types.';
COMMENT ON TABLE public.videos IS 'Video content for course chapters. Used by admin dashboard for course content management.';
COMMENT ON TABLE public.materials IS 'Material files (PDFs, documents) for course chapters. Used by admin dashboard for course content management.';
COMMENT ON TABLE public.assignment_questions IS 'MCQ/Quiz questions for assignments. Supports multiple question types (mcq, essay, true_false, etc.).';
COMMENT ON COLUMN public.teacher_leaves.admin_remarks IS 'Remarks added by admin when reviewing leave requests. Used in /api/admin/leaves PUT endpoint.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds all missing tables and columns required by the admin dashboard
-- No existing data is modified or deleted
-- All tables include proper foreign keys, indexes, triggers, and RLS policies
-- ============================================================================

