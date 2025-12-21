-- Performance Optimization: Add indexes for frequently queried columns
-- This migration adds indexes to improve query performance for API endpoints

-- Indexes for student_courses queries (used in student dashboard and courses API)
-- Only create if table and columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_courses') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'student_courses' AND column_name = 'is_completed'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_student_courses_student_active 
      ON student_courses(student_id, is_completed) 
      WHERE is_completed = false;
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_student_courses_student_course 
    ON student_courses(student_id, course_id);
  END IF;
END $$;

-- Indexes for enrollments queries (used in student dashboard and courses API)
CREATE INDEX IF NOT EXISTS idx_enrollments_student_active 
ON enrollments(student_id, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_enrollments_student_course 
ON enrollments(student_id, course_id, status);

-- Indexes for assignments queries (used in student dashboard, courses API, assignments page)
CREATE INDEX IF NOT EXISTS idx_assignments_course_published 
ON assignments(course_id, is_published, due_date) 
WHERE is_published = true;

-- Note: Cannot use CURRENT_DATE in index predicate (not IMMUTABLE)
-- This index will help with due_date queries but won't filter by current date
CREATE INDEX IF NOT EXISTS idx_assignments_course_due_date 
ON assignments(course_id, due_date) 
WHERE is_published = true;

-- Indexes for submissions queries (used in student dashboard, courses API, assignments page)
CREATE INDEX IF NOT EXISTS idx_submissions_student_assignment 
ON submissions(student_id, assignment_id, status);

CREATE INDEX IF NOT EXISTS idx_submissions_student_status 
ON submissions(student_id, status) 
WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_submissions_student_graded 
ON submissions(student_id, grade) 
WHERE grade IS NOT NULL;

-- Indexes for course_progress queries (used in student courses API, chapter pages)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'course_progress') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'course_progress' AND column_name = 'is_completed'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_course_progress_student_chapter 
      ON course_progress(student_id, chapter_id, is_completed);
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_course_progress_student_course 
    ON course_progress(student_id, course_id);
  END IF;
END $$;

-- Indexes for notification_replies queries (used in notifications API - fixes N+1)
CREATE INDEX IF NOT EXISTS idx_notification_replies_notification 
ON notification_replies(notification_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_replies_user 
ON notification_replies(notification_id, user_id);

-- Indexes for teacher_classes queries (used in teacher dashboard and classes API)
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher 
ON teacher_classes(teacher_id, school_id);

CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_school 
ON teacher_classes(teacher_id, school_id, class_id);

-- Indexes for class_schedules queries (used in teacher classes API)
CREATE INDEX IF NOT EXISTS idx_class_schedules_teacher_active 
ON class_schedules(teacher_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_class_schedules_teacher_school 
ON class_schedules(teacher_id, school_id, is_active);

-- Indexes for teacher_reports queries (used in teacher dashboard)
CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_created 
ON teacher_reports(teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_status 
ON teacher_reports(teacher_id, report_status);

-- Indexes for teacher_monthly_attendance queries (used in teacher dashboard)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'teacher_monthly_attendance') THEN
    CREATE INDEX IF NOT EXISTS idx_teacher_monthly_attendance_teacher_month 
    ON teacher_monthly_attendance(teacher_id, month);
  END IF;
END $$;

-- Indexes for teacher_leaves queries (used in teacher dashboard)
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_status 
ON teacher_leaves(teacher_id, status);

CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_dates 
ON teacher_leaves(teacher_id, status, start_date, end_date) 
WHERE status = 'Approved';

-- Indexes for attendance queries (used in student dashboard)
CREATE INDEX IF NOT EXISTS idx_attendance_user_date 
ON attendance(user_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_user_month 
ON attendance(user_id, date, status);

-- Indexes for chapters queries (used in course detail API, student courses API)
CREATE INDEX IF NOT EXISTS idx_chapters_course_published 
ON chapters(course_id, is_published) 
WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_chapters_course_order 
ON chapters(course_id, order_index);

-- Indexes for chapter_contents queries (used in course detail API)
CREATE INDEX IF NOT EXISTS idx_chapter_contents_chapter_order 
ON chapter_contents(chapter_id, order_index);

-- Indexes for videos queries (used in course detail API)
CREATE INDEX IF NOT EXISTS idx_videos_chapter 
ON videos(chapter_id);

-- Indexes for materials queries (used in course detail API)
CREATE INDEX IF NOT EXISTS idx_materials_chapter 
ON materials(chapter_id);

-- Indexes for assignment_questions queries (used in course detail API)
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment_order 
ON assignment_questions(assignment_id, order_index);

-- Indexes for course_access queries (used in course detail API, student courses API)
CREATE INDEX IF NOT EXISTS idx_course_access_course_school 
ON course_access(course_id, school_id, grade);

CREATE INDEX IF NOT EXISTS idx_course_access_school_grade 
ON course_access(school_id, grade);

-- Indexes for course_schedules queries (used in course detail API, student calendar)
CREATE INDEX IF NOT EXISTS idx_course_schedules_course 
ON course_schedules(course_id);

CREATE INDEX IF NOT EXISTS idx_course_schedules_chapter 
ON course_schedules(chapter_id);

-- Indexes for notifications queries (used in notifications API)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
ON notifications(user_id, is_read, created_at DESC);

-- Indexes for student_schools queries (used in student courses API)
CREATE INDEX IF NOT EXISTS idx_student_schools_student_active 
ON student_schools(student_id, is_active) 
WHERE is_active = true;

-- Indexes for teacher_schools queries (used in teacher dashboard)
CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher 
ON teacher_schools(teacher_id, school_id);

-- Add comment to document the purpose of this migration
COMMENT ON INDEX idx_student_courses_student_active IS 'Optimizes student dashboard and courses API queries';
COMMENT ON INDEX idx_enrollments_student_active IS 'Optimizes student enrollment queries';
COMMENT ON INDEX idx_assignments_course_published IS 'Optimizes assignment queries in student dashboard and courses API';
COMMENT ON INDEX idx_submissions_student_assignment IS 'Optimizes submission queries in student dashboard';
COMMENT ON INDEX idx_notification_replies_notification IS 'Optimizes notifications API - fixes N+1 query problem';
COMMENT ON INDEX idx_teacher_classes_teacher IS 'Optimizes teacher dashboard and classes API queries';
COMMENT ON INDEX idx_class_schedules_teacher_active IS 'Optimizes teacher classes API queries';

