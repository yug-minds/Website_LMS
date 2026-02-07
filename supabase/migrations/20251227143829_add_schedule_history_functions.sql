-- Migration: Add Helper Functions for Schedule History Lookup
-- Date: 2025-12-27
-- Purpose: Create PostgreSQL functions to query schedules active on specific dates

-- ==========================================================
-- FUNCTION: Get schedule active on a specific date
-- ==========================================================

CREATE OR REPLACE FUNCTION get_schedule_for_date(
  p_teacher_id UUID,
  p_school_id UUID,
  p_day_of_week TEXT,
  p_date DATE
)
RETURNS TABLE (
  id UUID,
  school_id UUID,
  class_id UUID,
  teacher_id UUID,
  subject TEXT,
  grade TEXT,
  day_of_week TEXT,
  period_id UUID,
  room_id UUID,
  start_time TIME,
  end_time TIME,
  academic_year TEXT,
  is_active BOOLEAN,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  effective_from DATE,
  effective_to DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id,
    cs.school_id,
    cs.class_id,
    cs.teacher_id,
    cs.subject,
    cs.grade,
    cs.day_of_week,
    cs.period_id,
    cs.room_id,
    cs.start_time,
    cs.end_time,
    cs.academic_year,
    cs.is_active,
    cs.notes,
    cs.created_by,
    cs.created_at,
    cs.updated_at,
    cs.effective_from,
    cs.effective_to
  FROM class_schedules cs
  WHERE cs.teacher_id = p_teacher_id
    AND cs.school_id = p_school_id
    AND cs.day_of_week = p_day_of_week
    AND cs.effective_from <= p_date
    AND (cs.effective_to IS NULL OR cs.effective_to >= p_date)
  ORDER BY cs.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION get_schedule_for_date IS 'Returns the schedule that was active for a teacher on a specific date and day of week';

-- ==========================================================
-- FUNCTION: Get all schedules active on a specific date
-- ==========================================================

CREATE OR REPLACE FUNCTION get_schedules_for_date(
  p_teacher_id UUID,
  p_school_id UUID,
  p_date DATE
)
RETURNS TABLE (
  id UUID,
  school_id UUID,
  class_id UUID,
  teacher_id UUID,
  subject TEXT,
  grade TEXT,
  day_of_week TEXT,
  period_id UUID,
  room_id UUID,
  start_time TIME,
  end_time TIME,
  academic_year TEXT,
  is_active BOOLEAN,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  effective_from DATE,
  effective_to DATE
) AS $$
DECLARE
  v_day_of_week TEXT;
BEGIN
  -- Get the day of week for the given date
  SELECT TO_CHAR(p_date, 'Day') INTO v_day_of_week;
  v_day_of_week := TRIM(v_day_of_week);
  
  -- Map PostgreSQL day names to our day_of_week format
  CASE v_day_of_week
    WHEN 'Monday' THEN v_day_of_week := 'Monday';
    WHEN 'Tuesday' THEN v_day_of_week := 'Tuesday';
    WHEN 'Wednesday' THEN v_day_of_week := 'Wednesday';
    WHEN 'Thursday' THEN v_day_of_week := 'Thursday';
    WHEN 'Friday' THEN v_day_of_week := 'Friday';
    WHEN 'Saturday' THEN v_day_of_week := 'Saturday';
    WHEN 'Sunday' THEN v_day_of_week := 'Sunday';
    ELSE v_day_of_week := NULL;
  END CASE;
  
  RETURN QUERY
  SELECT DISTINCT ON (cs.day_of_week, cs.period_id)
    cs.id,
    cs.school_id,
    cs.class_id,
    cs.teacher_id,
    cs.subject,
    cs.grade,
    cs.day_of_week,
    cs.period_id,
    cs.room_id,
    cs.start_time,
    cs.end_time,
    cs.academic_year,
    cs.is_active,
    cs.notes,
    cs.created_by,
    cs.created_at,
    cs.updated_at,
    cs.effective_from,
    cs.effective_to
  FROM class_schedules cs
  WHERE cs.teacher_id = p_teacher_id
    AND cs.school_id = p_school_id
    AND cs.effective_from <= p_date
    AND (cs.effective_to IS NULL OR cs.effective_to >= p_date)
  ORDER BY cs.day_of_week, cs.period_id, cs.effective_from DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION get_schedules_for_date IS 'Returns all schedules that were active for a teacher on a specific date';


