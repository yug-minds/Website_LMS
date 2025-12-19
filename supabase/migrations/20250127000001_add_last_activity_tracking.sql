-- Migration: Add Last Activity Tracking for Inactivity Timeout
-- Date: 2025-01-27
-- Description: Add last_activity column to profiles table to track user activity for inactivity timeout

-- Add last_activity column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index on last_activity for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_activity ON profiles(last_activity);

-- Update existing rows to set last_activity to current timestamp
UPDATE profiles 
SET last_activity = NOW() 
WHERE last_activity IS NULL;

-- Create function to update last_activity (can be called from API routes)
CREATE OR REPLACE FUNCTION update_user_activity(user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET last_activity = NOW()
  WHERE profiles.id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_activity(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN profiles.last_activity IS 'Last activity timestamp for inactivity timeout tracking';

