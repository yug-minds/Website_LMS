-- Add number_of_sections column to schools table
-- This field defines how many sections each grade will have (e.g., 3 sections = A, B, C)
-- This is a one-time configuration set during school creation

ALTER TABLE schools
ADD COLUMN IF NOT EXISTS number_of_sections INTEGER DEFAULT NULL
CHECK (number_of_sections IS NULL OR (number_of_sections >= 1 AND number_of_sections <= 26));

-- Add comment for documentation
COMMENT ON COLUMN schools.number_of_sections IS 'Number of sections per grade (1-26, typically A-Z). Set once during school creation and applies to all grades.';

-- Create index for filtering schools by section configuration
CREATE INDEX IF NOT EXISTS idx_schools_number_of_sections ON schools(number_of_sections) WHERE number_of_sections IS NOT NULL;




