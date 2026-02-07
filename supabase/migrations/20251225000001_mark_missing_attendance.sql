-- Mark Missing Attendance Function
-- This function automatically marks teachers as Absent when they have scheduled periods
-- but don't submit reports and are not on approved leave
-- Created: 2025-12-25

-- Function to mark missing attendance for a date range
CREATE OR REPLACE FUNCTION public.mark_missing_attendance_for_date_range(
  p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date date DEFAULT CURRENT_DATE - INTERVAL '1 day',
  p_school_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL
)
RETURNS TABLE(
  teacher_id uuid,
  school_id uuid,
  date date,
  status text,
  records_created integer
) AS $$
DECLARE
  v_date date;
  v_day_of_week text;
  v_records_created integer := 0;
  v_teacher_record RECORD;
  v_schedule_record RECORD;
  v_has_reports boolean;
  v_has_approved_leave boolean;
  v_attendance_exists boolean;
  v_days_of_week text[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
BEGIN
  -- Loop through each date in the range
  FOR v_date IN SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date
  LOOP
    -- Get day of week (0 = Sunday, 6 = Saturday)
    v_day_of_week := v_days_of_week[EXTRACT(DOW FROM v_date)::integer + 1];
    
    -- Skip weekends if needed (optional - can be configured)
    -- For now, we'll process all days
    
    -- Get all teachers with scheduled periods on this day
    FOR v_teacher_record IN
      SELECT DISTINCT 
        cs.teacher_id,
        cs.school_id,
        p.id as profile_id,
        p.full_name,
        p.email
      FROM class_schedules cs
      INNER JOIN profiles p ON p.id = cs.teacher_id
      WHERE cs.day_of_week = v_day_of_week
        AND cs.is_active = true
        AND (p_school_id IS NULL OR cs.school_id = p_school_id)
        AND (p_teacher_id IS NULL OR cs.teacher_id = p_teacher_id)
        AND p.role = 'teacher'
    LOOP
      -- Check if attendance record already exists
      SELECT EXISTS(
        SELECT 1 
        FROM attendance 
        WHERE user_id = v_teacher_record.teacher_id
          AND school_id = v_teacher_record.school_id
          AND date = v_date
      ) INTO v_attendance_exists;
      
      -- Skip if attendance already exists
      IF v_attendance_exists THEN
        CONTINUE;
      END IF;
      
      -- Check if teacher has submitted reports for this date
      SELECT EXISTS(
        SELECT 1 
        FROM teacher_reports 
        WHERE teacher_id = v_teacher_record.teacher_id
          AND school_id = v_teacher_record.school_id
          AND date = v_date
      ) INTO v_has_reports;
      
      -- Check if teacher has approved leave for this date
      SELECT EXISTS(
        SELECT 1 
        FROM teacher_leaves 
        WHERE teacher_id = v_teacher_record.teacher_id
          AND status = 'Approved'
          AND start_date <= v_date
          AND end_date >= v_date
      ) INTO v_has_approved_leave;
      
      -- If teacher has scheduled periods but no reports and no approved leave, mark as Absent
      IF NOT v_has_reports AND NOT v_has_approved_leave THEN
        -- Insert attendance record with Absent status
        INSERT INTO attendance (
          user_id,
          school_id,
          date,
          status,
          recorded_by,
          recorded_at,
          remarks
        )
        VALUES (
          v_teacher_record.teacher_id,
          v_teacher_record.school_id,
          v_date,
          'Absent',
          NULL, -- System marked
          timezone('utc'::text, now()),
          'Automatically marked as absent - no reports submitted for scheduled periods'
        )
        ON CONFLICT (user_id, school_id, date) 
        DO NOTHING; -- Don't override existing records
        
        v_records_created := v_records_created + 1;
        
        -- Return the record
        teacher_id := v_teacher_record.teacher_id;
        school_id := v_teacher_record.school_id;
        date := v_date;
        status := 'Absent';
        records_created := 1;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Return summary
  IF v_records_created = 0 THEN
    teacher_id := NULL;
    school_id := NULL;
    date := NULL;
    status := 'No records created';
    records_created := 0;
    RETURN NEXT;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark missing attendance for a specific teacher
CREATE OR REPLACE FUNCTION public.mark_missing_attendance_for_teacher(
  p_teacher_id uuid,
  p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date date DEFAULT CURRENT_DATE - INTERVAL '1 day'
)
RETURNS integer AS $$
DECLARE
  v_records_created integer := 0;
  v_result RECORD;
BEGIN
  -- Call the main function for this specific teacher
  FOR v_result IN
    SELECT * FROM public.mark_missing_attendance_for_date_range(
      p_start_date,
      p_end_date,
      NULL, -- school_id
      p_teacher_id
    )
  LOOP
    v_records_created := v_records_created + COALESCE(v_result.records_created, 0);
  END LOOP;
  
  RETURN v_records_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON FUNCTION public.mark_missing_attendance_for_date_range IS 
'Automatically marks teachers as Absent when they have scheduled periods but no reports submitted and are not on approved leave. Returns records created. Note: The trigger update_teacher_monthly_attendance_log() will automatically update the monthly log when these records are inserted.';

COMMENT ON FUNCTION public.mark_missing_attendance_for_teacher IS 
'Convenience function to mark missing attendance for a specific teacher. Returns count of records created. Note: The trigger update_teacher_monthly_attendance_log() will automatically update the monthly log when these records are inserted.';

