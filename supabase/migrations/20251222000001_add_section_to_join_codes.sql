-- Add section column to join_codes table
-- This allows joining codes to be grade AND section specific

ALTER TABLE join_codes
ADD COLUMN IF NOT EXISTS section TEXT;

-- Add index for better performance when querying by grade and section
CREATE INDEX IF NOT EXISTS idx_join_codes_school_grade_section ON join_codes(school_id, grade, section) WHERE section IS NOT NULL;

-- Update the existing index to include section
DROP INDEX IF EXISTS idx_join_codes_school_grade;
CREATE INDEX IF NOT EXISTS idx_join_codes_school_grade ON join_codes(school_id, grade);

-- Add comment for documentation
COMMENT ON COLUMN join_codes.section IS 'Section identifier (e.g., A, B, C). When set, the joining code is specific to both grade and section.';




