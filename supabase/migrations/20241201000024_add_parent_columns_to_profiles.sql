-- Add parent/guardian information columns to profiles table for students
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS parent_name text,
ADD COLUMN IF NOT EXISTS parent_phone text;

-- Create index for parent phone for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_parent_phone ON profiles(parent_phone);

-- Add comment to columns
COMMENT ON COLUMN profiles.parent_name IS 'Parent or guardian full name for students';
COMMENT ON COLUMN profiles.parent_phone IS 'Parent or guardian phone number for students';









