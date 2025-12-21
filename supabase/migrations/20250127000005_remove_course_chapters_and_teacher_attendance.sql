-- ==========================================================
-- Migration: Remove course_chapters and teacher_attendance Tables
-- Date: 2025-01-27
-- Purpose: Remove deprecated tables and migrate data
-- ==========================================================

-- ==========================================================
-- PART 1: Migrate teacher_attendance to attendance
-- ==========================================================

-- Migrate data from teacher_attendance to attendance table
DO $$
DECLARE
  record_count INTEGER;
  migrated_count INTEGER := 0;
BEGIN
  -- Check if teacher_attendance table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'teacher_attendance'
  ) THEN
    -- Count records to migrate
    EXECUTE 'SELECT COUNT(*) FROM teacher_attendance' INTO record_count;
    
    IF record_count > 0 THEN
      -- Migrate data from teacher_attendance to attendance
      -- Map teacher_id to user_id, status values, and notes to remarks
      INSERT INTO attendance (
        user_id,
        school_id,
        date,
        status,
        remarks,
        recorded_by,
        recorded_at
      )
      SELECT 
        ta.teacher_id as user_id, -- Map teacher_id to user_id
        ta.school_id,
        ta.date,
        -- Map status values from teacher_attendance to attendance format
        CASE 
          WHEN ta.status = 'Absent (Approved)' THEN 'Leave-Approved'
          WHEN ta.status = 'Absent (Unapproved)' THEN 'Absent'
          WHEN ta.status = 'Late' THEN 'Present' -- Late is treated as Present
          WHEN ta.status = 'Present' THEN 'Present'
          ELSE 'Present' -- Default to Present
        END as status,
        -- Combine notes with check-in/out times if available
        CASE 
          WHEN ta.check_in_time IS NOT NULL OR ta.check_out_time IS NOT NULL THEN
            COALESCE(ta.notes || ' | ', '') || 
            CASE 
              WHEN ta.check_in_time IS NOT NULL AND ta.check_out_time IS NOT NULL 
                THEN 'Check-in: ' || ta.check_in_time::text || ', Check-out: ' || ta.check_out_time::text
              WHEN ta.check_in_time IS NOT NULL 
                THEN 'Check-in: ' || ta.check_in_time::text
              WHEN ta.check_out_time IS NOT NULL 
                THEN 'Check-out: ' || ta.check_out_time::text
              ELSE ''
            END
          ELSE ta.notes
        END as remarks,
        ta.teacher_id as recorded_by, -- Default to teacher themselves
        COALESCE(ta.updated_at, ta.created_at, NOW()) as recorded_at
      FROM teacher_attendance ta
      WHERE NOT EXISTS (
        -- Don't migrate if record already exists in attendance
        SELECT 1 FROM attendance a
        WHERE a.user_id = ta.teacher_id
        AND a.school_id = ta.school_id
        AND a.date = ta.date
      )
      ON CONFLICT (user_id, school_id, date) DO NOTHING;
      
      GET DIAGNOSTICS migrated_count = ROW_COUNT;
      RAISE NOTICE 'Migrated % teacher_attendance records to attendance table', migrated_count;
    END IF;
  END IF;
END $$;

-- ==========================================================
-- PART 2: Verify course_chapters data is in chapters
-- ==========================================================

-- Note: course_chapters data should already be migrated to chapters
-- in migration 20250127000001_remove_duplicate_tables.sql
-- This is just a verification step

DO $$
DECLARE
  course_chapters_count INTEGER;
  chapters_count INTEGER;
BEGIN
  -- Check if course_chapters table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'course_chapters'
  ) THEN
    EXECUTE 'SELECT COUNT(*) FROM course_chapters' INTO course_chapters_count;
    
    IF course_chapters_count > 0 THEN
      -- Check if corresponding chapters exist
      EXECUTE 'SELECT COUNT(*) FROM chapters WHERE course_id IN (SELECT DISTINCT course_id FROM course_chapters)' INTO chapters_count;
      
      IF chapters_count < course_chapters_count THEN
        RAISE WARNING 'Some course_chapters records may not have been migrated to chapters. course_chapters: %, chapters: %', course_chapters_count, chapters_count;
      ELSE
        RAISE NOTICE 'All course_chapters data appears to be in chapters table';
      END IF;
    END IF;
  END IF;
END $$;

-- ==========================================================
-- PART 3: Drop deprecated tables
-- ==========================================================

-- Drop course_chapters table (data already in chapters)
DROP TABLE IF EXISTS course_chapters CASCADE;

-- Drop teacher_attendance table (data migrated to attendance)
DROP TABLE IF EXISTS teacher_attendance CASCADE;

-- ==========================================================
-- PART 4: Add comments to document removal
-- ==========================================================

COMMENT ON TABLE attendance IS 'Generalized attendance table for both teachers and students. Replaces deprecated teacher_attendance table.';
COMMENT ON TABLE chapters IS 'Course chapters table. Replaces deprecated course_chapters table.';

-- ==========================================================
-- Summary
-- ==========================================================

-- Tables removed:
-- 1. course_chapters - Use chapters table instead (data already migrated)
-- 2. teacher_attendance - Use attendance table instead (data migrated in this migration)

-- Data migration:
-- - teacher_attendance → attendance (migrated in this migration)
-- - course_chapters → chapters (migrated in previous migration)

-- Status mapping for teacher_attendance → attendance:
-- - 'Present' → 'Present'
-- - 'Absent (Approved)' → 'Leave-Approved'
-- - 'Absent (Unapproved)' → 'Absent'
-- - 'Late' → 'Present' (with note about being late)

-- Column mapping:
-- - teacher_id → user_id
-- - notes → remarks
-- - check_in_time/check_out_time → stored in remarks text














