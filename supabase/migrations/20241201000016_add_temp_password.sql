-- Add temp_password field to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS temp_password text;

-- Add index for temp_password for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_temp_password ON profiles(temp_password);










