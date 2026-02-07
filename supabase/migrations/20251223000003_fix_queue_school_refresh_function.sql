-- =======================================================================
-- Fix queue_school_refresh Function
-- 
-- Date: 2025-12-23
-- Purpose: Ensure queue_school_refresh function exists for triggers
-- =======================================================================

-- Create the table if it doesn't exist (for tracking refresh queue)
CREATE TABLE IF NOT EXISTS mv_school_refresh_queue (
  school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  refreshed_at TIMESTAMP WITH TIME ZONE,
  refresh_count INTEGER DEFAULT 0,
  last_error TEXT,
  CONSTRAINT fk_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_mv_school_refresh_queue_queued 
ON mv_school_refresh_queue(queued_at) 
WHERE refreshed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mv_school_refresh_queue_refreshed 
ON mv_school_refresh_queue(refreshed_at);

-- Create or replace the queue_school_refresh function
CREATE OR REPLACE FUNCTION queue_school_refresh(p_school_id UUID)
RETURNS void 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only queue if school_id is valid
  IF p_school_id IS NOT NULL THEN
    INSERT INTO mv_school_refresh_queue (school_id, queued_at, refresh_count)
    VALUES (p_school_id, NOW(), 0)
    ON CONFLICT (school_id) 
    DO UPDATE SET 
      queued_at = NOW(),
      refreshed_at = NULL,
      refresh_count = mv_school_refresh_queue.refresh_count + 1,
      last_error = NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION queue_school_refresh(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_school_refresh(UUID) TO service_role;

-- Add comment
COMMENT ON FUNCTION queue_school_refresh(UUID) IS 
'Queues a school for incremental refresh of its materialized view stats.';

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION trigger_queue_school_refresh()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_school_id UUID;
  v_should_queue BOOLEAN := true;
BEGIN
  -- Determine school_id based on table
  IF TG_TABLE_NAME = 'student_schools' THEN
    v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  ELSIF TG_TABLE_NAME = 'teacher_schools' THEN
    v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  ELSIF TG_TABLE_NAME = 'courses' THEN
    v_school_id := COALESCE(NEW.school_id, OLD.school_id);
    -- For courses, only queue if status is or was 'Published'
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      v_should_queue := (NEW.status = 'Published');
    ELSIF TG_OP = 'DELETE' THEN
      v_should_queue := (OLD.status = 'Published');
    END IF;
  ELSIF TG_TABLE_NAME = 'teacher_reports' THEN
    v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  ELSIF TG_TABLE_NAME = 'teacher_leaves' THEN
    v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Queue refresh if school_id is valid and condition is met
  IF v_school_id IS NOT NULL AND v_should_queue THEN
    BEGIN
      PERFORM queue_school_refresh(v_school_id);
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to queue school refresh for school_id %: %', v_school_id, SQLERRM;
    END;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists on student_schools
DROP TRIGGER IF EXISTS trigger_queue_refresh_student_schools ON student_schools;
CREATE TRIGGER trigger_queue_refresh_student_schools
  AFTER INSERT OR UPDATE OR DELETE ON student_schools
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_school_refresh();




