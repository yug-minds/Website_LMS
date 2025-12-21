-- ============================================================================
-- Database Query Optimization - Additional Indexes and Query Improvements
-- Created: 2025-12-07
-- Purpose: Add missing indexes for JOIN operations and optimize slow queries
-- ============================================================================

-- ============================================================================
-- 1. Add Missing Indexes for JOIN Operations
-- ============================================================================

-- Index for classes.id (used in multiple JOINs with teacher_classes.class_id)
-- This is critical for teacher dashboard queries that JOIN teacher_classes -> classes
CREATE INDEX IF NOT EXISTS idx_classes_id 
ON classes(id);

-- Index for classes.school_id (used in JOINs with student_schools)
-- Optimizes student_stats query in teacher dashboard: teacher_classes -> classes -> student_schools
CREATE INDEX IF NOT EXISTS idx_classes_school_id 
ON classes(school_id);

-- Composite index for classes (id, school_id) - covers both JOIN patterns
-- This is more efficient than two separate indexes for queries that use both
CREATE INDEX IF NOT EXISTS idx_classes_id_school 
ON classes(id, school_id);

-- Index for teacher_classes.class_id (used in JOINs with classes)
-- Optimizes: teacher_classes JOIN classes ON classes.id = teacher_classes.class_id
CREATE INDEX IF NOT EXISTS idx_teacher_classes_class_id 
ON teacher_classes(class_id);

-- Composite index for teacher_classes (teacher_id, class_id) - covers both lookup patterns
-- Optimizes queries that filter by teacher_id and JOIN on class_id
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_class 
ON teacher_classes(teacher_id, class_id);

-- Index for student_schools.school_id (used in JOINs with classes)
-- Optimizes: classes JOIN student_schools ON student_schools.school_id = classes.school_id
CREATE INDEX IF NOT EXISTS idx_student_schools_school_id_optimized 
ON student_schools(school_id, is_active, student_id);

-- ============================================================================
-- 2. Optimize UNION Queries in Student Dashboard Function
-- ============================================================================

-- The student dashboard function uses UNION to combine student_courses and enrollments
-- Add covering indexes to make UNION more efficient
-- (Indexes already exist, but ensure they're optimal)

-- Verify indexes exist for UNION query optimization
-- student_courses: (student_id, is_completed, course_id) - already exists
-- enrollments: (student_id, status, course_id) - already exists

-- ============================================================================
-- 3. Optimize Array Operations
-- ============================================================================

-- The functions use ARRAY_AGG and ANY() operations
-- Ensure indexes support these efficiently
-- The existing composite indexes should handle this, but we can add specific ones

-- Index for assignments with course_id array lookups (ANY operation)
-- This optimizes: WHERE course_id = ANY(v_course_ids)
-- Note: PostgreSQL doesn't support INCLUDE in all versions, use composite index instead
CREATE INDEX IF NOT EXISTS idx_assignments_course_id_array 
ON assignments(course_id, due_date, is_published) 
WHERE is_published = true;

-- ============================================================================
-- 4. Optimize Date Range Queries
-- ============================================================================

-- Index for attendance date range queries (monthly attendance)
-- Already exists but ensure it's optimal for range scans
-- attendance: (user_id, date, status) - already exists via idx_attendance_composite

-- Index for teacher_reports date filtering (30-day lookups)
-- Optimizes: WHERE date >= v_thirty_days_ago
-- Composite index includes all columns used in queries
CREATE INDEX IF NOT EXISTS idx_teacher_reports_date_school 
ON teacher_reports(school_id, date DESC, teacher_id, approved_by);

-- ============================================================================
-- 5. Optimize DISTINCT Operations
-- ============================================================================

-- The functions use COUNT(DISTINCT ...) which can be slow
-- Ensure indexes support these efficiently

-- Index for DISTINCT class_id lookups in teacher_classes
-- Already covered by idx_teacher_classes_teacher_class

-- Index for DISTINCT student_id lookups in student_schools
-- Already covered by idx_student_schools_school_id_optimized

-- ============================================================================
-- 6. Analyze Tables for Better Query Plans
-- ============================================================================

-- Update table statistics to help query planner make better decisions
ANALYZE classes;
ANALYZE teacher_classes;
ANALYZE student_schools;
ANALYZE assignments;
ANALYZE teacher_reports;

-- ============================================================================
-- 7. Add Function-Specific Optimizations
-- ============================================================================

-- Optimize the student_stats CTE in teacher dashboard function
-- The 3-table JOIN (teacher_classes -> classes -> student_schools) can be slow
-- We've added indexes above, but we can also add a covering index

-- Covering index for student_schools that includes all columns used in JOIN
-- This allows index-only scans
-- Composite index covers all columns used in queries
CREATE INDEX IF NOT EXISTS idx_student_schools_school_covering 
ON student_schools(school_id, is_active, student_id);

-- ============================================================================
-- 8. Comments
-- ============================================================================

COMMENT ON INDEX idx_classes_id IS 'Index for classes.id - optimizes JOINs with teacher_classes';
COMMENT ON INDEX idx_classes_school_id IS 'Index for classes.school_id - optimizes JOINs with student_schools';
COMMENT ON INDEX idx_classes_id_school IS 'Composite index covering both id and school_id JOIN patterns';
COMMENT ON INDEX idx_teacher_classes_class_id IS 'Index for teacher_classes.class_id - optimizes JOINs with classes';
COMMENT ON INDEX idx_teacher_classes_teacher_class IS 'Composite index for teacher_classes lookups and JOINs';
COMMENT ON INDEX idx_assignments_course_id_array IS 'Index optimized for ANY() array operations in assignments queries';
COMMENT ON INDEX idx_teacher_reports_date_school IS 'Index for date range queries on teacher_reports by school';
COMMENT ON INDEX idx_student_schools_school_covering IS 'Covering index for student_schools JOINs - enables index-only scans';

