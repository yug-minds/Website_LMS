-- Migration: Remove Custom Session Management
-- Date: 2025-01-27
-- Description: Remove user_sessions table and related functions as we're using Supabase sessions only

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_invalidate_other_sessions ON user_sessions;

-- Drop functions
DROP FUNCTION IF EXISTS invalidate_other_sessions();
DROP FUNCTION IF EXISTS cleanup_expired_sessions();

-- Drop indexes
DROP INDEX IF EXISTS idx_user_sessions_user_id;
DROP INDEX IF EXISTS idx_user_sessions_token;
DROP INDEX IF EXISTS idx_user_sessions_active;
DROP INDEX IF EXISTS idx_user_sessions_one_active_per_user;

-- Drop the user_sessions table
DROP TABLE IF EXISTS user_sessions;

-- Remove current_session_token column from profiles table (if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'current_session_token'
    ) THEN
        ALTER TABLE profiles DROP COLUMN current_session_token;
        RAISE NOTICE 'Dropped current_session_token column from profiles table';
    ELSE
        RAISE NOTICE 'current_session_token column does not exist in profiles table';
    END IF;
END
$$;

-- Note: This migration removes custom session management.
-- Session management is now handled entirely by Supabase Auth via JWT tokens.
-- No custom session tracking is needed.

