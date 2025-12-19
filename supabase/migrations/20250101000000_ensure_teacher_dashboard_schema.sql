-- Migration to ensure all teacher dashboard tables and views match the specification
-- This migration ensures all required fields, constraints, and views exist

-- 1. Ensure teacher_schools table has correct structure
DO $$
BEGIN
  -- Ensure assigned_on column exists (or use assigned_at if it exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teacher_schools' AND column_name = 'assigned_on'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'teacher_schools' AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE teacher_schools ADD COLUMN IF NOT EXISTS assigned_on timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Ensure teacher_reports table has all required fields
ALTER TABLE teacher_reports 
ADD COLUMN IF NOT EXISTS topics_taught text,
ADD COLUMN IF NOT EXISTS activities text,
ADD COLUMN IF NOT EXISTS notes text;

-- Ensure report_status constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'teacher_reports_report_status_check'
  ) THEN
    ALTER TABLE teacher_reports 
    ADD CONSTRAINT teacher_reports_report_status_check 
    CHECK (report_status IN ('Submitted', 'Approved', 'Flagged'));
  END IF;
END $$;

-- 3. Ensure teacher_leaves table has all required fields with correct constraints
DO $$
BEGIN
  -- Ensure status constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'teacher_leaves_status_check'
  ) THEN
    ALTER TABLE teacher_leaves 
    ADD CONSTRAINT teacher_leaves_status_check 
    CHECK (status IN ('Pending', 'Approved', 'Rejected'));
  END IF;
END $$;

-- Ensure reason column exists
ALTER TABLE teacher_leaves ADD COLUMN IF NOT EXISTS reason text;

-- 4. Ensure attendance table has correct structure
DO $$
BEGIN
  -- Ensure status constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'attendance_status_check'
  ) THEN
    ALTER TABLE attendance 
    ADD CONSTRAINT attendance_status_check 
    CHECK (status IN ('Present', 'Absent', 'Leave-Approved', 'Leave-Rejected', 'Unreported'));
  END IF;
END $$;

-- 5. Recreate teacher_monthly_attendance view to ensure it matches spec
CREATE OR REPLACE VIEW teacher_monthly_attendance AS
SELECT 
  user_id AS teacher_id, 
  school_id, 
  date_trunc('month', date) AS month, 
  SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_count,
  SUM(CASE WHEN status LIKE 'Leave-%' THEN 1 ELSE 0 END) AS leave_count,
  SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
  SUM(CASE WHEN status = 'Unreported' THEN 1 ELSE 0 END) AS unreported_count,
  COUNT(*) AS total_days
FROM attendance
WHERE user_id IN (
  SELECT id FROM profiles WHERE role = 'teacher'
)
GROUP BY user_id, school_id, date_trunc('month', date);

-- 6. Ensure triggers exist for auto-marking attendance
-- Check if trigger exists, if not create it

-- Ensure auto_mark_attendance_on_report function exists
CREATE OR REPLACE FUNCTION auto_mark_attendance_on_report()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a new report submission
  IF TG_OP = 'INSERT' THEN
    -- Insert or update attendance record for the teacher
    INSERT INTO attendance (user_id, school_id, class_id, date, status, recorded_by, recorded_at)
    VALUES (
      NEW.teacher_id, 
      NEW.school_id, 
      NEW.class_id, 
      NEW.date, 
      'Present', 
      NEW.teacher_id, 
      NOW()
    )
    ON CONFLICT (user_id, school_id, date) 
    DO UPDATE SET 
      status = CASE 
        WHEN attendance.status IN ('Leave-Approved', 'Leave-Rejected') THEN attendance.status
        ELSE 'Present'
      END,
      recorded_by = NEW.teacher_id,
      recorded_at = NOW(),
      class_id = COALESCE(NEW.class_id, attendance.class_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'auto_mark_attendance_trigger'
  ) THEN
    CREATE TRIGGER auto_mark_attendance_trigger 
    AFTER INSERT ON teacher_reports
    FOR EACH ROW 
    EXECUTE FUNCTION auto_mark_attendance_on_report();
  END IF;
END $$;

-- 7. Ensure leave approval trigger exists

-- Ensure handle_leave_approval function exists
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

-- 8. Add RLS policies for teachers to manage their own reports and leaves
DO $$
BEGIN
  -- RLS for teacher_reports
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_reports' 
    AND policyname = 'Teachers can manage their own reports'
  ) THEN
    CREATE POLICY "Teachers can manage their own reports" ON teacher_reports
    FOR ALL USING (teacher_id = auth.uid());
  END IF;

  -- RLS for teacher_leaves
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_leaves' 
    AND policyname = 'Teachers can manage their own leaves'
  ) THEN
    CREATE POLICY "Teachers can manage their own leaves" ON teacher_leaves
    FOR ALL USING (teacher_id = auth.uid());
  END IF;

  -- RLS for attendance - teachers can manage their own
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' 
    AND policyname = 'Teachers can manage their own attendance'
  ) THEN
    CREATE POLICY "Teachers can manage their own attendance" ON attendance
    FOR ALL USING (user_id = auth.uid());
  END IF;

  -- RLS for teacher_schools - teachers can view their assignments
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_schools' 
    AND policyname = 'Teachers can view their school assignments'
  ) THEN
    CREATE POLICY "Teachers can view their school assignments" ON teacher_schools
    FOR SELECT USING (teacher_id = auth.uid());
  END IF;

  -- RLS for teacher_classes - teachers can view their class assignments
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'teacher_classes' 
    AND policyname = 'Teachers can view their class assignments'
  ) THEN
    CREATE POLICY "Teachers can view their class assignments" ON teacher_classes
    FOR SELECT USING (teacher_id = auth.uid());
  END IF;
END $$;

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_teacher_reports_teacher_date ON teacher_reports(teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_teacher_leaves_teacher_status ON teacher_leaves(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher_id ON teacher_schools(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_id ON teacher_classes(teacher_id);
-- Note: Cannot create index with date_trunc directly, but monthly attendance view handles aggregation efficiently
CREATE INDEX IF NOT EXISTS idx_attendance_user_school_date ON attendance(user_id, school_id, date);

COMMENT ON VIEW teacher_monthly_attendance IS 'Monthly attendance aggregation for teachers showing present/absent/leave counts per month per school';
COMMENT ON FUNCTION auto_mark_attendance_on_report() IS 'Automatically marks teacher attendance as Present when a daily report is submitted';
COMMENT ON FUNCTION handle_leave_approval() IS 'Creates attendance records for leave periods when leave is approved or rejected by school admin';

