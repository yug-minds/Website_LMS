-- Migration: Create distributed caching infrastructure
-- Date: 2025-12-01
-- Description: Adds cache table and functions for distributed caching using Supabase
-- Mirrors the rate limiting pattern for consistency

-- Cache table for distributed caching across all server instances
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_created_at ON cache(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_hit_count ON cache(hit_count DESC);

-- Add comment for documentation
COMMENT ON TABLE cache IS 'Distributed cache storage for application data. Supports TTL-based expiration and automatic cleanup.';
COMMENT ON COLUMN cache.key IS 'Unique cache key identifier';
COMMENT ON COLUMN cache.value IS 'Cached data stored as JSONB for flexibility';
COMMENT ON COLUMN cache.expires_at IS 'Expiration timestamp - entries expire when NOW() > expires_at';
COMMENT ON COLUMN cache.hit_count IS 'Number of times this cache entry has been accessed';

-- Function: Get value from cache (read-only operation)
CREATE OR REPLACE FUNCTION get_from_cache(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value JSONB;
  v_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get cache entry
  SELECT value, expires_at 
  INTO v_value, v_expires_at
  FROM cache 
  WHERE key = p_key;

  -- If found and not expired
  IF FOUND AND v_expires_at > v_now THEN
    -- Increment hit count asynchronously (best effort)
    UPDATE cache 
    SET hit_count = hit_count + 1 
    WHERE key = p_key;
    
    RETURN v_value;
  END IF;

  -- Return NULL if not found or expired
  RETURN NULL;
END;
$$;

-- Function: Set cache value
CREATE OR REPLACE FUNCTION set_cache(
  p_key TEXT,
  p_value JSONB,
  p_ttl_seconds INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update cache entry
  INSERT INTO cache (key, value, expires_at)
  VALUES (p_key, p_value, NOW() + (p_ttl_seconds * INTERVAL '1 second'))
  ON CONFLICT (key) DO UPDATE
  SET 
    value = EXCLUDED.value,
    expires_at = EXCLUDED.expires_at,
    created_at = NOW(),
    hit_count = 0;  -- Reset hit count on cache refresh
END;
$$;

-- Function: Get or set cache (atomic operation)
CREATE OR REPLACE FUNCTION get_or_set_cache(
  p_key TEXT,
  p_value JSONB,
  p_ttl_seconds INTEGER
)
RETURNS TABLE (
  value JSONB,
  hit BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Try to get existing entry
  SELECT c.value, c.expires_at
  INTO v_entry
  FROM cache c
  WHERE c.key = p_key;

  -- If found and not expired (cache hit)
  IF FOUND AND v_entry.expires_at > v_now THEN
    -- Increment hit count
    UPDATE cache 
    SET hit_count = hit_count + 1 
    WHERE key = p_key;
    
    -- Return cached value
    RETURN QUERY SELECT v_entry.value, TRUE;
  ELSE
    -- Cache miss - insert or update with new value
    INSERT INTO cache (key, value, expires_at)
    VALUES (p_key, p_value, v_now + (p_ttl_seconds * INTERVAL '1 second'))
    ON CONFLICT (key) DO UPDATE
    SET 
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW(),
      hit_count = 0;
    
    -- Return new value
    RETURN QUERY SELECT p_value, FALSE;
  END IF;
END;
$$;

-- Function: Invalidate single cache entry
CREATE OR REPLACE FUNCTION invalidate_cache(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM cache WHERE key = p_key;
END;
$$;

-- Function: Invalidate cache entries by pattern (SQL LIKE syntax)
CREATE OR REPLACE FUNCTION invalidate_cache_pattern(p_pattern TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete matching entries and return count
  DELETE FROM cache 
  WHERE key LIKE p_pattern;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- Function: Cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete all expired entries
  DELETE FROM cache 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- Function: Clear all cache entries
CREATE OR REPLACE FUNCTION clear_all_cache()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE cache;
END;
$$;

-- Function: Get cache statistics
CREATE OR REPLACE FUNCTION get_cache_stats()
RETURNS TABLE (
  total_entries BIGINT,
  expired_entries BIGINT,
  active_entries BIGINT,
  total_hits BIGINT,
  avg_hits_per_entry NUMERIC,
  total_size_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_entries,
    COUNT(*) FILTER (WHERE expires_at < NOW())::BIGINT as expired_entries,
    COUNT(*) FILTER (WHERE expires_at >= NOW())::BIGINT as active_entries,
    COALESCE(SUM(hit_count), 0)::BIGINT as total_hits,
    COALESCE(AVG(hit_count), 0)::NUMERIC as avg_hits_per_entry,
    COALESCE(pg_total_relation_size('cache'), 0)::BIGINT as total_size_bytes
  FROM cache;
END;
$$;

-- Grant permissions to service_role (used by server-side code)
GRANT SELECT, INSERT, UPDATE, DELETE ON cache TO service_role;
GRANT EXECUTE ON FUNCTION get_from_cache(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION set_cache(TEXT, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_or_set_cache(TEXT, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION invalidate_cache(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION invalidate_cache_pattern(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_cache() TO service_role;
GRANT EXECUTE ON FUNCTION clear_all_cache() TO service_role;
GRANT EXECUTE ON FUNCTION get_cache_stats() TO service_role;

-- Enable RLS (Row Level Security)
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role has full access
CREATE POLICY "Service role has full access to cache"
  ON cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON FUNCTION get_from_cache(TEXT) IS 'Get cached value by key. Returns NULL if not found or expired. Increments hit count.';
COMMENT ON FUNCTION set_cache(TEXT, JSONB, INTEGER) IS 'Set cache value with TTL in seconds. Overwrites existing entry.';
COMMENT ON FUNCTION get_or_set_cache(TEXT, JSONB, INTEGER) IS 'Atomic get-or-set operation. Returns (value, hit) tuple.';
COMMENT ON FUNCTION invalidate_cache(TEXT) IS 'Delete single cache entry by key.';
COMMENT ON FUNCTION invalidate_cache_pattern(TEXT) IS 'Delete cache entries matching SQL LIKE pattern. Returns count deleted.';
COMMENT ON FUNCTION cleanup_expired_cache() IS 'Delete all expired cache entries. Returns count deleted. Should be called periodically via cron.';
COMMENT ON FUNCTION clear_all_cache() IS 'Truncate entire cache table. Use with caution.';
COMMENT ON FUNCTION get_cache_stats() IS 'Get cache statistics including hit counts and size metrics.';
