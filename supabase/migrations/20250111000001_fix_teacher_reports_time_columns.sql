-- Migration: Fix start_time and end_time columns in teacher_reports table
-- Date: 2025-01-11
-- Description: Changes start_time and end_time from timestamptz to time type

-- Execute migration using DO block to handle errors gracefully
DO $$
BEGIN
  -- Change start_time from timestamptz to time
  ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS start_time_new time;
  UPDATE teacher_reports SET start_time_new = start_time::time WHERE start_time IS NOT NULL;
  ALTER TABLE teacher_reports DROP COLUMN IF EXISTS start_time;
  ALTER TABLE teacher_reports RENAME COLUMN start_time_new TO start_time;
  
  -- Change end_time from timestamptz to time
  ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS end_time_new time;
  UPDATE teacher_reports SET end_time_new = end_time::time WHERE end_time IS NOT NULL;
  ALTER TABLE teacher_reports DROP COLUMN IF EXISTS end_time;
  ALTER TABLE teacher_reports RENAME COLUMN end_time_new TO end_time;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error applying migration: %', SQLERRM;
END $$;
