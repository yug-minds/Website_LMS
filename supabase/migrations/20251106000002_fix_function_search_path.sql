-- Fix Function Search Path Mutable Security Warnings
-- This migration sets search_path = '' for all functions to prevent search path injection attacks
-- Created: 2025-11-06
-- Purpose: Secure all database functions by setting immutable search_path

-- Fix search_path for all functions that have mutable search_path
-- This prevents search path injection attacks by ensuring functions use fully qualified names

-- 1. calculate_leave_days
ALTER FUNCTION public.calculate_leave_days() SET search_path = '';

-- 2. handle_leave_approval
ALTER FUNCTION public.handle_leave_approval() SET search_path = '';

-- 3. generate_grade_join_code (overload 1)
ALTER FUNCTION public.generate_grade_join_code(school_id_param uuid, grade_param text) SET search_path = '';

-- 3b. generate_grade_join_code (overload 2)
ALTER FUNCTION public.generate_grade_join_code(school_id_param uuid, grade_param text, manual_code text, usage_type_param text, max_uses_param integer) SET search_path = '';

-- 4. update_student_classes_updated_at
ALTER FUNCTION public.update_student_classes_updated_at() SET search_path = '';

-- 5. update_assignment_questions_updated_at
ALTER FUNCTION public.update_assignment_questions_updated_at() SET search_path = '';

-- 6. is_admin_user
ALTER FUNCTION public.is_admin_user() SET search_path = '';

-- 7. update_course_access_updated_at
ALTER FUNCTION public.update_course_access_updated_at() SET search_path = '';

-- 8. update_updated_at_column
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

-- 9. update_teacher_attendance_updated_at
ALTER FUNCTION public.update_teacher_attendance_updated_at() SET search_path = '';

-- 10. sync_chapters_name_columns
ALTER FUNCTION public.sync_chapters_name_columns() SET search_path = '';

-- 11. update_class_scheduling_updated_at
ALTER FUNCTION public.update_class_scheduling_updated_at() SET search_path = '';

-- 12. increment_join_code_usage
ALTER FUNCTION public.increment_join_code_usage(code_param text) SET search_path = '';

-- 13. generate_teacher_id
ALTER FUNCTION public.generate_teacher_id() SET search_path = '';

-- 14. auto_grade_mcq_submission
ALTER FUNCTION public.auto_grade_mcq_submission() SET search_path = '';

-- 15. generate_school_grade_codes (overload 1)
ALTER FUNCTION public.generate_school_grade_codes(school_id_param uuid, grades_array text[]) SET search_path = '';

-- 15b. generate_school_grade_codes (overload 2)
ALTER FUNCTION public.generate_school_grade_codes(school_id_param uuid, grades_array text[], manual_codes jsonb, usage_type_param text, max_uses_param integer) SET search_path = '';

-- 16. handle_new_user
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- 17. update_course_schedules_updated_at
ALTER FUNCTION public.update_course_schedules_updated_at() SET search_path = '';

-- 18. generate_join_code
ALTER FUNCTION public.generate_join_code() SET search_path = '';

-- 19. update_student_tables_updated_at
ALTER FUNCTION public.update_student_tables_updated_at() SET search_path = '';

-- 20. apply_time_columns_fix (skip if function doesn't exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'apply_time_columns_fix') THEN
        ALTER FUNCTION public.apply_time_columns_fix() SET search_path = '';
    END IF;
END $$;

-- 21. update_student_progress
ALTER FUNCTION public.update_student_progress() SET search_path = '';

-- 22. update_videos_updated_at
ALTER FUNCTION public.update_videos_updated_at() SET search_path = '';

-- 23. get_user_school_id
ALTER FUNCTION public.get_user_school_id() SET search_path = '';

-- 24. generate_school_admin_password
ALTER FUNCTION public.generate_school_admin_password() SET search_path = '';

-- 25. update_materials_updated_at
ALTER FUNCTION public.update_materials_updated_at() SET search_path = '';

-- 26. update_teacher_reports_updated_at
ALTER FUNCTION public.update_teacher_reports_updated_at() SET search_path = '';

-- 27. toggle_joining_code_status
ALTER FUNCTION public.toggle_joining_code_status(code_param text, activate_param boolean) SET search_path = '';

-- 28. generate_school_code
ALTER FUNCTION public.generate_school_code() SET search_path = '';

-- 29. deactivate_joining_code
ALTER FUNCTION public.deactivate_joining_code(code_param text) SET search_path = '';

-- 30. update_school_admins_updated_at
ALTER FUNCTION public.update_school_admins_updated_at() SET search_path = '';

-- 31. update_course_progress_updated_at
ALTER FUNCTION public.update_course_progress_updated_at() SET search_path = '';

-- 32. update_teachers_updated_at
ALTER FUNCTION public.update_teachers_updated_at() SET search_path = '';

-- 33. sync_chapters_order_columns
ALTER FUNCTION public.sync_chapters_order_columns() SET search_path = '';

-- 34. validate_joining_code
ALTER FUNCTION public.validate_joining_code(join_code_param text) SET search_path = '';

-- 35. auto_mark_attendance_on_report
ALTER FUNCTION public.auto_mark_attendance_on_report() SET search_path = '';

-- Note: Some functions may need to be updated to use fully qualified schema names
-- (e.g., public.table_name instead of just table_name) if they reference tables
-- This migration only sets the search_path; function bodies should already use
-- fully qualified names or be updated separately if needed

