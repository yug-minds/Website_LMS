-- Migration: Add updated_at column to teacher_reports table
-- Date: 2025-01-11
-- Description: Adds updated_at column to teacher_reports table if it doesn't exist

-- Add updated_at column to teacher_reports table
ALTER TABLE teacher_reports 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone default timezone('utc'::text, now());

-- Create a trigger to automatically update updated_at on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists and create a new one
DROP TRIGGER IF EXISTS update_teacher_reports_updated_at ON teacher_reports;
CREATE TRIGGER update_teacher_reports_updated_at
    BEFORE UPDATE ON teacher_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing rows to have updated_at = created_at if updated_at is null
UPDATE teacher_reports 
SET updated_at = created_at 
WHERE updated_at IS NULL;





