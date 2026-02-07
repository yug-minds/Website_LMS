-- =======================================================================
-- Ensure normalize_grade_for_comparison Function Exists
-- 
-- Date: 2025-12-23
-- Purpose: Fix "function normalize_grade_for_comparison(text) does not exist" error
-- This function is required by the trigger on student_schools table
-- =======================================================================

-- Create the function if it doesn't exist
CREATE OR REPLACE FUNCTION normalize_grade_for_comparison(grade_text TEXT)
RETURNS TEXT AS $normalize$
BEGIN
  IF grade_text IS NULL OR grade_text = '' THEN
    RETURN '';
  END IF;
  
  -- Remove "Grade " prefix (case-sensitive)
  -- Then remove "grade" prefix (case-insensitive)
  -- Then trim and lowercase
  RETURN LOWER(TRIM(
    REPLACE(
      REPLACE(TRIM(grade_text), 'Grade ', ''),
      'grade',
      ''
    )
  ));
END;
$normalize$ LANGUAGE plpgsql IMMUTABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION normalize_grade_for_comparison(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION normalize_grade_for_comparison(TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION normalize_grade_for_comparison(TEXT) IS 
'Normalizes grade strings for comparison (handles "Grade 4", "grade4", "4", etc.). Returns lowercase trimmed string without "Grade"/"grade" prefix.';

-- Create or replace the trigger function
-- This function is called by the trigger to auto-populate normalized_grade
CREATE OR REPLACE FUNCTION update_student_schools_normalized_grade()
RETURNS TRIGGER AS $trigger$
BEGIN
  -- Only set normalized_grade if grade is provided
  IF NEW.grade IS NOT NULL THEN
    NEW.normalized_grade := normalize_grade_for_comparison(NEW.grade);
  ELSE
    NEW.normalized_grade := NULL;
  END IF;
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trg_update_student_schools_normalized_grade ON student_schools;
CREATE TRIGGER trg_update_student_schools_normalized_grade
BEFORE INSERT OR UPDATE OF grade ON student_schools
FOR EACH ROW
EXECUTE FUNCTION update_student_schools_normalized_grade();

-- Test the function to ensure it works
DO $$
DECLARE
  test_result TEXT;
BEGIN
  test_result := normalize_grade_for_comparison('Grade 4');
  IF test_result != '4' THEN
    RAISE EXCEPTION 'Function test failed: expected "4", got "%"', test_result;
  END IF;
  RAISE NOTICE 'Function test passed: normalize_grade_for_comparison("Grade 4") = "%"', test_result;
END $$;

