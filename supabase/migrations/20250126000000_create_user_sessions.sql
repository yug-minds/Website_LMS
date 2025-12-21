-- Create user_sessions table for single-device session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, is_active) -- Only one active session per user at a time
);

-- Create index for fast session lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = TRUE;

-- Create function to invalidate other sessions when a new one is created
CREATE OR REPLACE FUNCTION invalidate_other_sessions()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new active session is created, invalidate all other sessions for that user
    IF NEW.is_active = TRUE THEN
        UPDATE user_sessions
        SET is_active = FALSE,
            expires_at = NOW()
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND is_active = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-invalidate old sessions
DROP TRIGGER IF EXISTS trigger_invalidate_other_sessions ON user_sessions;
CREATE TRIGGER trigger_invalidate_other_sessions
    AFTER INSERT ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION invalidate_other_sessions();

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < NOW() OR is_active = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own sessions
CREATE POLICY "Users can view own sessions"
    ON user_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Service role can manage all sessions
CREATE POLICY "Service role can manage all sessions"
    ON user_sessions FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON user_sessions TO service_role;
GRANT SELECT ON user_sessions TO authenticated;

-- Add session_token column to profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'current_session_token'
    ) THEN
        ALTER TABLE profiles ADD COLUMN current_session_token TEXT;
    END IF;
END
$$;














