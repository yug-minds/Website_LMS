-- ============================================================================
-- Fix notifications table constraints
-- Date: 2025-12-14
-- ============================================================================

-- Fix notifications table type constraint to include 'course_enrollment'
DO $$
BEGIN
  -- Check if notifications table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN
    
    -- Drop existing type constraint
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    -- Add updated type constraint that includes 'course_enrollment'
    ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('general', 'course_enrollment', 'assignment_due', 'grade_posted', 'system_alert', 'achievement'));
    
    RAISE NOTICE 'Fixed notifications table type constraint to include course_enrollment';
  ELSE
    RAISE NOTICE 'Notifications table does not exist - skipping';
  END IF;
END $$;