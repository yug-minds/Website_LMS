-- Migration: Fix Schedule Validation to Handle NULL teacher_id
-- Date: 2025-12-27
-- Purpose: Update validate_class_schedules_consistency function to properly handle NULL teacher_id
--          Schedules can be created without a teacher initially

-- Update the validation function to handle NULL teacher_id
CREATE OR REPLACE FUNCTION validate_class_schedules_consistency()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure class_schedules.school_id matches classes.school_id (only if class_id is provided)
  IF NEW.class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = NEW.class_id
    AND c.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'class_schedules.school_id must match classes.school_id';
  END IF;
  
  -- Ensure teacher is assigned to this school (only if teacher_id is provided)
  IF NEW.teacher_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teacher_schools ts
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Teacher must be assigned to school_id before being scheduled';
  END IF;
  
  -- Ensure period belongs to same school (only if period_id is provided)
  IF NEW.period_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM periods p
    WHERE p.id = NEW.period_id
    AND p.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Period must belong to same school';
  END IF;
  
  -- Ensure room belongs to same school (only if room_id is provided)
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rooms r
    WHERE r.id = NEW.room_id
    AND r.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Room must belong to same school';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION validate_class_schedules_consistency() IS 'Validates class_schedules consistency with classes, periods, rooms, and teacher assignments. Allows NULL values for optional fields.';


