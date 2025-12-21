-- Drop the handle_leave_approval trigger as attendance marking is now handled in API code
-- This trigger was causing errors when the attendance table doesn't exist or isn't accessible

-- Drop the trigger
DROP TRIGGER IF EXISTS handle_leave_approval_trigger ON teacher_leaves;

-- Drop the function
DROP FUNCTION IF EXISTS handle_leave_approval();

-- Add comment explaining the change
COMMENT ON TABLE teacher_leaves IS 'Teacher leave requests. Attendance marking for approved/rejected leaves is handled in the API layer, not via database triggers.';