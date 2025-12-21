-- Migration: Add updated_at column to profiles table
-- Date: 2025-12-13
-- Description: Adds updated_at column to profiles table to fix login errors for school admin

-- Add updated_at column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Update existing rows to set updated_at = created_at if updated_at is null
UPDATE profiles 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Create or replace function to automatically update updated_at on row update
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and create a new one
DROP TRIGGER IF EXISTS update_profiles_updated_at_trigger ON profiles;
CREATE TRIGGER update_profiles_updated_at_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_profiles_updated_at();

-- Add comment for documentation
COMMENT ON COLUMN profiles.updated_at IS 'Timestamp of last profile update, automatically maintained by trigger';



















