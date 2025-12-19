-- Fix user_sessions table - remove problematic unique constraint
-- The constraint UNIQUE(user_id, is_active) causes issues when:
-- 1. Creating a new active session when one already exists
-- 2. Setting multiple sessions to inactive

-- Drop the problematic constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_sessions_user_id_is_active_key'
    ) THEN
        ALTER TABLE user_sessions DROP CONSTRAINT user_sessions_user_id_is_active_key;
    END IF;
END
$$;

-- Delete all existing sessions to clean up
DELETE FROM user_sessions;

-- Also remove any partial index that might exist
DROP INDEX IF EXISTS idx_user_sessions_active;

-- Create a partial unique index instead - only ONE active session per user
-- This allows multiple inactive sessions but enforces single active session
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_one_active_per_user 
ON user_sessions (user_id) 
WHERE is_active = TRUE;

-- Update the trigger function to handle the constraint properly
CREATE OR REPLACE FUNCTION invalidate_other_sessions()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new active session is created, invalidate all other sessions for that user first
    IF NEW.is_active = TRUE THEN
        UPDATE user_sessions
        SET is_active = FALSE,
            expires_at = NOW()
        WHERE user_id = NEW.user_id
          AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger exists
DROP TRIGGER IF EXISTS trigger_invalidate_other_sessions ON user_sessions;
CREATE TRIGGER trigger_invalidate_other_sessions
    BEFORE INSERT ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION invalidate_other_sessions();














