-- ===========================================
-- MIGRATION: Teacher + Student Schema & RLS
-- Project: Yugminds RoboCoders Student Portal
-- Date: 2025-10-26
-- ===========================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===============================
-- PROFILES TABLE (Base for Roles) - Already exists, just add missing columns
-- ===============================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Note: Profiles table already has updated_at trigger in previous migrations

-- =========================================
-- TEACHERS TABLE - Update existing table
-- =========================================
ALTER TABLE public.teachers 
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS school_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS attendance_count INT DEFAULT 0;

-- =========================================
-- STUDENTS TABLE - Update existing table (only if it exists)
-- =========================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    ALTER TABLE public.students 
    ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;;

-- =========================================
-- ENROLLMENTS (Student ↔ Course / Class) - Update existing table
-- =========================================
-- Note: student_id column may reference profiles instead of students table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'enrollments') THEN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      ALTER TABLE public.enrollments 
      ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.students(id) ON DELETE CASCADE;
    ELSE
      -- If students table doesn't exist, reference profiles instead
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'enrollments' AND column_name = 'student_id'
      ) THEN
        ALTER TABLE public.enrollments 
        ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- =========================================
-- TEACHER REPORTS - Update existing table
-- =========================================
-- Note: teacher_reports table already exists in previous migrations

-- =========================================
-- TEACHER LEAVE MANAGEMENT - Update existing table
-- =========================================
-- Note: teacher_leaves table already exists in previous migrations

-- =========================================
-- ATTENDANCE TABLE - Update existing table
-- =========================================
-- Note: attendance table already exists in previous migrations

-- =========================================
-- NOTIFICATIONS TABLE - Update existing table
-- =========================================
-- Note: notifications table already exists in previous migrations

-- =========================================
-- RLS ENABLED FOR SECURE ACCESS
-- =========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =========================================
-- RLS POLICIES — PROFILES
-- =========================================
CREATE POLICY "Profiles can view self"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Profiles can update self"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- =========================================
-- RLS POLICIES — TEACHERS
-- =========================================
CREATE POLICY "Teacher can view own record"
ON public.teachers FOR SELECT
USING (profile_id = auth.uid());

CREATE POLICY "Teacher can view own reports"
ON public.teacher_reports FOR SELECT
USING (teacher_id = auth.uid());

CREATE POLICY "Teacher can insert own reports"
ON public.teacher_reports FOR INSERT
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teacher can view own leaves"
ON public.teacher_leaves FOR SELECT
USING (teacher_id = auth.uid());

CREATE POLICY "Teacher can insert leave requests"
ON public.teacher_leaves FOR INSERT
WITH CHECK (teacher_id = auth.uid());

-- =========================================
-- RLS POLICIES — STUDENTS (only if students table exists)
-- =========================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    DROP POLICY IF EXISTS "Student can view self" ON public.students;
    CREATE POLICY "Student can view self"
    ON public.students FOR SELECT
    USING (profile_id = auth.uid());
  END IF;
  
  -- Enrollments policy (works with or without students table)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'enrollments') THEN
    DROP POLICY IF EXISTS "Student can view own enrollments" ON public.enrollments;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
      CREATE POLICY "Student can view own enrollments"
      ON public.enrollments FOR SELECT
      USING (student_id IN (
        SELECT id FROM public.students WHERE profile_id = auth.uid()
      ));
    ELSE
      -- Fallback: use profiles directly
      CREATE POLICY "Student can view own enrollments"
      ON public.enrollments FOR SELECT
      USING (student_id = auth.uid());
    END IF;
  END IF;
END $$;

CREATE POLICY "Student can view own attendance"
ON public.attendance FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Student can view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

-- =========================================
-- RLS POLICIES — ADMIN
-- =========================================
CREATE POLICY "Admin can manage all data"
ON public.profiles
FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admin full access on all core tables"
ON public.teachers
FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    DROP POLICY IF EXISTS "Admin full access on students" ON public.students;
    CREATE POLICY "Admin full access on students"
    ON public.students
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
  END IF;
END $$;

-- =========================================
-- DEFAULT SEED DATA (OPTIONAL)
-- =========================================
-- Note: Seed data already exists in previous migrations

-- =========================================
-- INDEXES FOR PERFORMANCE
-- =========================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students') THEN
    CREATE INDEX IF NOT EXISTS idx_students_school ON public.students (school_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_teacher_reports_date ON public.teacher_reports (date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON public.attendance (user_id);

-- =========================================
-- END OF MIGRATION FILE
-- =========================================
