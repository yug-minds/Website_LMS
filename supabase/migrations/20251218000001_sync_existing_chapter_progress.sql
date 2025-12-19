-- ====================================
-- SYNC EXISTING CHAPTER PROGRESS
-- ====================================
-- This migration syncs existing student_progress data to course_progress
-- Run this after applying the trigger to update existing progress

-- Function to sync all existing chapter progress
CREATE OR REPLACE FUNCTION sync_all_chapter_progress()
RETURNS TABLE(
  student_id UUID,
  chapter_id UUID,
  course_id UUID,
  total_content INTEGER,
  completed_content INTEGER,
  progress_percent DECIMAL(5,2),
  is_completed BOOLEAN
) AS $$
DECLARE
  chapter_record RECORD;
  total_content_count INTEGER;
  completed_content_count INTEGER;
  progress_percent DECIMAL(5,2);
  is_chapter_completed BOOLEAN;
BEGIN
  -- Loop through all unique student-chapter combinations that have progress
  FOR chapter_record IN 
    SELECT DISTINCT 
      sp.student_id,
      sp.chapter_id,
      sp.course_id
    FROM student_progress sp
    WHERE sp.chapter_id IS NOT NULL
      AND sp.course_id IS NOT NULL
      AND sp.student_id IS NOT NULL
  LOOP
    -- Count total published content for this chapter
    -- Count distinct IDs across all content tables
    SELECT COUNT(*) INTO total_content_count
    FROM (
      SELECT id FROM chapter_contents 
      WHERE chapter_id = chapter_record.chapter_id 
        AND (is_published = true OR is_published IS NULL)
      UNION
      SELECT id FROM videos 
      WHERE chapter_id = chapter_record.chapter_id 
        AND (is_published = true OR is_published IS NULL)
      UNION
      SELECT id FROM materials 
      WHERE chapter_id = chapter_record.chapter_id 
        AND (is_published = true OR is_published IS NULL)
      UNION
      SELECT id FROM assignments 
      WHERE chapter_id = chapter_record.chapter_id 
        AND (is_published = true OR is_published IS NULL)
    ) all_content;

    -- Count completed content for this student and chapter
    SELECT COUNT(DISTINCT content_id) INTO completed_content_count
    FROM student_progress
    WHERE student_id = chapter_record.student_id
      AND chapter_id = chapter_record.chapter_id
      AND is_completed = true
      AND content_id IS NOT NULL;

    -- Calculate progress
    IF total_content_count > 0 THEN
      progress_percent := (completed_content_count::DECIMAL / total_content_count::DECIMAL) * 100;
      is_chapter_completed := (completed_content_count >= total_content_count);
    ELSE
      progress_percent := 0;
      is_chapter_completed := false;
    END IF;

    -- Update or insert chapter progress
    INSERT INTO course_progress (
      student_id,
      course_id,
      chapter_id,
      completed,
      progress_percent,
      completed_at,
      updated_at
    )
    VALUES (
      chapter_record.student_id,
      chapter_record.course_id,
      chapter_record.chapter_id,
      is_chapter_completed,
      progress_percent,
      CASE WHEN is_chapter_completed THEN NOW() ELSE NULL END,
      NOW()
    )
    ON CONFLICT (student_id, chapter_id)
    DO UPDATE SET
      course_id = chapter_record.course_id,
      completed = is_chapter_completed,
      progress_percent = progress_percent,
      completed_at = CASE 
        WHEN is_chapter_completed THEN NOW()
        WHEN course_progress.completed = true AND NOT is_chapter_completed THEN NULL
        ELSE course_progress.completed_at
      END,
      updated_at = NOW();

    -- Return the result
    RETURN QUERY SELECT 
      chapter_record.student_id,
      chapter_record.chapter_id,
      chapter_record.course_id,
      total_content_count,
      completed_content_count,
      progress_percent,
      is_chapter_completed;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION sync_all_chapter_progress() TO authenticated;

-- Run the sync function to update existing progress
-- This will populate course_progress for all existing student_progress records
SELECT * FROM sync_all_chapter_progress();

-- Add comment
COMMENT ON FUNCTION sync_all_chapter_progress() IS 
  'Syncs all existing student_progress data to course_progress table. Run this after applying the trigger to update existing progress.';


