-- Migration: Fix Attendance Rate Calculation and Cleanup Demo Data
-- Date: 2025-12-26
-- Purpose: 
--   1. Fix attendance rate calculation to use current month instead of last 30 days
--   2. Clean up old demo/test attendance data from 2024

-- ==========================================================
-- PART 1: Clean up old demo/test attendance data
-- ==========================================================

-- Delete attendance records from seed/test data
-- Only remove clearly identifiable test/demo data
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Clean up test data from seed files (specific test emails)
  DELETE FROM attendance
  WHERE user_id IN (
    SELECT id FROM profiles 
    WHERE email IN ('teacher1@yugminds.com', 'teacher2@yugminds.com', 'student1@yugminds.com', 'teacher1@yugminds.com')
    OR (email LIKE '%test%@%' AND email NOT LIKE '%@yugminds.com')
    OR (email LIKE '%demo%@%' AND email NOT LIKE '%@yugminds.com')
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % attendance records for test/demo users', deleted_count;
  END IF;
  
  -- Clean up very old test data from 2024 (before current year)
  -- Only delete if we're in 2025 or later
  IF EXTRACT(YEAR FROM CURRENT_DATE) >= 2025 THEN
    DELETE FROM attendance
    WHERE date < '2025-01-01'
    AND user_id IN (
      SELECT id FROM profiles 
      WHERE email IN ('teacher1@yugminds.com', 'teacher2@yugminds.com')
      OR email LIKE '%test%@%'
      OR email LIKE '%demo%@%'
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
      RAISE NOTICE 'Deleted % old attendance records from 2024 (test data)', deleted_count;
    END IF;
    
    -- Also clean up monthly attendance logs from 2024 for test users
    DELETE FROM teacher_monthly_attendance_log
    WHERE month < '2025-01-01'
    AND teacher_id IN (
      SELECT id FROM profiles 
      WHERE role = 'teacher'
      AND (email IN ('teacher1@yugminds.com', 'teacher2@yugminds.com')
        OR email LIKE '%test%@%'
        OR email LIKE '%demo%@%')
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
      RAISE NOTICE 'Deleted % monthly attendance log records from 2024 (test data)', deleted_count;
    END IF;
  END IF;
  
  RAISE NOTICE 'Demo/test data cleanup completed';
END $$;

-- ==========================================================
-- PART 2: Update attendance rate calculation logic
-- ==========================================================
-- Note: This is handled in the API code, but we add a comment here
-- for documentation. The API should use current month instead of last 30 days.

-- ==========================================================
-- PART 3: Clean up orphaned attendance records
-- ==========================================================

-- Delete attendance records for users that no longer exist
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM attendance
  WHERE user_id NOT IN (SELECT id FROM profiles);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % orphaned attendance records (user_id not in profiles)', deleted_count;
  END IF;
END $$;

-- Delete attendance records for schools that no longer exist
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM attendance
  WHERE school_id NOT IN (SELECT id FROM schools);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % orphaned attendance records (school_id not in schools)', deleted_count;
  END IF;
END $$;

-- ==========================================================
-- PART 4: Clean up monthly attendance log orphaned records
-- ==========================================================

-- Delete monthly attendance logs for teachers that no longer exist
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM teacher_monthly_attendance_log
  WHERE teacher_id NOT IN (SELECT id FROM profiles WHERE role = 'teacher');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % orphaned monthly attendance log records (teacher_id not in profiles)', deleted_count;
  END IF;
END $$;

-- Delete monthly attendance logs for schools that no longer exist
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM teacher_monthly_attendance_log
  WHERE school_id NOT IN (SELECT id FROM schools);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % orphaned monthly attendance log records (school_id not in schools)', deleted_count;
  END IF;
END $$;

