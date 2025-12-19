-- ==========================================================
--  Supabase Migration: Course + Chapter + Assignment Schema
--  Yugminds / Robocoders Student Portal
-- ==========================================================

-- =====================
-- 1. Courses Table
-- =====================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('Draft', 'Published')) DEFAULT 'Draft',
  total_chapters INT DEFAULT 0,
  total_videos INT DEFAULT 0,
  total_materials INT DEFAULT 0,
  total_assignments INT DEFAULT 0,
  release_type TEXT CHECK (release_type IN ('Daily', 'Weekly', 'Bi-weekly')) DEFAULT 'Weekly',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 2. Course Access Table (multi-school / multi-grade publish)
-- =====================
CREATE TABLE IF NOT EXISTS course_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  UNIQUE(course_id, school_id, grade)
);

-- =====================
-- 3. Chapters Table
-- =====================
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  learning_outcomes TEXT[],
  order_number INT,
  release_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 4. Materials Table (PDFs, Docs, etc.)
-- =====================
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT,
  file_url TEXT,
  file_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 5. Videos Table
-- =====================
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT,
  video_url TEXT,
  duration INTERVAL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 6. Assignments Table
-- =====================
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  auto_grading_enabled BOOLEAN DEFAULT FALSE,
  max_score INT DEFAULT 100,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 7. Assignment Questions Table
-- =====================
CREATE TABLE IF NOT EXISTS assignment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  question_type TEXT CHECK (question_type IN ('MCQ', 'FillBlank')) NOT NULL,
  question_text TEXT NOT NULL,
  options TEXT[], -- applicable for MCQs
  correct_answer TEXT NOT NULL,
  marks INT DEFAULT 1
);

-- =====================
-- 8. Assignment Submissions Table
-- =====================
-- DEPRECATED: assignment_submissions table creation removed
-- Use submissions table instead (created in 20241201000008_create_student_dashboard_tables.sql)
-- This table was deprecated and removed in migration 20250127000004_remove_deprecated_tables.sql

-- =====================
-- 9. Course Reports Table
-- =====================
-- Ensure courses table has primary key before creating foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.courses'::regclass 
        AND contype = 'p'
    ) THEN
        -- Add primary key if id column exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'id'
        ) THEN
            ALTER TABLE public.courses ADD PRIMARY KEY (id);
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS course_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  grade TEXT,
  total_students INT,
  avg_completion_rate DECIMAL(5,2),
  avg_score DECIMAL(5,2),
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 10. Scheduling Rules (for weekly/daily/bi-weekly release)
-- =====================
CREATE TABLE IF NOT EXISTS course_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  release_type TEXT CHECK (release_type IN ('Daily', 'Weekly', 'Bi-weekly')) DEFAULT 'Weekly',
  release_date TIMESTAMPTZ,
  next_release TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 11. Course Progress Tracking
-- =====================
CREATE TABLE IF NOT EXISTS course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  progress_percent DECIMAL(5,2) DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  last_accessed TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 12. RLS Policies (Role-Based Access)
-- =====================
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
-- RLS for assignment_submissions removed (table deprecated)
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "Admin full access on courses" ON courses;
CREATE POLICY "Admin full access on courses"
ON courses FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'super_admin')
  )
);

-- School Admin access for published courses
DROP POLICY IF EXISTS "School Admin can access assigned courses" ON course_access;
CREATE POLICY "School Admin can access assigned courses"
ON course_access FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN school_admins sa ON sa.profile_id = p.id
    WHERE p.id = auth.uid()
    AND p.role = 'school_admin'
    AND sa.school_id = course_access.school_id
  )
);

-- Students can view only published courses assigned to their school/grade
DROP POLICY IF EXISTS "Students view their assigned courses" ON course_access;
CREATE POLICY "Students view their assigned courses"
ON course_access FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN student_schools ss ON ss.student_id = p.id
    WHERE p.id = auth.uid()
    AND p.role = 'student'
    AND ss.school_id = course_access.school_id
    AND ss.grade = course_access.grade
  )
);

-- Teachers can view courses of their assigned school
DROP POLICY IF EXISTS "Teachers view their school courses" ON course_access;
CREATE POLICY "Teachers view their school courses"
ON course_access FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN teacher_schools ts ON ts.teacher_id = p.id
    WHERE p.id = auth.uid()
    AND p.role = 'teacher'
    AND ts.school_id = course_access.school_id
  )
);

-- RLS policy for assignment_submissions removed (table deprecated)
-- Use submissions table instead (created in 20241201000008_create_student_dashboard_tables.sql)

-- =====================
-- 13. Indexes for Performance
-- =====================
CREATE INDEX IF NOT EXISTS idx_course_access_school ON course_access(school_id);
CREATE INDEX IF NOT EXISTS idx_course_access_grade ON course_access(grade);
CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_id);
-- Index removed - assignments now use course_id, not chapter_id
-- CREATE INDEX IF NOT EXISTS idx_assignments_chapter ON assignments(chapter_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
-- Index for assignment_submissions removed (table deprecated)
CREATE INDEX IF NOT EXISTS idx_progress_course ON course_progress(course_id);

-- =====================
-- 14. Function to update updated_at timestamp
-- =====================
CREATE OR REPLACE FUNCTION update_courses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_courses_updated_at();

