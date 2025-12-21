-- =======================================================================
-- Backfill Normalized Grades - Data Update Only
-- 
-- Date: 2025-02-01
-- Description:
-- Backfills the normalized_grade columns for existing data.
-- This is separated from the structure migration to avoid timeouts.
-- 
-- IMPORTANT: This can be run multiple times safely (idempotent).
-- If it times out, you can:
-- 1. Run it again (it will only update NULL values)
-- 2. Run it in batches using WHERE clauses
-- 3. Let it run gradually - the hybrid function works with partial data
-- =======================================================================

-- Backfill student_schools.normalized_grade
-- Only update rows where normalized_grade is NULL
UPDATE student_schools 
SET normalized_grade = normalize_grade_for_comparison(grade)
WHERE normalized_grade IS NULL;

-- Backfill course_access.normalized_grade
-- Only update rows where normalized_grade is NULL
UPDATE course_access 
SET normalized_grade = normalize_grade_for_comparison(grade)
WHERE normalized_grade IS NULL;

-- Optional: Analyze tables to update statistics for query planner
ANALYZE student_schools;
ANALYZE course_access;
