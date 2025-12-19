-- Add principal_phone field to schools table
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS principal_phone text;

-- Add index for principal_phone for better performance
CREATE INDEX IF NOT EXISTS idx_schools_principal_phone ON schools(principal_phone);










