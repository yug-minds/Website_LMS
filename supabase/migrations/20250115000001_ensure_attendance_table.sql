-- Ensure attendance table exists with correct structure
-- This migration ensures the attendance table is created if it doesn't exist

-- Create attendance table if it doesn't exist (explicitly in public schema)
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id),
  date date NOT NULL,
  status text NOT NULL,
  recorded_by uuid REFERENCES public.profiles(id),
  recorded_at timestamptz DEFAULT timezone('utc'::text, now()),
  remarks text,
  UNIQUE(user_id, school_id, date)
);

-- Add status constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'attendance_status_check'
    AND conrelid = 'public.attendance'::regclass
  ) THEN
    ALTER TABLE public.attendance 
    ADD CONSTRAINT attendance_status_check 
    CHECK (status IN ('Present', 'Absent', 'Leave-Approved', 'Leave-Rejected', 'Unreported'));
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON public.attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_school_date ON public.attendance(user_id, school_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);

-- Enable RLS if not already enabled
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$
BEGIN
  -- Admins can manage all attendance
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' 
    AND schemaname = 'public'
    AND policyname = 'Admins can manage all attendance'
  ) THEN
    CREATE POLICY "Admins can manage all attendance" ON public.attendance
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;

  -- School admins can view their school attendance
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' 
    AND schemaname = 'public'
    AND policyname = 'School admins can view their school attendance'
  ) THEN
    CREATE POLICY "School admins can view their school attendance" ON public.attendance
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role = 'school_admin'
          AND school_id = public.attendance.school_id
        )
      );
  END IF;

  -- Teachers can view and manage their own attendance
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' 
    AND schemaname = 'public'
    AND policyname = 'Teachers can view their own attendance'
  ) THEN
    CREATE POLICY "Teachers can view their own attendance" ON public.attendance
      FOR SELECT USING (
        user_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role = 'teacher'
        )
      );
  END IF;

  -- Teachers can insert/update their own attendance (for report submissions)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' 
    AND schemaname = 'public'
    AND policyname = 'Teachers can insert their own attendance'
  ) THEN
    CREATE POLICY "Teachers can insert their own attendance" ON public.attendance
      FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role = 'teacher'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' 
    AND schemaname = 'public'
    AND policyname = 'Teachers can update their own attendance'
  ) THEN
    CREATE POLICY "Teachers can update their own attendance" ON public.attendance
      FOR UPDATE USING (
        user_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role = 'teacher'
        )
      );
  END IF;
END $$;

-- Ensure teacher_monthly_attendance view exists
-- Drop view if it exists to avoid column rename issues
DROP VIEW IF EXISTS public.teacher_monthly_attendance CASCADE;

CREATE VIEW public.teacher_monthly_attendance AS
SELECT 
  user_id AS teacher_id, 
  school_id, 
  date_trunc('month', date) AS month, 
  SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_count,
  SUM(CASE WHEN status LIKE 'Leave-%' THEN 1 ELSE 0 END) AS leave_count,
  SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
  SUM(CASE WHEN status = 'Unreported' THEN 1 ELSE 0 END) AS unreported_count,
  COUNT(*) AS total_days
FROM public.attendance
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE role = 'teacher'
)
GROUP BY user_id, school_id, date_trunc('month', date);

