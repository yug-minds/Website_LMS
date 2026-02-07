-- Update Trigger Function to Use Historical Schedule-Based Working Days Calculation
-- Created: 2025-12-27
-- Purpose: Update update_teacher_monthly_attendance_log() trigger function to call
--          update_teacher_monthly_attendance_log_for_month() which uses
--          calculate_working_days_for_month() to accurately calculate working days
--          based on historical schedule data (effective_from/effective_to dates)

-- Update the trigger function to use the new working days calculation function
-- This ensures working days are calculated correctly even when schedules change mid-month
CREATE OR REPLACE FUNCTION public.update_teacher_monthly_attendance_log()
RETURNS TRIGGER AS $$
DECLARE
  v_month_start date;
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

  -- Call the updated function that uses historical schedule-based working days calculation
  -- This function uses calculate_working_days_for_month() which considers effective_from/effective_to dates
  PERFORM public.update_teacher_monthly_attendance_log_for_month(
    v_user_id,
    v_school_id,
    v_month_start
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_teacher_monthly_attendance_log() IS 
'Trigger function that automatically updates teacher_monthly_attendance_log when attendance records change. 
Now uses update_teacher_monthly_attendance_log_for_month() which calculates working days based on historical schedule data (effective_from/effective_to dates).';


