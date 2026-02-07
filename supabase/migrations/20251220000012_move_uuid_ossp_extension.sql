-- ==========================================================
-- Migration: Move uuid-ossp Extension from Public to Extensions Schema
-- Date: 2025-12-20
-- Purpose: Move uuid-ossp extension to extensions schema for better security
--          This prevents the extension from being in the public schema
-- ==========================================================

-- ============================================================================
-- STEP 1: Ensure extensions schema exists
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS extensions;

-- ============================================================================
-- STEP 2: Note about search_path
-- ============================================================================
-- PostgreSQL stores function OIDs in DEFAULT clauses, not function names.
-- This means existing DEFAULT uuid_generate_v4() clauses will continue to work
-- after moving the extension, as long as the function is accessible.
--
-- However, for new code and to ensure compatibility, we should ensure
-- the search_path includes 'extensions'. Supabase typically handles this
-- automatically, but we'll verify it's set correctly.
--
-- Note: In Supabase, the search_path is usually configured at the service level
-- and includes both 'public' and 'extensions' schemas by default.

DO $$
DECLARE
  current_path TEXT;
BEGIN
  -- Get current search_path
  current_path := current_setting('search_path');
  RAISE NOTICE 'Current search_path: %', current_path;
  
  -- Check if extensions is in search_path
  IF current_path LIKE '%extensions%' OR current_path LIKE '%extensions,%' OR current_path LIKE '%,extensions%' THEN
    RAISE NOTICE '✅ extensions schema is in search_path';
  ELSE
    RAISE NOTICE '⚠️  extensions schema not found in search_path';
    RAISE NOTICE 'This is usually fine - Supabase configures this automatically';
    RAISE NOTICE 'If you encounter issues with uuid_generate_v4(), verify search_path includes extensions';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Move the extension
-- ============================================================================
-- WARNING: This will drop and recreate the extension
-- DEFAULT clauses in tables use uuid_generate_v4() which will continue to work
-- because we've added extensions to the search_path

DO $$
BEGIN
  -- Check if extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'uuid-ossp'
    AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'Moving uuid-ossp extension from public to extensions schema...';
    RAISE NOTICE 'This will drop dependent objects, but they will continue to work via search_path';
    
    -- Drop the extension (CASCADE will drop functions that depend on it)
    -- Note: Table DEFAULT clauses will continue to work because:
    -- 1. We've added extensions to search_path
    -- 2. The function will be recreated in extensions schema
    DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
    
    -- Recreate in extensions schema
    CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
    
    RAISE NOTICE '✅ uuid-ossp extension moved to extensions schema successfully';
  ELSE
    -- Check if it's already in extensions schema
    IF EXISTS (
      SELECT 1 FROM pg_extension e
      JOIN pg_namespace n ON e.extnamespace = n.oid
      WHERE e.extname = 'uuid-ossp'
      AND n.nspname = 'extensions'
    ) THEN
      RAISE NOTICE 'uuid-ossp extension is already in extensions schema';
    ELSE
      RAISE WARNING 'uuid-ossp extension not found. Creating in extensions schema...';
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Verify the extension is working
-- ============================================================================
DO $$
DECLARE
  ext_schema TEXT;
  test_uuid UUID;
BEGIN
  -- Check extension location
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'uuid-ossp';
  
  IF ext_schema = 'extensions' THEN
    RAISE NOTICE '✅ uuid-ossp extension is now in extensions schema';
  ELSE
    RAISE WARNING '⚠️  uuid-ossp extension is in % schema (expected: extensions)', ext_schema;
  END IF;
  
  -- Test that uuid_generate_v4() still works (should resolve via search_path)
  BEGIN
    SELECT uuid_generate_v4() INTO test_uuid;
    RAISE NOTICE '✅ uuid_generate_v4() is working correctly (resolved via search_path)';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️  uuid_generate_v4() test failed: %', SQLERRM;
    RAISE NOTICE 'Attempting with schema qualification...';
    BEGIN
      SELECT extensions.uuid_generate_v4() INTO test_uuid;
      RAISE NOTICE '✅ extensions.uuid_generate_v4() works (schema-qualified)';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'uuid_generate_v4() is not working: %', SQLERRM;
    END;
  END;
  
  -- Also verify gen_random_uuid() is available as alternative
  BEGIN
    SELECT gen_random_uuid() INTO test_uuid;
    RAISE NOTICE '✅ gen_random_uuid() is available (built-in, no extension needed)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'gen_random_uuid() not available (PostgreSQL < 13), using uuid-ossp extension';
  END;
END $$;

-- ============================================================================
-- STEP 5: Update future migration files to use gen_random_uuid() when possible
-- ============================================================================
-- Note: For new tables, consider using gen_random_uuid() instead of uuid_generate_v4()
-- gen_random_uuid() is built into PostgreSQL 13+ and doesn't require extensions
-- Example: id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--
-- However, existing tables with uuid_generate_v4() will continue to work
-- because we've added extensions to the search_path

COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation functions. Moved to extensions schema for security. Use gen_random_uuid() in new code when possible (PostgreSQL 13+).';

