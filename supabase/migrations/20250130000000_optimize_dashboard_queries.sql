-- Additional Performance Indexes for Dashboard Queries
-- Created: 2025-01-30
-- Purpose: Optimize dashboard API queries for better performance

-- ============================================================================
-- 1. Optimize student dashboard queries
-- ============================================================================

-- Index for student_courses queries (already exists but ensure it's optimal)
CREATE INDEX IF NOT EXISTS idx_student_courses_student_active_optimized 
ON student_courses(student_id, is_completed) 
WHERE is_completed = false;

-- Index for enrollments with status filter
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status_optimized 
ON enrollments(student_id, status, course_id) 
WHERE status = 'active';

-- Index for assignments with course_id and due_date (for pending assignments)
-- Note: Cannot use CURRENT_DATE in index predicate (not immutable), but index on due_date
-- will still help with date range queries
CREATE INDEX IF NOT EXISTS idx_assignments_course_due_published 
ON assignments(course_id, due_date, is_published) 
WHERE is_published = true;

-- Index for submissions with student and status
CREATE INDEX IF NOT EXISTS idx_submissions_student_status_optimized 
ON submissions(student_id, status, assignment_id);

-- ============================================================================
-- 2. Optimize teacher dashboard queries
-- ============================================================================

-- Index for teacher_classes with teacher_id
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher 
ON teacher_classes(teacher_id);

-- Index for teacher_reports with teacher_id and ordering
CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_created 
ON teacher_reports(teacher_id, created_at DESC);

-- Note: teacher_monthly_attendance is a VIEW, not a TABLE, so we cannot create indexes on it.
-- The view is based on the attendance table, which should have indexes for optimal performance.

-- Index for teacher_leaves with teacher_id and status
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_status_dates 
ON teacher_leaves(teacher_id, status, start_date, end_date);

-- ============================================================================
-- 3. Optimize admin dashboard queries
-- ============================================================================

-- Index for schools count query
CREATE INDEX IF NOT EXISTS idx_schools_active 
ON schools(id) 
WHERE id IS NOT NULL;

-- Index for teachers count query
CREATE INDEX IF NOT EXISTS idx_teachers_active 
ON teachers(id) 
WHERE id IS NOT NULL;

-- Index for profiles with role filter
CREATE INDEX IF NOT EXISTS idx_profiles_role_optimized 
ON profiles(role, id) 
WHERE role IN ('student', 'teacher', 'school_admin', 'admin');

-- Index for courses with status and published filter
CREATE INDEX IF NOT EXISTS idx_courses_status_published 
ON courses(status, is_published, id) 
WHERE status = 'Published' AND is_published = true;

-- ============================================================================
-- 4. Optimize notifications queries
-- ============================================================================

-- Index for notifications with user_id and read status
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
ON notifications(user_id, is_read, created_at DESC);

-- ============================================================================
-- 5. Optimize course-related queries
-- ============================================================================

-- Index for chapters with course_id and published status
CREATE INDEX IF NOT EXISTS idx_chapters_course_published_order 
ON chapters(course_id, is_published, order_index) 
WHERE is_published = true;

-- Index for chapter_contents with chapter_id and order
CREATE INDEX IF NOT EXISTS idx_chapter_contents_chapter_order_optimized 
ON chapter_contents(chapter_id, order_index);

-- Index for course_progress with student and course
CREATE INDEX IF NOT EXISTS idx_course_progress_student_course 
ON course_progress(student_id, course_id, chapter_id);

-- ============================================================================
-- 6. Analyze tables to update statistics
-- ============================================================================
ANALYZE student_courses;
ANALYZE enrollments;
ANALYZE assignments;
ANALYZE submissions;
ANALYZE teacher_classes;
ANALYZE teacher_reports;
-- Note: teacher_monthly_attendance is a VIEW, not a TABLE, so ANALYZE cannot be run on it
ANALYZE teacher_leaves;
ANALYZE schools;
ANALYZE teachers;
ANALYZE profiles;
ANALYZE courses;
ANALYZE notifications;
ANALYZE chapters;
ANALYZE chapter_contents;
ANALYZE course_progress;

