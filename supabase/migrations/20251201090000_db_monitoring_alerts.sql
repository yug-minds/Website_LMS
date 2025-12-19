-- Migration: Database Monitoring & Alerting via pg_cron + pg_net
-- Date: 2025-12-01
-- Purpose: Enable DB-native monitoring checks and Slack/webhook alerts without app code changes

-- Ensure required schemas
CREATE SCHEMA IF NOT EXISTS monitoring;
CREATE SCHEMA IF NOT EXISTS private;

-- Enable extensions (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Configuration table to hold alert settings and thresholds
CREATE TABLE IF NOT EXISTS private.monitoring_config (
  id boolean PRIMARY KEY DEFAULT TRUE,
  slack_webhook_url text,
  alert_enabled boolean NOT NULL DEFAULT TRUE,
  connections_threshold integer NOT NULL DEFAULT 120, -- for pool size ~150
  slow_query_avg_ms integer NOT NULL DEFAULT 100,
  very_slow_query_ms integer NOT NULL DEFAULT 500,
  long_txn_seconds integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure exactly one config row exists
INSERT INTO private.monitoring_config (id)
SELECT TRUE
WHERE NOT EXISTS (SELECT 1 FROM private.monitoring_config);

-- Alert event log table (for auditing and dashboards)
CREATE TABLE IF NOT EXISTS monitoring.alert_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL, -- info | warning | critical
  category text NOT NULL, -- e.g., DB Connections, Slow Queries, Long Transactions
  message text NOT NULL,
  details jsonb
);

CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON monitoring.alert_events (created_at DESC);

-- Helper to set webhook URL securely via SQL (no hardcoding in repo)
CREATE OR REPLACE FUNCTION private.set_monitoring_webhook(url text)
RETURNS void LANGUAGE sql AS $$
  UPDATE private.monitoring_config SET slack_webhook_url = url, updated_at = now();
$$;

-- Unified alert posting function (logs locally and posts to webhook if configured)
CREATE OR REPLACE FUNCTION monitoring.post_alert(
  category text,
  severity text,
  message text,
  details jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  headers jsonb;
  payload jsonb;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;

  -- Always persist alert locally
  INSERT INTO monitoring.alert_events (severity, category, message, details)
  VALUES (severity, category, message, details);

  -- If webhook not configured or alerts disabled, stop here
  IF cfg.alert_enabled IS NOT TRUE OR cfg.slack_webhook_url IS NULL OR cfg.slack_webhook_url = '' THEN
    RETURN;
  END IF;

  -- Prepare Slack-compatible payload (simple text message + JSON details)
  headers := jsonb_build_object('Content-Type','application/json');
  payload := jsonb_build_object(
    'text', format('*%s* [%s]: %s', category, severity, message),
    'details', details,
    'timestamp', now()
  );

  -- Send HTTP POST via pg_net (ignore failures to keep cron jobs healthy)
  PERFORM net.http_post(
    cfg.slack_webhook_url,
    headers,
    payload::text
  );
EXCEPTION WHEN others THEN
  -- swallow errors to avoid failing cron
  NULL;
END;
$$;

-- Check: Active connections exceeding threshold
CREATE OR REPLACE FUNCTION monitoring.check_active_connections()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  active_count integer;
  threshold integer;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;
  threshold := cfg.connections_threshold;

  SELECT count(*) INTO active_count
  FROM pg_stat_activity
  WHERE state = 'active';

  IF active_count >= threshold THEN
    PERFORM monitoring.post_alert(
      category := 'DB Connections',
      severity := 'warning',
      message := format('Active connections %s exceeds threshold %s', active_count, threshold),
      details := jsonb_build_object('active_connections', active_count, 'threshold', threshold)
    );
  END IF;
END;
$$;

-- Check: Slow queries based on pg_stat_statements mean_time
CREATE OR REPLACE FUNCTION monitoring.check_slow_queries()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  slow_count integer;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;

  -- Count queries with mean execution time above threshold
  SELECT count(*) INTO slow_count
  FROM pg_stat_statements
  WHERE mean_time > cfg.slow_query_avg_ms;

  IF slow_count > 0 THEN
    PERFORM monitoring.post_alert(
      category := 'Slow Queries',
      severity := 'info',
      message := format('%s queries exceed avg %sms', slow_count, cfg.slow_query_avg_ms),
      details := jsonb_build_object('slow_query_count', slow_count, 'threshold_ms', cfg.slow_query_avg_ms)
    );
  END IF;
END;
$$;

-- Check: Long-running transactions
CREATE OR REPLACE FUNCTION monitoring.check_long_transactions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cfg private.monitoring_config%ROWTYPE;
  long_count integer;
BEGIN
  SELECT * INTO cfg FROM private.monitoring_config LIMIT 1;

  SELECT count(*) INTO long_count
  FROM pg_stat_activity
  WHERE state = 'active' AND xact_start IS NOT NULL
    AND now() - xact_start > make_interval(secs => cfg.long_txn_seconds);

  IF long_count > 0 THEN
    PERFORM monitoring.post_alert(
      category := 'Long Transactions',
      severity := 'warning',
      message := format('%s transactions > %ss', long_count, cfg.long_txn_seconds),
      details := jsonb_build_object('long_txn_count', long_count, 'threshold_seconds', cfg.long_txn_seconds)
    );
  END IF;
END;
$$;

-- Schedule cron jobs idempotently (skip if already scheduled)
DO $$
DECLARE
  v_job_id int;
BEGIN
  -- Active connections every 2 minutes
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_active_connections'
     OR (j.command = 'SELECT monitoring.check_active_connections()' AND j.schedule = '*/2 * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_active_connections', '*/2 * * * *', 'SELECT monitoring.check_active_connections()');
  END IF;

  -- Slow queries every 5 minutes
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_slow_queries'
     OR (j.command = 'SELECT monitoring.check_slow_queries()' AND j.schedule = '*/5 * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_slow_queries', '*/5 * * * *', 'SELECT monitoring.check_slow_queries()');
  END IF;

  -- Long transactions every minute
  SELECT j.jobid INTO v_job_id
  FROM cron.job AS j
  WHERE j.jobname = 'monitoring_check_long_transactions'
     OR (j.command = 'SELECT monitoring.check_long_transactions()' AND j.schedule = '* * * * *')
  LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('monitoring_check_long_transactions', '* * * * *', 'SELECT monitoring.check_long_transactions()');
  END IF;
END$$;

-- Notes:
-- 1) Set your Slack/Webhook URL securely via: SELECT private.set_monitoring_webhook('<your webhook>');
-- 2) Adjust thresholds in private.monitoring_config as needed.
-- 3) Alerts are logged to monitoring.alert_events regardless of webhook configuration.