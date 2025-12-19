-- Additional Composite Indexes for Dashboard Performance
-- Created: 2025-01-30
-- Purpose: Add composite indexes for common query patterns identified in analysis

-- ============================================================================
-- 1. Student Dashboard Indexes
-- ============================================================================

-- Composite index for student_courses queries (student_id, is_completed, course_id)
-- This covers the most common query pattern: finding active courses for a student
CREATE INDEX IF NOT EXISTS idx_student_courses_composite 
ON student_courses(student_id, is_completed, course_id) 
WHERE is_completed = false;

-- Composite index for enrollments (student_id, status, course_id)
-- Covers active enrollment lookups
CREATE INDEX IF NOT EXISTS idx_enrollments_composite 
ON enrollments(student_id, status, course_id) 
WHERE status = 'active';

-- Composite index for assignments with course filter and due date
-- Optimizes pending assignments queries
CREATE INDEX IF NOT EXISTS idx_assignments_composite 
ON assignments(course_id, due_date, is_published) 
WHERE is_published = true;

-- Composite index for submissions (student_id, status, assignment_id)
-- Optimizes submission lookups and completed assignments count
CREATE INDEX IF NOT EXISTS idx_submissions_composite 
ON submissions(student_id, status, assignment_id);

-- Composite index for attendance (user_id, date, status)
-- Optimizes monthly attendance percentage calculations
CREATE INDEX IF NOT EXISTS idx_attendance_composite 
ON attendance(user_id, date, status);

-- ============================================================================
-- 2. Teacher Dashboard Indexes
-- ============================================================================

-- Composite index for teacher_reports (teacher_id, report_status, created_at)
-- Optimizes pending reports queries and recent reports ordering
CREATE INDEX IF NOT EXISTS idx_teacher_reports_composite 
ON teacher_reports(teacher_id, report_status, created_at DESC);

-- Composite index for teacher_classes (teacher_id, class_id)
-- Optimizes class lookups for teachers
CREATE INDEX IF NOT EXISTS idx_teacher_classes_composite 
ON teacher_classes(teacher_id, class_id);

-- Composite index for teacher_leaves (teacher_id, status, start_date, end_date)
-- Optimizes leave balance and pending leaves queries
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_composite 
ON teacher_leaves(teacher_id, status, start_date, end_date);

-- ============================================================================
-- 3. School Admin Dashboard Indexes
-- ============================================================================

-- Composite index for student_schools (school_id, is_active, student_id)
-- Optimizes student count queries for schools
CREATE INDEX IF NOT EXISTS idx_student_schools_composite 
ON student_schools(school_id, is_active, student_id) 
WHERE is_active = true;

-- Composite index for teacher_schools (school_id, teacher_id)
-- Optimizes teacher count queries for schools
CREATE INDEX IF NOT EXISTS idx_teacher_schools_composite 
ON teacher_schools(school_id, teacher_id);

-- Composite index for courses (school_id, status, is_published)
-- Optimizes active courses count for schools
CREATE INDEX IF NOT EXISTS idx_courses_school_composite 
ON courses(school_id, status, is_published) 
WHERE status = 'Published' AND is_published = true;

-- Composite index for teacher_reports by school (school_id, approved_by, created_at)
-- Optimizes pending reports count for schools
CREATE INDEX IF NOT EXISTS idx_teacher_reports_school_composite 
ON teacher_reports(school_id, approved_by, created_at DESC) 
WHERE approved_by IS NULL;

-- Composite index for teacher_leaves by school (school_id, status)
-- Optimizes pending leaves count for schools
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_school_composite 
ON teacher_leaves(school_id, status) 
WHERE status = 'Pending';

-- ============================================================================
-- 4. Partial Indexes for Filtered Queries
-- ============================================================================

-- Partial index for pending assignments (only published assignments)
-- Note: due_date filtering is done at query time, not in index predicate
-- because CURRENT_DATE is not IMMUTABLE
CREATE INDEX IF NOT EXISTS idx_assignments_pending 
ON assignments(course_id, due_date) 
WHERE is_published = true;

-- Partial index for pending leaves
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_pending 
ON teacher_leaves(teacher_id, created_at DESC) 
WHERE status = 'Pending';

-- Partial index for approved leaves (for leave balance calculation)
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_approved 
ON teacher_leaves(teacher_id, start_date, end_date, total_days) 
WHERE status = 'Approved';

-- Partial index for submitted submissions
CREATE INDEX IF NOT EXISTS idx_submissions_submitted 
ON submissions(student_id, assignment_id) 
WHERE status = 'submitted';

-- Partial index for graded submissions (for average grade)
CREATE INDEX IF NOT EXISTS idx_submissions_graded 
ON submissions(student_id, grade) 
WHERE grade IS NOT NULL;

-- ============================================================================
-- 5. Analyze Tables for Better Query Plans
-- ============================================================================

ANALYZE student_courses;
ANALYZE enrollments;
ANALYZE assignments;
ANALYZE submissions;
ANALYZE attendance;
ANALYZE teacher_classes;
ANALYZE teacher_reports;
ANALYZE teacher_leaves;
ANALYZE student_schools;
ANALYZE teacher_schools;
ANALYZE courses;

-- ============================================================================
-- 6. Comments
-- ============================================================================

COMMENT ON INDEX idx_student_courses_composite IS 'Composite index for student active courses queries';
COMMENT ON INDEX idx_enrollments_composite IS 'Composite index for active enrollment lookups';
COMMENT ON INDEX idx_assignments_composite IS 'Composite index for published assignments with due dates';
COMMENT ON INDEX idx_submissions_composite IS 'Composite index for student submission lookups';
COMMENT ON INDEX idx_attendance_composite IS 'Composite index for monthly attendance calculations';
COMMENT ON INDEX idx_teacher_reports_composite IS 'Composite index for teacher reports with status and ordering';
COMMENT ON INDEX idx_teacher_classes_composite IS 'Composite index for teacher class lookups';
COMMENT ON INDEX idx_teacher_leaves_composite IS 'Composite index for teacher leave queries';

