-- ====================================
-- AUTO-UPDATE CHAPTER COMPLETION TRIGGER
-- ====================================
-- This trigger automatically updates course_progress when all content
-- in a chapter is completed by a student

-- Function to check and update chapter completion
CREATE OR REPLACE FUNCTION check_and_update_chapter_completion()
RETURNS TRIGGER AS $$
DECLARE
  chapter_id_val UUID;
  course_id_val UUID;
  student_id_val UUID;
  total_content_count INTEGER := 0;
  completed_content_count INTEGER := 0;
  progress_percent DECIMAL(5,2) := 0;
  is_chapter_completed BOOLEAN := false;
BEGIN
  -- Only process if content is marked as completed
  IF NEW.is_completed = true THEN
    -- Get chapter and course IDs from the student_progress record
    chapter_id_val := NEW.chapter_id;
    course_id_val := NEW.course_id;
    student_id_val := NEW.student_id;

    -- Skip if required IDs are missing
    IF chapter_id_val IS NULL OR course_id_val IS NULL OR student_id_val IS NULL THEN
      RAISE NOTICE 'Skipping chapter completion check: missing IDs (chapter_id=%, course_id=%, student_id=%)', 
        chapter_id_val, course_id_val, student_id_val;
      RETURN NEW;
    END IF;

    -- Count total published content for this chapter
    -- Content can be in: chapter_contents, videos, materials, assignments
    -- Count distinct IDs across all content tables
    SELECT COUNT(*) INTO total_content_count
    FROM (
      SELECT id FROM chapter_contents 
      WHERE chapter_id = chapter_id_val 
        AND (is_published = true OR is_published IS NULL)
      UNION
      SELECT id FROM videos 
      WHERE chapter_id = chapter_id_val 
        AND (is_published = true OR is_published IS NULL)
      UNION
      SELECT id FROM materials 
      WHERE chapter_id = chapter_id_val 
        AND (is_published = true OR is_published IS NULL)
      UNION
      SELECT id FROM assignments 
      WHERE chapter_id = chapter_id_val 
        AND (is_published = true OR is_published IS NULL)
    ) all_content;

    -- Count completed content for this student and chapter
    SELECT COUNT(DISTINCT content_id) INTO completed_content_count
    FROM student_progress
    WHERE student_id = student_id_val
      AND chapter_id = chapter_id_val
      AND is_completed = true
      AND content_id IS NOT NULL;

    -- Calculate progress percentage
    IF total_content_count > 0 THEN
      progress_percent := (completed_content_count::DECIMAL / total_content_count::DECIMAL) * 100;
      is_chapter_completed := (completed_content_count >= total_content_count);
    ELSE
      progress_percent := 0;
      is_chapter_completed := false;
    END IF;

    -- Update or insert chapter progress
    -- The course_progress table has UNIQUE(student_id, chapter_id) constraint
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
      student_id_val,
      course_id_val,
      chapter_id_val,
      is_chapter_completed,
      progress_percent,
      CASE WHEN is_chapter_completed THEN NOW() ELSE NULL END,
      NOW()
    )
    ON CONFLICT (student_id, chapter_id)
    DO UPDATE SET
      course_id = course_id_val, -- Update course_id in case it changed
      completed = is_chapter_completed,
      progress_percent = progress_percent,
      completed_at = CASE 
        WHEN is_chapter_completed THEN NOW()
        WHEN course_progress.completed = true AND NOT is_chapter_completed THEN NULL
        ELSE course_progress.completed_at
      END,
      updated_at = NOW();

    -- Log for debugging
    RAISE NOTICE 'Chapter completion check: chapter_id=%, student_id=%, course_id=%, total_content=%, completed_content=%, progress_percent=%, is_completed=%', 
      chapter_id_val, student_id_val, course_id_val, total_content_count, completed_content_count, progress_percent, is_chapter_completed;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Error in check_and_update_chapter_completion: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on student_progress table
DROP TRIGGER IF EXISTS trigger_check_chapter_completion ON student_progress;
CREATE TRIGGER trigger_check_chapter_completion
  AFTER INSERT OR UPDATE OF is_completed ON student_progress
  FOR EACH ROW
  WHEN (NEW.is_completed = true)
  EXECUTE FUNCTION check_and_update_chapter_completion();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_and_update_chapter_completion() TO authenticated;

-- Add comment
COMMENT ON FUNCTION check_and_update_chapter_completion() IS 
  'Automatically checks and updates chapter completion status in course_progress when content is marked as completed in student_progress';


