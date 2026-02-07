-- ==========================================================
-- Migration: Fix Extensions in Public Schema and Materialized View Access
-- Date: 2025-12-20
-- Purpose: 
--   1. Move extensions from public schema to extensions schema (where possible)
--   2. Restrict access to materialized views to prevent unauthorized API access
-- ==========================================================

-- ============================================================================
-- PART 1: Handle Extensions in Public Schema
-- ============================================================================
-- Note: Extensions cannot be easily moved after creation without dropping and recreating.
-- This requires downtime and may break existing code that references them.
-- 
-- For now, we'll:
-- 1. Create extensions schema for future use
-- 2. Document the issue
-- 3. Future migrations should create extensions in extensions schema
--
-- To fully fix existing extensions (requires maintenance window):
--   1. Drop extension: DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
--   2. Recreate: CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
--   3. Repeat for pg_net
--   4. Update all code that uses these extensions

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Note: Extensions pg_net and uuid-ossp remain in public schema
-- This is a known security warning but moving them requires downtime
-- See documentation in docs/EXTENSION_SECURITY.md for migration steps

-- ============================================================================
-- PART 2: Restrict Materialized View Access
-- ============================================================================
-- Materialized views should not be directly accessible via PostgREST API
-- They contain sensitive aggregated data and should only be accessed via
-- authorized API endpoints using service_role, not directly by clients

-- Revoke all access from public roles (anon, authenticated, public)
-- This prevents direct PostgREST API access to these views
REVOKE ALL ON public.mv_admin_stats FROM anon, authenticated, public;
REVOKE ALL ON public.mv_school_admin_stats FROM anon, authenticated, public;
REVOKE ALL ON public.mv_admin_analytics FROM anon, authenticated, public;

-- Grant access only to service_role (for server-side API access)
-- API routes should use supabaseAdmin client (service_role) to access these views
-- This ensures proper authorization checks are performed in the API layer
GRANT SELECT ON public.mv_admin_stats TO service_role;
GRANT SELECT ON public.mv_school_admin_stats TO service_role;
GRANT SELECT ON public.mv_admin_analytics TO service_role;

-- Note: 
-- - API routes at /api/admin/stats, /api/school-admin/stats, /api/admin/analytics
--   should use supabaseAdmin (service_role) to access these views
-- - Direct client access via PostgREST is now blocked
-- - If you need authenticated users to access these views, create wrapper functions
--   with proper authorization checks instead of granting direct access

COMMENT ON MATERIALIZED VIEW public.mv_admin_stats IS 
'Pre-computed admin statistics. Access restricted - use via API endpoints with proper authorization, not directly via PostgREST.';

COMMENT ON MATERIALIZED VIEW public.mv_school_admin_stats IS 
'Pre-computed school admin statistics. Access restricted - use via API endpoints with proper authorization, not directly via PostgREST.';

COMMENT ON MATERIALIZED VIEW public.mv_admin_analytics IS 
'Pre-computed admin analytics. Access restricted - use via API endpoints with proper authorization, not directly via PostgREST.';

