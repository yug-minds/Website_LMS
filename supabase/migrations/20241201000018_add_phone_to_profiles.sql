-- Add phone column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone text;

-- Add index for phone for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);










