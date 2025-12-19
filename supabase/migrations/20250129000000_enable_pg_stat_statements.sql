-- Enable pg_stat_statements extension for query performance monitoring
-- This extension tracks execution statistics for all SQL statements executed by a server
-- 
-- Usage:
-- 1. After enabling, wait 24-48 hours for data collection
-- 2. Query pg_stat_statements to identify slow queries
-- 3. Use EXPLAIN ANALYZE on slow queries to optimize them
--
-- Reference: https://www.postgresql.org/docs/current/pgstatstatements.html

-- Enable the extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
  ) THEN
    RAISE EXCEPTION 'Failed to enable pg_stat_statements extension';
  END IF;
  
  RAISE NOTICE 'pg_stat_statements extension enabled successfully';
END $$;

-- Optional: Configure pg_stat_statements settings (if you have superuser access)
-- Note: These settings may require superuser privileges
-- Uncomment if you have access and want to customize tracking

-- Set maximum number of distinct statements to track (default: 5000)
-- ALTER SYSTEM SET pg_stat_statements.max = 10000;

-- Set maximum length of query string to track (default: 1024)
-- ALTER SYSTEM SET pg_stat_statements.track = 'all';  -- Track all statements
-- ALTER SYSTEM SET pg_stat_statements.track_utility = 'on';  -- Track utility commands

-- Note: After changing these settings, you may need to restart PostgreSQL
-- or reload the configuration: SELECT pg_reload_conf();










