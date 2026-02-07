-- =======================================================================
-- Add Grade-Section Assignments to Teacher Schools
-- 
-- Date: 2025-12-24
-- Purpose: Add grade_sections_assigned JSONB column to teacher_schools table
--          to support section-based teacher assignments
-- =======================================================================

-- Add grade_sections_assigned column to teacher_schools table
ALTER TABLE teacher_schools
ADD COLUMN IF NOT EXISTS grade_sections_assigned JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN teacher_schools.grade_sections_assigned IS 
'JSONB array of grade-section assignments. Format: [{"grade": "Grade 4", "sections": ["A", "B"]}, ...]. 
If NULL, derive from grades_assigned (all sections for those grades).';

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_teacher_schools_grade_sections_assigned 
ON teacher_schools USING GIN (grade_sections_assigned) 
WHERE grade_sections_assigned IS NOT NULL;

-- Migration script to populate grade_sections_assigned from existing grades_assigned
-- This assumes all sections for each grade (backward compatibility)
DO $$
DECLARE
  rec RECORD;
  grade_sections JSONB;
  grade_item JSONB;
BEGIN
  -- For each teacher_schools record with grades_assigned but no grade_sections_assigned
  FOR rec IN 
    SELECT id, grades_assigned 
    FROM teacher_schools 
    WHERE grades_assigned IS NOT NULL 
      AND array_length(grades_assigned, 1) > 0
      AND grade_sections_assigned IS NULL
  LOOP
    -- Build JSONB array: [{"grade": "Grade 4", "sections": []}, ...]
    -- Empty sections array means "all sections" (backward compatibility)
    grade_sections := '[]'::JSONB;
    
    FOR grade_item IN 
      SELECT jsonb_build_object('grade', grade, 'sections', '[]'::JSONB) as item
      FROM unnest(rec.grades_assigned) as grade
    LOOP
      grade_sections := grade_sections || grade_item;
    END LOOP;
    
    -- Update the record
    UPDATE teacher_schools
    SET grade_sections_assigned = grade_sections
    WHERE id = rec.id;
  END LOOP;
  
  RAISE NOTICE 'Migrated % teacher_schools records to grade_sections_assigned format', 
    (SELECT COUNT(*) FROM teacher_schools WHERE grade_sections_assigned IS NOT NULL);
END $$;




