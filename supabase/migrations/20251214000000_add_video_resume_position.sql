-- Migration: Add video resume position to student_progress
-- This enables Coursera/Udemy-style video resume functionality

-- Add last_position column for video resume playback
ALTER TABLE student_progress 
ADD COLUMN IF NOT EXISTS last_position double precision DEFAULT 0;

-- Add time_spent_seconds for more granular tracking
ALTER TABLE student_progress 
ADD COLUMN IF NOT EXISTS time_spent_seconds integer DEFAULT 0;

-- Add index for faster lookups when resuming videos
CREATE INDEX IF NOT EXISTS idx_student_progress_content_student 
ON student_progress(content_id, student_id);

-- Add index for course-level progress queries
CREATE INDEX IF NOT EXISTS idx_student_progress_course_student_completed 
ON student_progress(course_id, student_id, is_completed);

-- Comment on columns for documentation
COMMENT ON COLUMN student_progress.last_position IS 'Last video playback position in seconds for resume functionality';
COMMENT ON COLUMN student_progress.time_spent_seconds IS 'Total time spent on this content in seconds';

-- Function to update video position (upsert pattern)
CREATE OR REPLACE FUNCTION upsert_video_position(
  p_student_id uuid,
  p_course_id uuid,
  p_chapter_id uuid,
  p_content_id uuid,
  p_position double precision,
  p_time_spent integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO student_progress (
    student_id,
    course_id,
    chapter_id,
    content_id,
    last_position,
    time_spent_seconds,
    updated_at
  )
  VALUES (
    p_student_id,
    p_course_id,
    p_chapter_id,
    p_content_id,
    p_position,
    p_time_spent,
    NOW()
  )
  ON CONFLICT (student_id, content_id) 
  DO UPDATE SET
    last_position = EXCLUDED.last_position,
    time_spent_seconds = student_progress.time_spent_seconds + EXCLUDED.time_spent_seconds,
    updated_at = NOW();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_video_position TO authenticated;

-- Function to get video position for resume
CREATE OR REPLACE FUNCTION get_video_position(
  p_student_id uuid,
  p_content_id uuid
)
RETURNS double precision
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position double precision;
BEGIN
  SELECT last_position INTO v_position
  FROM student_progress
  WHERE student_id = p_student_id
    AND content_id = p_content_id;
  
  RETURN COALESCE(v_position, 0);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_video_position TO authenticated;

-- Verify migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'student_progress' 
    AND column_name = 'last_position'
  ) THEN
    RAISE NOTICE '✅ Migration successful: last_position column added to student_progress';
  ELSE
    RAISE EXCEPTION '❌ Migration failed: last_position column not found';
  END IF;
END $$;
