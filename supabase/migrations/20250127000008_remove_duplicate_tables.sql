-- ==========================================================
-- Migration: Remove/Consolidate Duplicate Tables
-- Date: 2025-01-27
-- Purpose: Remove duplicate tables and consolidate data
-- ==========================================================

-- ==========================================================
-- PART 1: Handle students table (duplicate of profiles + student_schools)
-- ==========================================================

-- The students table duplicates data from profiles and student_schools
-- We'll keep it for backward compatibility but ensure it stays in sync
-- OR we can deprecate it and remove it if not used

-- Check if students table is being used
-- If it has data, migrate it to student_schools if missing
DO $$
DECLARE
  student_count INTEGER;
  students_table_exists BOOLEAN;
BEGIN
  -- Check if students table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'students'
  ) INTO students_table_exists;
  
  IF students_table_exists THEN
    -- Count students that don't have corresponding student_schools records
    EXECUTE 'SELECT COUNT(*) FROM students s
      WHERE s.school_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM student_schools ss 
          WHERE ss.student_id = s.profile_id 
          AND ss.school_id = s.school_id
        )' INTO student_count;
    
    IF student_count > 0 THEN
      -- Create missing student_schools records from students table
      EXECUTE 'INSERT INTO student_schools (student_id, school_id, grade, is_active, enrolled_at)
        SELECT 
          s.profile_id,
          s.school_id,
          COALESCE(s.grade, ''Not Specified''),
          true,
          COALESCE(s.created_at, NOW())
        FROM students s
        WHERE s.school_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM student_schools ss 
            WHERE ss.student_id = s.profile_id 
            AND ss.school_id = s.school_id
          )
        ON CONFLICT (student_id, school_id) DO NOTHING';
      
      RAISE NOTICE 'Migrated % student records to student_schools', student_count;
    END IF;
    
    -- Add comment to students table indicating it's deprecated
    EXECUTE 'COMMENT ON TABLE students IS ''DEPRECATED: Use profiles + student_schools instead. This table is kept for backward compatibility only.''';
  ELSE
    RAISE NOTICE 'Students table does not exist, skipping migration';
  END IF;
END $$;

-- ==========================================================
-- PART 2: Handle assignment_submissions vs submissions
-- ==========================================================

-- Check if assignment_submissions exists and has data
DO $$
DECLARE
  table_exists BOOLEAN;
  record_count INTEGER;
BEGIN
  -- Check if assignment_submissions table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'assignment_submissions'
  ) INTO table_exists;
  
  IF table_exists THEN
    -- Count records in assignment_submissions
    EXECUTE 'SELECT COUNT(*) FROM assignment_submissions' INTO record_count;
    
    IF record_count > 0 THEN
      -- Migrate data from assignment_submissions to submissions if submissions doesn't have it
      INSERT INTO submissions (
        assignment_id,
        student_id,
        file_url,
        answers_json,
        text_content,
        grade,
        status,
        submitted_at,
        graded_at,
        created_at,
        updated_at
      )
      SELECT 
        asub.assignment_id,
        asub.student_id,
        NULL, -- file_url not in assignment_submissions
        asub.answers,
        NULL, -- text_content not in assignment_submissions
        asub.score::DECIMAL(5,2), -- Convert score to grade
        CASE 
          WHEN asub.graded_at IS NOT NULL THEN 'graded'
          WHEN asub.submitted_at IS NOT NULL THEN 'submitted'
          ELSE 'draft'
        END,
        asub.submitted_at,
        asub.graded_at,
        COALESCE(asub.created_at, NOW()),
        COALESCE(asub.updated_at, NOW())
      FROM assignment_submissions asub
      WHERE NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.assignment_id = asub.assignment_id
        AND s.student_id = asub.student_id
      )
      ON CONFLICT DO NOTHING;
      
      RAISE NOTICE 'Migrated % assignment submissions to submissions table', record_count;
    END IF;
    
    -- Mark assignment_submissions as deprecated
    COMMENT ON TABLE assignment_submissions IS 'DEPRECATED: Use submissions table instead. This table is kept for backward compatibility only.';
  END IF;
END $$;

-- ==========================================================
-- PART 3: Handle course_chapters vs chapters
-- ==========================================================

-- Check if course_chapters exists and has data
DO $$
DECLARE
  table_exists BOOLEAN;
  record_count INTEGER;
BEGIN
  -- Check if course_chapters table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'course_chapters'
  ) INTO table_exists;
  
  IF table_exists THEN
    -- Count records in course_chapters
    EXECUTE 'SELECT COUNT(*) FROM course_chapters' INTO record_count;
    
    IF record_count > 0 THEN
      -- Migrate data from course_chapters to chapters if chapters doesn't have it
      INSERT INTO chapters (
        id,
        course_id,
        name,
        title,
        learning_outcomes,
        order_number,
        order_index,
        is_published,
        created_at,
        updated_at
      )
      SELECT 
        cc.id,
        cc.course_id,
        cc.title, -- Use title as name
        cc.title,
        cc.learning_outcomes,
        cc.chapter_number,
        cc.chapter_number, -- Use chapter_number as order_index
        cc.is_published,
        cc.created_at,
        NOW()
      FROM course_chapters cc
      WHERE NOT EXISTS (
        SELECT 1 FROM chapters c
        WHERE c.course_id = cc.course_id
        AND c.order_number = cc.chapter_number
      )
      ON CONFLICT (id) DO NOTHING;
      
      RAISE NOTICE 'Migrated % course chapters to chapters table', record_count;
    END IF;
    
    -- Mark course_chapters as deprecated
    COMMENT ON TABLE course_chapters IS 'DEPRECATED: Use chapters table instead. This table is kept for backward compatibility only.';
  END IF;
END $$;

-- ==========================================================
-- PART 4: Create views for backward compatibility (optional)
-- ==========================================================

-- Create view for students that combines profiles and student_schools
CREATE OR REPLACE VIEW students_view AS
SELECT 
  p.id as profile_id,
  p.id as id, -- For backward compatibility
  p.full_name,
  p.email,
  p.phone,
  p.address,
  p.parent_name,
  p.parent_phone,
  ss.school_id,
  ss.grade,
  ss.joining_code,
  ss.enrolled_at as created_at,
  ss.enrolled_at,
  NOW() as updated_at,
  NULL::TIMESTAMPTZ as last_login
FROM profiles p
LEFT JOIN student_schools ss ON ss.student_id = p.id AND ss.is_active = true
WHERE p.role = 'student';

COMMENT ON VIEW students_view IS 'View combining profiles and student_schools for backward compatibility with students table';

-- ==========================================================
-- PART 5: Add constraints to prevent future duplicates
-- ==========================================================

-- Ensure we don't create duplicate student_schools records
-- (Already has UNIQUE constraint, but adding explicit check)

-- Ensure we don't create duplicate submissions
-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'submissions_assignment_student_unique'
  ) THEN
    ALTER TABLE submissions 
    ADD CONSTRAINT submissions_assignment_student_unique 
    UNIQUE (assignment_id, student_id);
  END IF;
END $$;




