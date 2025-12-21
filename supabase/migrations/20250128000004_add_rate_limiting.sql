-- Migration: Add database-backed rate limiting
-- This replaces in-memory rate limiting with Supabase PostgreSQL backend
-- Date: 2025-01-28

-- Create rate_limits table to track request counts
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier text NOT NULL,  -- IP address or user ID
  endpoint text NOT NULL DEFAULT '',  -- Endpoint (empty string for global rate limiting)
  window_seconds integer NOT NULL,
  count integer DEFAULT 1,
  reset_time timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  -- Unique constraint: one record per identifier+endpoint+window
  UNIQUE(identifier, endpoint, window_seconds)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
  ON rate_limits(identifier, endpoint, window_seconds, reset_time);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time 
  ON rate_limits(reset_time);

-- Enable RLS (optional - can disable for performance)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (for API routes)
-- This allows API routes using supabaseAdmin to manage rate limits
-- Drop policy if it exists (in case migration was partially applied)
DROP POLICY IF EXISTS "Service role can manage rate limits" ON rate_limits;

-- Create policy (idempotent - will only create if doesn't exist after DROP)
CREATE POLICY "Service role can manage rate limits" ON rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Function to atomically increment and check rate limit
-- This function handles the entire rate limit check in a single atomic operation
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,
  p_max_requests integer,
  p_window_seconds integer,
  p_endpoint text DEFAULT NULL
)
RETURNS TABLE(
  allowed boolean,
  current_count integer,
  reset_time timestamp with time zone,
  remaining integer
) AS $$
DECLARE
  v_now timestamp with time zone := now();
  v_reset_time timestamp with time zone;
  v_count integer;
  v_endpoint_key text;
BEGIN
  -- Normalize endpoint key (use empty string for NULL)
  v_endpoint_key := COALESCE(p_endpoint, '');
  
  -- Calculate reset time
  v_reset_time := v_now + (p_window_seconds || ' seconds')::interval;
  
  -- Upsert: Insert or update existing record
  INSERT INTO rate_limits (identifier, endpoint, window_seconds, count, reset_time)
  VALUES (p_identifier, v_endpoint_key, p_window_seconds, 1, v_reset_time)
  ON CONFLICT (identifier, endpoint, window_seconds) 
    DO UPDATE SET
    -- Reset if window expired
    count = CASE 
      WHEN rate_limits.reset_time < v_now THEN 1
      ELSE rate_limits.count + 1
    END,
    reset_time = CASE
      WHEN rate_limits.reset_time < v_now THEN v_reset_time
      ELSE rate_limits.reset_time
    END,
    updated_at = v_now
  RETURNING count, reset_time INTO v_count, v_reset_time;
  
  -- Return result
  RETURN QUERY SELECT
    v_count <= p_max_requests as allowed,
    v_count as current_count,
    v_reset_time as reset_time,
    GREATEST(0, p_max_requests - v_count) as remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired entries (run periodically)
-- This should be called via cron or scheduled function to prevent table bloat
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- Delete entries that expired more than 1 hour ago
  DELETE FROM rate_limits
  WHERE reset_time < now() - interval '1 hour';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to table
COMMENT ON TABLE rate_limits IS 'Stores rate limit counters for distributed rate limiting across multiple server instances';
COMMENT ON FUNCTION check_rate_limit IS 'Atomically checks and increments rate limit counter, returns whether request is allowed';
COMMENT ON FUNCTION cleanup_expired_rate_limits IS 'Removes expired rate limit entries older than 1 hour';

