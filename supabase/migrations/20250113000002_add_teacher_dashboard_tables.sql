-- Migration: Add Missing Teacher Dashboard Tables and Columns
-- Date: 2025-01-13
-- Purpose: Add missing tables and columns required by Teacher dashboard functionality
-- Note: This migration does NOT reset or delete any existing data

-- ============================================================================
-- 1. CREATE student_classes TABLE
-- Purpose: Track student enrollments in classes (for teacher analytics)
-- Used by: /api/teacher/analytics (GET) - to get student counts per class
-- Critical: Required for analytics functionality
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(student_id, class_id)
);

-- Indexes for student_classes
CREATE INDEX IF NOT EXISTS idx_student_classes_student_id ON public.student_classes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_classes_class_id ON public.student_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_student_classes_is_active ON public.student_classes(is_active);
CREATE INDEX IF NOT EXISTS idx_student_classes_student_class ON public.student_classes(student_id, class_id);
CREATE INDEX IF NOT EXISTS idx_student_classes_active_by_class ON public.student_classes(class_id, is_active) WHERE is_active = true;

-- ============================================================================
-- 2. ADD homework_assigned COLUMN to teacher_reports TABLE
-- Purpose: Store homework assignments in teacher reports
-- Used by: /api/teacher/reports (POST, PUT)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_reports' 
        AND column_name = 'homework_assigned'
    ) THEN
        ALTER TABLE public.teacher_reports 
        ADD COLUMN homework_assigned TEXT;
        
        COMMENT ON COLUMN public.teacher_reports.homework_assigned IS 'Homework assignments given to students in this class session';
    END IF;
END $$;

-- ============================================================================
-- 3. ADD materials_used COLUMN to teacher_reports TABLE
-- Purpose: Store materials used during class in teacher reports
-- Used by: /api/teacher/reports (POST, PUT)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_reports' 
        AND column_name = 'materials_used'
    ) THEN
        ALTER TABLE public.teacher_reports 
        ADD COLUMN materials_used TEXT;
        
        COMMENT ON COLUMN public.teacher_reports.materials_used IS 'Materials, resources, or tools used during the class session';
    END IF;
END $$;

-- ============================================================================
-- 4. ADD student_attendance COLUMN to teacher_reports TABLE
-- Purpose: Store student attendance details in teacher reports
-- Used by: /api/teacher/reports (POST, PUT)
-- Note: Using TEXT to allow flexible storage (can be JSON string or plain text)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_reports' 
        AND column_name = 'student_attendance'
    ) THEN
        ALTER TABLE public.teacher_reports 
        ADD COLUMN student_attendance TEXT;
        
        COMMENT ON COLUMN public.teacher_reports.student_attendance IS 'Student attendance details for this class session (can be JSON string or plain text)';
    END IF;
END $$;

-- ============================================================================
-- 5. ADD updated_at COLUMN to teacher_reports TABLE
-- Purpose: Track when teacher reports are updated
-- Used by: /api/teacher/reports (PUT)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'teacher_reports' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.teacher_reports 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
        
        COMMENT ON COLUMN public.teacher_reports.updated_at IS 'Timestamp when the report was last updated';
        
        -- Create index for updated_at for faster queries
        CREATE INDEX IF NOT EXISTS idx_teacher_reports_updated_at 
        ON public.teacher_reports(updated_at);
    END IF;
END $$;

-- ============================================================================
-- 6. CREATE TRIGGER FUNCTION for student_classes updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_student_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. CREATE TRIGGER FUNCTION for teacher_reports updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_teacher_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. CREATE TRIGGERS for updated_at columns
-- ============================================================================

-- Trigger for student_classes
DROP TRIGGER IF EXISTS update_student_classes_updated_at_trigger ON public.student_classes;
CREATE TRIGGER update_student_classes_updated_at_trigger
    BEFORE UPDATE ON public.student_classes
    FOR EACH ROW
    EXECUTE FUNCTION update_student_classes_updated_at();

-- Trigger for teacher_reports (if updated_at column was just added)
DROP TRIGGER IF EXISTS update_teacher_reports_updated_at_trigger ON public.teacher_reports;
CREATE TRIGGER update_teacher_reports_updated_at_trigger
    BEFORE UPDATE ON public.teacher_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_reports_updated_at();

-- ============================================================================
-- 9. CREATE RLS POLICIES for student_classes (if RLS is enabled)
-- ============================================================================

-- Enable RLS on student_classes table
ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can manage all student classes
DROP POLICY IF EXISTS "Admins can manage student classes" ON public.student_classes;
CREATE POLICY "Admins can manage student classes"
    ON public.student_classes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- RLS Policy: School admins can manage student classes for their school
DROP POLICY IF EXISTS "School admins can manage their school student classes" ON public.student_classes;
CREATE POLICY "School admins can manage their school student classes"
    ON public.student_classes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'school_admin'
            AND EXISTS (
                SELECT 1 FROM public.classes
                WHERE classes.id = student_classes.class_id
                AND classes.school_id = profiles.school_id
            )
        )
    );

-- RLS Policy: Teachers can view student classes for their assigned classes
DROP POLICY IF EXISTS "Teachers can view student classes for their classes" ON public.student_classes;
CREATE POLICY "Teachers can view student classes for their classes"
    ON public.student_classes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.teacher_classes
            WHERE teacher_classes.teacher_id = auth.uid()
            AND teacher_classes.class_id = student_classes.class_id
        )
    );

-- RLS Policy: Students can view their own class enrollments
DROP POLICY IF EXISTS "Students can view their own class enrollments" ON public.student_classes;
CREATE POLICY "Students can view their own class enrollments"
    ON public.student_classes
    FOR SELECT
    USING (student_id = auth.uid());

-- ============================================================================
-- 10. ADD COMMENTS for documentation
-- ============================================================================

COMMENT ON TABLE public.student_classes IS 'Tracks student enrollments in classes. Used by Teacher dashboard for analytics (student counts per class).';
COMMENT ON COLUMN public.student_classes.is_active IS 'Whether the student is currently active in this class';
COMMENT ON COLUMN public.student_classes.enrolled_at IS 'Timestamp when the student was enrolled in this class';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds:
-- 1. student_classes table for tracking student enrollments (CRITICAL for analytics)
-- 2. homework_assigned, materials_used, student_attendance, updated_at columns to teacher_reports (CRITICAL for reports)
-- 
-- No existing data is modified or deleted
-- All tables include proper foreign keys, indexes, triggers, and RLS policies
-- Migration is idempotent (safe to run multiple times)
-- ============================================================================





