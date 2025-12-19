-- ============================================================================
-- Advanced Materialized View Optimizations
-- Created: 2025-12-07
-- Purpose: Incremental refresh, triggers, and monitoring for materialized views
-- ============================================================================

-- ============================================================================
-- 1. Create Table to Track Schools Needing Refresh
-- ============================================================================

-- Table to track which schools need their stats refreshed
CREATE TABLE IF NOT EXISTS mv_school_refresh_queue (
  school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  refreshed_at TIMESTAMP WITH TIME ZONE,
  refresh_count INTEGER DEFAULT 0,
  last_error TEXT,
  CONSTRAINT fk_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_mv_school_refresh_queue_queued 
ON mv_school_refresh_queue(queued_at) 
WHERE refreshed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mv_school_refresh_queue_refreshed 
ON mv_school_refresh_queue(refreshed_at);

-- ============================================================================
-- 2. Function to Queue School for Refresh
-- ============================================================================

CREATE OR REPLACE FUNCTION queue_school_refresh(p_school_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO mv_school_refresh_queue (school_id, queued_at, refresh_count)
  VALUES (p_school_id, NOW(), 0)
  ON CONFLICT (school_id) 
  DO UPDATE SET 
    queued_at = NOW(),
    refreshed_at = NULL,
    refresh_count = mv_school_refresh_queue.refresh_count + 1,
    last_error = NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Incremental Refresh Function (Refresh Only Queued Schools)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_school_admin_stats_incremental()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_school_id UUID;
  v_refreshed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_start_time TIMESTAMP WITH TIME ZONE;
  v_end_time TIMESTAMP WITH TIME ZONE;
BEGIN
  v_start_time := NOW();
  
  -- Process all queued schools
  FOR v_school_id IN 
    SELECT school_id 
    FROM mv_school_refresh_queue 
    WHERE refreshed_at IS NULL 
    ORDER BY queued_at ASC
    LIMIT 100 -- Process max 100 schools per call to avoid timeout
  LOOP
    BEGIN
      -- Refresh this school's stats in materialized view
      -- Delete old row and insert new one
      DELETE FROM mv_school_admin_stats WHERE school_id = v_school_id;
      
      INSERT INTO mv_school_admin_stats (
        school_id,
        total_students,
        total_teachers,
        active_courses,
        pending_reports,
        pending_leaves,
        average_attendance,
        last_updated
      )
      SELECT 
        s.id as school_id,
        (SELECT COUNT(*) FROM student_schools ss WHERE ss.school_id = s.id AND ss.is_active = true) as total_students,
        (SELECT COUNT(*) FROM teacher_schools ts WHERE ts.school_id = s.id) as total_teachers,
        (SELECT COUNT(*) FROM courses c WHERE c.school_id = s.id AND c.status = 'Published') as active_courses,
        (SELECT COUNT(*) FROM teacher_reports tr WHERE tr.school_id = s.id AND tr.approved_by IS NULL) as pending_reports,
        (SELECT COUNT(*) FROM teacher_leaves tl WHERE tl.school_id = s.id AND tl.status = 'Pending') as pending_leaves,
        (SELECT CASE 
           WHEN COUNT(DISTINCT tr.teacher_id) FILTER (WHERE tr.date >= CURRENT_DATE - INTERVAL '30 days') > 0 THEN
             LEAST(100, ROUND((
               COUNT(*) FILTER (WHERE tr.date >= CURRENT_DATE - INTERVAL '30 days')::numeric / 
               (COUNT(DISTINCT tr.teacher_id) FILTER (WHERE tr.date >= CURRENT_DATE - INTERVAL '30 days') * 20::numeric)
             ) * 100))
           ELSE 0
         END
         FROM teacher_reports tr
         WHERE tr.school_id = s.id) as average_attendance,
        NOW() as last_updated
      FROM schools s
      WHERE s.id = v_school_id;
      
      -- Mark as refreshed
      UPDATE mv_school_refresh_queue
      SET refreshed_at = NOW()
      WHERE school_id = v_school_id;
      
      v_refreshed_count := v_refreshed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue processing
      UPDATE mv_school_refresh_queue
      SET last_error = SQLERRM
      WHERE school_id = v_school_id;
      
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  v_end_time := NOW();
  
  -- Return summary
  SELECT json_build_object(
    'refreshed_count', v_refreshed_count,
    'error_count', v_error_count,
    'duration_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'start_time', v_start_time,
    'end_time', v_end_time
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Enhanced Refresh Function with Incremental Support
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_dashboard_views(p_incremental BOOLEAN DEFAULT false)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_admin_refresh_start TIMESTAMP WITH TIME ZONE;
  v_admin_refresh_end TIMESTAMP WITH TIME ZONE;
  v_school_refresh_result JSON;
BEGIN
  v_admin_refresh_start := NOW();
  
  -- Always refresh admin stats (single row, fast)
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_stats;
  
  v_admin_refresh_end := NOW();
  
  -- Refresh school admin stats
  IF p_incremental THEN
    -- Use incremental refresh (only changed schools)
    v_school_refresh_result := refresh_school_admin_stats_incremental();
  ELSE
    -- Full refresh (all schools)
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_school_admin_stats;
    v_school_refresh_result := json_build_object(
      'refreshed_count', (SELECT COUNT(*) FROM mv_school_admin_stats),
      'error_count', 0,
      'duration_ms', EXTRACT(EPOCH FROM (NOW() - v_admin_refresh_end)) * 1000,
      'type', 'full'
    );
  END IF;
  
  -- Return combined result
  SELECT json_build_object(
    'admin_stats', json_build_object(
      'duration_ms', EXTRACT(EPOCH FROM (v_admin_refresh_end - v_admin_refresh_start)) * 1000,
      'status', 'success'
    ),
    'school_admin_stats', v_school_refresh_result,
    'total_duration_ms', EXTRACT(EPOCH FROM (NOW() - v_admin_refresh_start)) * 1000,
    'timestamp', NOW()
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Triggers to Queue Refresh on Data Changes
-- ============================================================================

-- Function to extract school_id and queue refresh
CREATE OR REPLACE FUNCTION trigger_queue_school_refresh()
RETURNS TRIGGER AS $$
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
    RETURN NULL;
  END IF;
  
  -- Queue refresh if school_id is valid and condition is met
  IF v_school_id IS NOT NULL AND v_should_queue THEN
    PERFORM queue_school_refresh(v_school_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for relevant tables
DROP TRIGGER IF EXISTS trigger_queue_refresh_student_schools ON student_schools;
CREATE TRIGGER trigger_queue_refresh_student_schools
  AFTER INSERT OR UPDATE OR DELETE ON student_schools
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_school_refresh();

DROP TRIGGER IF EXISTS trigger_queue_refresh_teacher_schools ON teacher_schools;
CREATE TRIGGER trigger_queue_refresh_teacher_schools
  AFTER INSERT OR UPDATE OR DELETE ON teacher_schools
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_school_refresh();

DROP TRIGGER IF EXISTS trigger_queue_refresh_courses ON courses;
CREATE TRIGGER trigger_queue_refresh_courses
  AFTER INSERT OR UPDATE OR DELETE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_school_refresh();

DROP TRIGGER IF EXISTS trigger_queue_refresh_teacher_reports ON teacher_reports;
CREATE TRIGGER trigger_queue_refresh_teacher_reports
  AFTER INSERT OR UPDATE OR DELETE ON teacher_reports
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_school_refresh();

DROP TRIGGER IF EXISTS trigger_queue_refresh_teacher_leaves ON teacher_leaves;
CREATE TRIGGER trigger_queue_refresh_teacher_leaves
  AFTER INSERT OR UPDATE OR DELETE ON teacher_leaves
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_school_refresh();

-- ============================================================================
-- 6. Monitoring Functions
-- ============================================================================

-- Function to get refresh statistics
CREATE OR REPLACE FUNCTION get_materialized_view_refresh_stats()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_admin_last_refresh TIMESTAMP WITH TIME ZONE;
  v_school_admin_last_refresh TIMESTAMP WITH TIME ZONE;
  v_queued_schools INTEGER;
  v_error_schools INTEGER;
BEGIN
  -- Get last refresh times
  SELECT last_updated INTO v_admin_last_refresh
  FROM mv_admin_stats
  ORDER BY last_updated DESC
  LIMIT 1;
  
  SELECT MAX(last_updated) INTO v_school_admin_last_refresh
  FROM mv_school_admin_stats;
  
  -- Get queue statistics
  SELECT 
    COUNT(*) FILTER (WHERE refreshed_at IS NULL),
    COUNT(*) FILTER (WHERE last_error IS NOT NULL)
  INTO v_queued_schools, v_error_schools
  FROM mv_school_refresh_queue;
  
  -- Build result
  SELECT json_build_object(
    'admin_stats', json_build_object(
      'last_refresh', v_admin_last_refresh,
      'age_seconds', EXTRACT(EPOCH FROM (NOW() - COALESCE(v_admin_last_refresh, NOW())))
    ),
    'school_admin_stats', json_build_object(
      'last_refresh', v_school_admin_last_refresh,
      'age_seconds', EXTRACT(EPOCH FROM (NOW() - COALESCE(v_school_admin_last_refresh, NOW()))),
      'total_schools', (SELECT COUNT(*) FROM mv_school_admin_stats),
      'queued_schools', v_queued_schools,
      'error_schools', v_error_schools
    ),
    'refresh_queue', json_build_object(
      'total_queued', v_queued_schools,
      'total_errors', v_error_schools,
      'oldest_queued', (
        SELECT MIN(queued_at) 
        FROM mv_school_refresh_queue 
        WHERE refreshed_at IS NULL
      )
    ),
    'timestamp', NOW()
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get refresh history
CREATE OR REPLACE FUNCTION get_refresh_history(p_limit INTEGER DEFAULT 50)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'school_id', school_id,
      'queued_at', queued_at,
      'refreshed_at', refreshed_at,
      'refresh_count', refresh_count,
      'last_error', last_error,
      'wait_time_seconds', CASE 
        WHEN refreshed_at IS NOT NULL THEN 
          EXTRACT(EPOCH FROM (refreshed_at - queued_at))
        ELSE 
          EXTRACT(EPOCH FROM (NOW() - queued_at))
      END
    )
    ORDER BY queued_at DESC
  )
  INTO v_result
  FROM mv_school_refresh_queue
  ORDER BY queued_at DESC
  LIMIT p_limit;
  
  RETURN COALESCE(v_result, '[]'::json);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. Update Existing Refresh Status Function
-- ============================================================================

-- Update get_dashboard_refresh_status to include new monitoring data
CREATE OR REPLACE FUNCTION get_dashboard_refresh_status()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_cron_enabled BOOLEAN;
  v_job_exists BOOLEAN;
  v_stats JSON;
BEGIN
  -- Get refresh statistics
  v_stats := get_materialized_view_refresh_stats();
  
  -- Check if pg_cron is enabled
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_cron_enabled;
  
  -- Check if job exists
  IF v_cron_enabled THEN
    SELECT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'refresh-dashboard-views'
    ) INTO v_job_exists;
  ELSE
    v_job_exists := false;
  END IF;
  
  -- Build result with enhanced monitoring
  SELECT json_build_object(
    'cronEnabled', v_cron_enabled,
    'jobScheduled', v_job_exists,
    'refreshInterval', '5 minutes',
    'refreshMode', 'incremental',
    'status', CASE 
      WHEN v_cron_enabled AND v_job_exists THEN 'active'
      WHEN v_cron_enabled AND NOT v_job_exists THEN 'not_scheduled'
      ELSE 'manual_refresh_required'
    END,
    'stats', v_stats
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 8. Grant Permissions
-- ============================================================================

GRANT SELECT ON mv_school_refresh_queue TO authenticated;
GRANT EXECUTE ON FUNCTION queue_school_refresh(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_school_admin_stats_incremental() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_dashboard_views(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_materialized_view_refresh_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_refresh_history(INTEGER) TO authenticated;

-- ============================================================================
-- 9. Comments
-- ============================================================================

COMMENT ON TABLE mv_school_refresh_queue IS 'Tracks which schools need their materialized view stats refreshed. Populated by triggers on data changes.';
COMMENT ON FUNCTION queue_school_refresh(UUID) IS 'Queues a school for incremental refresh of its materialized view stats.';
COMMENT ON FUNCTION refresh_school_admin_stats_incremental() IS 'Incrementally refreshes materialized view stats for queued schools only. More efficient than full refresh.';
COMMENT ON FUNCTION refresh_dashboard_views(BOOLEAN) IS 'Refreshes all dashboard materialized views. If incremental=true, only refreshes queued schools.';
COMMENT ON FUNCTION get_materialized_view_refresh_stats() IS 'Returns statistics about materialized view refresh status, including queue size and error counts.';
COMMENT ON FUNCTION get_refresh_history(INTEGER) IS 'Returns refresh history for materialized views, including queued and refreshed schools.';

