-- Fix handle_leave_approval trigger function
-- This fixes the "aggregate function calls cannot contain set-returning function calls" error

CREATE OR REPLACE FUNCTION handle_leave_approval()
RETURNS TRIGGER AS $$
DECLARE
  leave_date date;
  date_range date[];
BEGIN
  -- Only process if status changed to Approved or Rejected
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('Approved', 'Rejected') THEN
    -- Generate date range for the leave period
    IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL THEN
      -- Fix: Use ARRAY(SELECT ...) instead of array_agg(generate_series(...))
      -- This avoids the "aggregate function calls cannot contain set-returning function calls" error
      SELECT ARRAY(SELECT generate_series(NEW.start_date, NEW.end_date, '1 day'::interval)::date)
      INTO date_range;
      
      -- Insert attendance records for each day in the leave period
      FOREACH leave_date IN ARRAY date_range
      LOOP
        INSERT INTO attendance (user_id, school_id, date, status, recorded_by, recorded_at)
        VALUES (
          NEW.teacher_id,
          NEW.school_id,
          leave_date,
          CASE WHEN NEW.status = 'Approved' THEN 'Leave-Approved' ELSE 'Leave-Rejected' END,
          NEW.reviewed_by,
          NOW()
        )
        ON CONFLICT (user_id, school_id, date)
        DO UPDATE SET 
          status = CASE WHEN NEW.status = 'Approved' THEN 'Leave-Approved' ELSE 'Leave-Rejected' END,
          recorded_by = NEW.reviewed_by,
          recorded_at = NOW();
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'handle_leave_approval_trigger'
  ) THEN
    CREATE TRIGGER handle_leave_approval_trigger 
    AFTER UPDATE ON teacher_leaves
    FOR EACH ROW 
    EXECUTE FUNCTION handle_leave_approval();
  END IF;
END $$;






