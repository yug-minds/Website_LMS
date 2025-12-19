-- Drop the auto_mark_attendance trigger as attendance marking is now handled in API code
-- This trigger was causing errors when the attendance table doesn't exist or isn't accessible

-- Drop the trigger
DROP TRIGGER IF EXISTS auto_mark_attendance_trigger ON teacher_reports;

-- Drop the function
DROP FUNCTION IF EXISTS auto_mark_attendance_on_report();

-- Add comment explaining the change
COMMENT ON TABLE teacher_reports IS 'Teacher daily reports. Attendance marking is handled in the API layer, not via database triggers.';
