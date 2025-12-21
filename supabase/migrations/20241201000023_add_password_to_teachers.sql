-- Add password field to teachers table
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS temp_password text;

-- Add comment for clarity
COMMENT ON COLUMN teachers.temp_password IS 'Temporary password for teacher login';










