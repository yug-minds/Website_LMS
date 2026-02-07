-- Create Teacher Monthly Attendance Log Table
-- This table stores pre-calculated monthly attendance summaries for better performance
-- Created: 2025-12-24

-- Create the monthly attendance log table
CREATE TABLE IF NOT EXISTS public.teacher_monthly_attendance_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  month date NOT NULL, -- First day of the month (e.g., 2025-12-01)
  year integer NOT NULL,
  month_number integer NOT NULL CHECK (month_number >= 1 AND month_number <= 12),
  present_days integer DEFAULT 0,
  absent_days integer DEFAULT 0,
  leave_days integer DEFAULT 0,
  unreported_days integer DEFAULT 0,
  total_working_days integer DEFAULT 0, -- Total days in the month (excluding weekends if configured)
  attendance_percentage decimal(5,2) DEFAULT 0.00 CHECK (attendance_percentage >= 0 AND attendance_percentage <= 100),
  created_at timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz DEFAULT timezone('utc'::text, now()),
  UNIQUE(teacher_id, school_id, month)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_teacher_monthly_log_teacher_id ON public.teacher_monthly_attendance_log(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_monthly_log_school_id ON public.teacher_monthly_attendance_log(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_monthly_log_month ON public.teacher_monthly_attendance_log(month);
CREATE INDEX IF NOT EXISTS idx_teacher_monthly_log_year_month ON public.teacher_monthly_attendance_log(year, month_number);
CREATE INDEX IF NOT EXISTS idx_teacher_monthly_log_teacher_school_month ON public.teacher_monthly_attendance_log(teacher_id, school_id, month);

-- Add comment for documentation
COMMENT ON TABLE public.teacher_monthly_attendance_log IS 'Pre-calculated monthly attendance summaries for teachers. Automatically updated when daily attendance records change.';
COMMENT ON COLUMN public.teacher_monthly_attendance_log.month IS 'First day of the month (e.g., 2025-12-01)';
COMMENT ON COLUMN public.teacher_monthly_attendance_log.total_working_days IS 'Total working days in the month (can exclude weekends/holidays if configured)';
COMMENT ON COLUMN public.teacher_monthly_attendance_log.attendance_percentage IS 'Percentage of present days out of total working days';

-- Create function to update monthly attendance log
CREATE OR REPLACE FUNCTION public.update_teacher_monthly_attendance_log()
RETURNS TRIGGER AS $$
DECLARE
  v_month_start date;
  v_year integer;
  v_month_number integer;
  v_present_count integer;
  v_absent_count integer;
  v_leave_count integer;
  v_unreported_count integer;
  v_total_days integer;
  v_attendance_percentage decimal(5,2);
  v_user_id uuid;
  v_school_id uuid;
BEGIN
  -- Determine which record was affected
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_school_id := OLD.school_id;
    v_month_start := date_trunc('month', OLD.date)::date;
  ELSE
    v_user_id := NEW.user_id;
    v_school_id := NEW.school_id;
    v_month_start := date_trunc('month', NEW.date)::date;
  END IF;

  -- Only process if this is a teacher
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = v_user_id AND role = 'teacher'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Extract year and month number
  v_year := EXTRACT(YEAR FROM v_month_start)::integer;
  v_month_number := EXTRACT(MONTH FROM v_month_start)::integer;

  -- Calculate monthly statistics from attendance table
  SELECT 
    COUNT(*) FILTER (WHERE status = 'Present')::integer,
    COUNT(*) FILTER (WHERE status = 'Absent')::integer,
    COUNT(*) FILTER (WHERE status LIKE 'Leave-%')::integer,
    COUNT(*) FILTER (WHERE status = 'Unreported')::integer,
    COUNT(*)::integer
  INTO 
    v_present_count,
    v_absent_count,
    v_leave_count,
    v_unreported_count,
    v_total_days
  FROM public.attendance
  WHERE user_id = v_user_id
    AND school_id = v_school_id
    AND date >= v_month_start
    AND date < (v_month_start + INTERVAL '1 month');

  -- Calculate attendance percentage (present days / total days * 100)
  IF v_total_days > 0 THEN
    v_attendance_percentage := ROUND((v_present_count::decimal / v_total_days::decimal) * 100, 2);
  ELSE
    v_attendance_percentage := 0.00;
  END IF;

  -- Upsert monthly log record
  INSERT INTO public.teacher_monthly_attendance_log (
    teacher_id,
    school_id,
    month,
    year,
    month_number,
    present_days,
    absent_days,
    leave_days,
    unreported_days,
    total_working_days,
    attendance_percentage,
    updated_at
  )
  VALUES (
    v_user_id,
    v_school_id,
    v_month_start,
    v_year,
    v_month_number,
    v_present_count,
    v_absent_count,
    v_leave_count,
    v_unreported_count,
    v_total_days,
    v_attendance_percentage,
    timezone('utc'::text, now())
  )
  ON CONFLICT (teacher_id, school_id, month)
  DO UPDATE SET
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    leave_days = EXCLUDED.leave_days,
    unreported_days = EXCLUDED.unreported_days,
    total_working_days = EXCLUDED.total_working_days,
    attendance_percentage = EXCLUDED.attendance_percentage,
    updated_at = EXCLUDED.updated_at;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update monthly log when attendance changes
DROP TRIGGER IF EXISTS trigger_update_monthly_attendance_log ON public.attendance;

CREATE TRIGGER trigger_update_monthly_attendance_log
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_teacher_monthly_attendance_log();

-- Create function to backfill monthly logs for existing data
CREATE OR REPLACE FUNCTION public.backfill_teacher_monthly_attendance_logs()
RETURNS TABLE(
  teacher_id uuid,
  school_id uuid,
  month date,
  records_created integer
) AS $$
DECLARE
  v_record RECORD;
  v_count integer := 0;
BEGIN
  -- Get all unique teacher-school-month combinations from attendance table
  FOR v_record IN
    SELECT DISTINCT
      a.user_id as teacher_id,
      a.school_id,
      date_trunc('month', a.date)::date as month_start
    FROM public.attendance a
    INNER JOIN public.profiles p ON p.id = a.user_id
    WHERE p.role = 'teacher'
    ORDER BY a.user_id, a.school_id, month_start
  LOOP
    -- Trigger the update function for each combination
    -- This will calculate and insert/update the monthly log
    PERFORM public.update_teacher_monthly_attendance_log_for_month(
      v_record.teacher_id,
      v_record.school_id,
      v_record.month_start
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY
  SELECT 
    v_record.teacher_id,
    v_record.school_id,
    v_record.month_start,
    v_count;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to update monthly log for a specific month
CREATE OR REPLACE FUNCTION public.update_teacher_monthly_attendance_log_for_month(
  p_teacher_id uuid,
  p_school_id uuid,
  p_month date
)
RETURNS void AS $$
DECLARE
  v_year integer;
  v_month_number integer;
  v_present_count integer;
  v_absent_count integer;
  v_leave_count integer;
  v_unreported_count integer;
  v_total_days integer;
  v_attendance_percentage decimal(5,2);
  v_month_start date;
BEGIN
  v_month_start := date_trunc('month', p_month)::date;
  v_year := EXTRACT(YEAR FROM v_month_start)::integer;
  v_month_number := EXTRACT(MONTH FROM v_month_start)::integer;

  -- Calculate monthly statistics
  SELECT 
    COUNT(*) FILTER (WHERE status = 'Present')::integer,
    COUNT(*) FILTER (WHERE status = 'Absent')::integer,
    COUNT(*) FILTER (WHERE status LIKE 'Leave-%')::integer,
    COUNT(*) FILTER (WHERE status = 'Unreported')::integer,
    COUNT(*)::integer
  INTO 
    v_present_count,
    v_absent_count,
    v_leave_count,
    v_unreported_count,
    v_total_days
  FROM public.attendance
  WHERE user_id = p_teacher_id
    AND school_id = p_school_id
    AND date >= v_month_start
    AND date < (v_month_start + INTERVAL '1 month');

  -- Calculate attendance percentage
  IF v_total_days > 0 THEN
    v_attendance_percentage := ROUND((v_present_count::decimal / v_total_days::decimal) * 100, 2);
  ELSE
    v_attendance_percentage := 0.00;
  END IF;

  -- Upsert monthly log record
  INSERT INTO public.teacher_monthly_attendance_log (
    teacher_id,
    school_id,
    month,
    year,
    month_number,
    present_days,
    absent_days,
    leave_days,
    unreported_days,
    total_working_days,
    attendance_percentage,
    updated_at
  )
  VALUES (
    p_teacher_id,
    p_school_id,
    v_month_start,
    v_year,
    v_month_number,
    v_present_count,
    v_absent_count,
    v_leave_count,
    v_unreported_count,
    v_total_days,
    v_attendance_percentage,
    timezone('utc'::text, now())
  )
  ON CONFLICT (teacher_id, school_id, month)
  DO UPDATE SET
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    leave_days = EXCLUDED.leave_days,
    unreported_days = EXCLUDED.unreported_days,
    total_working_days = EXCLUDED.total_working_days,
    attendance_percentage = EXCLUDED.attendance_percentage,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on the monthly log table
ALTER TABLE public.teacher_monthly_attendance_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for monthly log table
DO $$
BEGIN
  -- Admins can view all monthly logs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_monthly_attendance_log' 
    AND schemaname = 'public'
    AND policyname = 'Admins can view all monthly attendance logs'
  ) THEN
    CREATE POLICY "Admins can view all monthly attendance logs" 
    ON public.teacher_monthly_attendance_log
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
      )
    );
  END IF;

  -- School admins can view monthly logs for their school
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_monthly_attendance_log' 
    AND schemaname = 'public'
    AND policyname = 'School admins can view monthly logs for their school'
  ) THEN
    CREATE POLICY "School admins can view monthly logs for their school" 
    ON public.teacher_monthly_attendance_log
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'school_admin'
        AND school_id = teacher_monthly_attendance_log.school_id
      )
    );
  END IF;

  -- Teachers can view their own monthly logs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_monthly_attendance_log' 
    AND schemaname = 'public'
    AND policyname = 'Teachers can view their own monthly logs'
  ) THEN
    CREATE POLICY "Teachers can view their own monthly logs" 
    ON public.teacher_monthly_attendance_log
    FOR SELECT USING (
      teacher_id = auth.uid()
    );
  END IF;
END $$;

-- Backfill existing data (optional - can be run manually if needed)
-- Uncomment the line below to automatically backfill on migration
-- SELECT public.backfill_teacher_monthly_attendance_logs();


