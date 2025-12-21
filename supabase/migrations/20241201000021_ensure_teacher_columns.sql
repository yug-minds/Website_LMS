-- Ensure profiles table has all required columns for teachers
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS qualification text,
ADD COLUMN IF NOT EXISTS experience_years integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS specialization text,
ADD COLUMN IF NOT EXISTS temp_password text;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_qualification ON profiles(qualification);
CREATE INDEX IF NOT EXISTS idx_profiles_experience_years ON profiles(experience_years);
CREATE INDEX IF NOT EXISTS idx_profiles_specialization ON profiles(specialization);
CREATE INDEX IF NOT EXISTS idx_profiles_temp_password ON profiles(temp_password);










