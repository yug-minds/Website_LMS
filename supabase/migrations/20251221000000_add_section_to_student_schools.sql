-- Migration: Add section column to student_schools table
-- Date: 2025-12-21
-- Purpose: Add section support to divide students within the same grade into sections (A, B, C, D, etc.)
-- Sections are school AND grade specific

-- Add section column to student_schools table
ALTER TABLE student_schools 
ADD COLUMN IF NOT EXISTS section TEXT;

-- Add index for filtering by section (composite index for school_id, grade, section)
CREATE INDEX IF NOT EXISTS idx_student_schools_section 
ON student_schools(school_id, grade, section) 
WHERE section IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN student_schools.section IS 'Section identifier (e.g., A, B, C, D). Sections are school and grade specific.';




