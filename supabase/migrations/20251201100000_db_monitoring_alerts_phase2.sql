-- Migration: DB Monitoring Alerts Phase 2
-- Date: 2025-12-01
-- Purpose: Add checks for lock waits, deadlocks, storage growth, and very slow queries

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Extend monitoring config with additional thresholds (idempotent)
ALTER TABLE IF EXISTS private.monitoring_config
  ADD COLUMN IF NOT EXISTS lock_wait_count_threshold integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS deadlock_delta_threshold integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS storage_growth_threshold_mb integer NOT NULL DEFAULT 200;

-- State table to keep simple baselines for delta-based checks
CREATE TABLE IF NOT EXISTS monitoring.state (
  id boolean PRIMARY KEY DEFAULT TRUE,
  last_deadlocks bigint NOT NULL DEFAULT 0,
  last_database_size_bytes bigint NOT NULL DEFAULT 0,
  last_stats_reset timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO monitoring.state (id)
SELECT TRUE
WHERE NOT EXISTS (SELECT 1 FROM monitoring.state);

-- Check: Lock waits currently in the system
CREATE OR REPLACE FUNCTION monitoring.check_lock_waits()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  waiting_count integer;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;

  SELECT count(*) INTO waiting_count
  FROM pg_stat_activity
  WHERE wait_event_type = 'Lock';

  IF waiting_count >= cfg.lock_wait_count_threshold THEN
    PERFORM monitoring.post_alert(
      category := 'Lock Waits',
      severity := 'warning',
      message := format('%s sessions waiting on locks (threshold %s)', waiting_count, cfg.lock_wait_count_threshold),
      details := jsonb_build_object('waiting_count', waiting_count, 'threshold', cfg.lock_wait_count_threshold)
    );
  END IF;
END;
$$;

-- Check: Deadlocks since last baseline
CREATE OR REPLACE FUNCTION monitoring.check_deadlocks()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  st monitoring.state%ROWTYPE;
  cur_deadlocks bigint;
  cur_stats_reset timestamptz;
  delta bigint;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;
  SELECT * INTO st FROM monitoring.state LIMIT 1;

  SELECT deadlocks, stats_reset INTO cur_deadlocks, cur_stats_reset
  FROM pg_stat_database
  WHERE datname = current_database();

  -- Reset baseline if Postgres stats were reset
  IF st.last_stats_reset IS NULL OR (cur_stats_reset IS NOT NULL AND cur_stats_reset > st.last_stats_reset) THEN
    UPDATE monitoring.state
      SET last_deadlocks = cur_deadlocks,
          last_stats_reset = cur_stats_reset,
          updated_at = now()
      WHERE id = TRUE;
    RETURN;
  END IF;

  delta := cur_deadlocks - st.last_deadlocks;
  IF delta >= cfg.deadlock_delta_threshold THEN
    PERFORM monitoring.post_alert(
      category := 'Deadlocks',
      severity := 'critical',
      message := format('Deadlocks increased by %s (threshold %s)', delta, cfg.deadlock_delta_threshold),
      details := jsonb_build_object('delta', delta, 'current_deadlocks', cur_deadlocks)
    );
  END IF;

  UPDATE monitoring.state
    SET last_deadlocks = cur_deadlocks,
        updated_at = now()
    WHERE id = TRUE;
END;
$$;

-- Check: Database storage growth compared to last baseline
CREATE OR REPLACE FUNCTION monitoring.check_storage_growth()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  st monitoring.state%ROWTYPE;
  size_bytes bigint;
  growth_mb numeric;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;
  SELECT * INTO st FROM monitoring.state LIMIT 1;

  SELECT pg_database_size(current_database()) INTO size_bytes;

  -- Initialize baseline
  IF st.last_database_size_bytes IS NULL OR st.last_database_size_bytes = 0 THEN
    UPDATE monitoring.state
      SET last_database_size_bytes = size_bytes,
          updated_at = now()
      WHERE id = TRUE;
    RETURN;
  END IF;

  growth_mb := round(((size_bytes - st.last_database_size_bytes) / 1048576.0)::numeric, 2);

  IF growth_mb >= cfg.storage_growth_threshold_mb THEN
    PERFORM monitoring.post_alert(
      category := 'Storage Growth',
      severity := 'warning',
      message := format('Database grew by %s MB (threshold %s MB)', growth_mb, cfg.storage_growth_threshold_mb),
      details := jsonb_build_object(
        'growth_mb', growth_mb,
        'threshold_mb', cfg.storage_growth_threshold_mb,
        'current_size_mb', round((size_bytes / 1048576.0)::numeric, 2)
      )
    );
  END IF;

  UPDATE monitoring.state
    SET last_database_size_bytes = size_bytes,
        updated_at = now()
    WHERE id = TRUE;
END;
$$;

-- Check: Very slow queries snapshot (top 5 by mean_time)
CREATE OR REPLACE FUNCTION monitoring.check_very_slow_queries()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  very_slow_count integer;
  d jsonb;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;

  SELECT count(*) INTO very_slow_count
  FROM pg_stat_statements
  WHERE mean_time > cfg.very_slow_query_ms;

  IF very_slow_count > 0 THEN
    WITH top AS (
      SELECT queryid, calls, rows, round(mean_time::numeric, 2) AS mean_time_ms,
             left(query, 300) AS query
      FROM pg_stat_statements
      WHERE mean_time > cfg.very_slow_query_ms
      ORDER BY mean_time DESC
      LIMIT 5
    )
    SELECT jsonb_agg(to_jsonb(top)) INTO d FROM top;

    PERFORM monitoring.post_alert(
      category := 'Very Slow Queries',
      severity := 'critical',
      message := format('%s queries exceed %sms (showing top 5)', very_slow_count, cfg.very_slow_query_ms),
      details := jsonb_build_object('count', very_slow_count, 'threshold_ms', cfg.very_slow_query_ms, 'samples', d)
    );
  END IF;
END;
$$;

-- Schedule new cron jobs idempotently
DO $$
DECLARE
  v_job_id int;
BEGIN
  -- Lock waits every minute
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_lock_waits'
     OR (j.command = 'SELECT monitoring.check_lock_waits()' AND j.schedule = '* * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_lock_waits', '* * * * *', 'SELECT monitoring.check_lock_waits()');
  END IF;

  -- Deadlocks every 5 minutes
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_deadlocks'
     OR (j.command = 'SELECT monitoring.check_deadlocks()' AND j.schedule = '*/5 * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_deadlocks', '*/5 * * * *', 'SELECT monitoring.check_deadlocks()');
  END IF;

  -- Storage growth hourly
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_storage_growth'
     OR (j.command = 'SELECT monitoring.check_storage_growth()' AND j.schedule = '0 * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_storage_growth', '0 * * * *', 'SELECT monitoring.check_storage_growth()');
  END IF;

  -- Very slow queries every 10 minutes
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_very_slow_queries'
     OR (j.command = 'SELECT monitoring.check_very_slow_queries()' AND j.schedule = '*/10 * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_very_slow_queries', '*/10 * * * *', 'SELECT monitoring.check_very_slow_queries()');
  END IF;
END$$;

-- Notes:
-- Thresholds added: lock waits, deadlocks delta, storage growth MB.
-- pg_stat_statements must be enabled to collect query stats.