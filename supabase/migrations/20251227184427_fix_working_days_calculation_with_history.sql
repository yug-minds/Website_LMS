-- Migration: Fix Working Days Calculation Using Historical Schedule Data
-- Date: 2025-12-27
-- Purpose: Calculate working days based on historical schedule data (effective_from/effective_to)
--          instead of counting attendance records. This ensures accuracy when schedules change mid-month.

-- ==========================================================
-- PART 1: Create function to calculate working days for a month
-- ==========================================================

CREATE OR REPLACE FUNCTION public.calculate_working_days_for_month(
  p_teacher_id uuid,
  p_school_id uuid,
  p_month date
)
RETURNS integer AS $$
DECLARE
  v_month_start date;
  v_month_end date;
  v_working_days integer := 0;
  v_check_date date;
  v_day_of_week text;
  v_days_of_week text[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  v_has_schedule boolean;
BEGIN
  -- Calculate month boundaries
  v_month_start := date_trunc('month', p_month)::date;
  v_month_end := (v_month_start + INTERVAL '1 month - 1 day')::date;
  
  -- Loop through each date in the month
  FOR v_check_date IN 
    SELECT generate_series(v_month_start, v_month_end, '1 day'::interval)::date
  LOOP
    -- Get the day of week for this date
    -- EXTRACT(DOW FROM date) returns 0 (Sunday) to 6 (Saturday)
    v_day_of_week := v_days_of_week[EXTRACT(DOW FROM v_check_date)::integer + 1];
    
    -- Check if teacher has a schedule active on this date using historical lookup
    -- Important: Do NOT filter by is_active - we need historical accuracy
    SELECT EXISTS(
      SELECT 1
      FROM class_schedules cs
      WHERE cs.teacher_id = p_teacher_id
        AND cs.school_id = p_school_id
        AND cs.day_of_week = v_day_of_week
        AND cs.effective_from <= v_check_date
        AND (cs.effective_to IS NULL OR cs.effective_to >= v_check_date)
      LIMIT 1
    ) INTO v_has_schedule;
    
    -- If schedule exists for this date, count it as a working day
    IF v_has_schedule THEN
      v_working_days := v_working_days + 1;
    END IF;
  END LOOP;
  
  RETURN v_working_days;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment for documentation
COMMENT ON FUNCTION public.calculate_working_days_for_month IS 
'Calculates the total working days for a teacher in a given month based on historical schedule data. Uses effective_from and effective_to dates to determine which schedules were active on each date, preserving historical accuracy even when schedules are later deleted.';

-- ==========================================================
-- PART 2: Update monthly attendance log function to use new working days calculation
-- ==========================================================

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
  v_total_working_days integer;
  v_attendance_percentage decimal(5,2);
  v_month_start date;
BEGIN
  v_month_start := date_trunc('month', p_month)::date;
  v_year := EXTRACT(YEAR FROM v_month_start)::integer;
  v_month_number := EXTRACT(MONTH FROM v_month_start)::integer;

  -- Calculate monthly statistics from attendance table
  SELECT 
    COUNT(*) FILTER (WHERE status = 'Present')::integer,
    COUNT(*) FILTER (WHERE status = 'Absent')::integer,
    COUNT(*) FILTER (WHERE status LIKE 'Leave-%')::integer,
    COUNT(*) FILTER (WHERE status = 'Unreported')::integer
  INTO 
    v_present_count,
    v_absent_count,
    v_leave_count,
    v_unreported_count
  FROM public.attendance
  WHERE user_id = p_teacher_id
    AND school_id = p_school_id
    AND date >= v_month_start
    AND date < (v_month_start + INTERVAL '1 month');

  -- Calculate total working days using historical schedule data
  -- This replaces the old COUNT(*) approach which only counted days with attendance records
  v_total_working_days := public.calculate_working_days_for_month(
    p_teacher_id,
    p_school_id,
    p_month
  );

  -- Calculate attendance percentage based on actual working days
  IF v_total_working_days > 0 THEN
    v_attendance_percentage := ROUND((v_present_count::decimal / v_total_working_days::decimal) * 100, 2);
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
    v_total_working_days,
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

-- ==========================================================
-- PART 3: Add performance index for efficient working days lookup
-- ==========================================================

-- Create composite index to optimize the working days calculation query
-- This index supports the WHERE clause in calculate_working_days_for_month
CREATE INDEX IF NOT EXISTS idx_class_schedules_working_days_lookup 
ON class_schedules(teacher_id, school_id, day_of_week, effective_from, effective_to);

-- Add comment
COMMENT ON INDEX idx_class_schedules_working_days_lookup IS 
'Index to optimize working days calculation queries that filter by teacher_id, school_id, day_of_week, and effective date ranges.';

-- ==========================================================
-- PART 4: Recalculate working days for existing monthly logs (optional but recommended)
-- ==========================================================

-- Recalculate working days for all existing monthly attendance logs
-- This ensures historical accuracy for past months
DO $$
DECLARE
  v_record RECORD;
  v_count integer := 0;
BEGIN
  RAISE NOTICE 'Starting recalculation of working days for existing monthly attendance logs...';
  
  FOR v_record IN
    SELECT DISTINCT teacher_id, school_id, month
    FROM teacher_monthly_attendance_log
    ORDER BY month DESC, teacher_id, school_id
  LOOP
    PERFORM public.update_teacher_monthly_attendance_log_for_month(
      v_record.teacher_id,
      v_record.school_id,
      v_record.month
    );
    v_count := v_count + 1;
    
    -- Log progress every 100 records
    IF v_count % 100 = 0 THEN
      RAISE NOTICE 'Recalculated % monthly attendance logs...', v_count;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Completed recalculation of working days. Total records processed: %', v_count;
END $$;


