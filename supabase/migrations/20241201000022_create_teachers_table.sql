-- Fix profiles table to work with manual teacher creation
-- Make id column auto-generated and remove foreign key constraint

-- First, let's check if we can modify the profiles table
-- If the foreign key constraint is causing issues, we'll need to handle it differently

-- Option 1: Create a separate teachers table that doesn't have auth constraints
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id text NOT NULL DEFAULT 'TCH-' || substr(uuid_generate_v4()::text, 1, 8),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  qualification text,
  experience_years integer DEFAULT 0,
  specialization text,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);

-- Enable RLS
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for teachers
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teachers' AND policyname = 'Admins can manage all teachers') THEN
    CREATE POLICY "Admins can manage all teachers" ON teachers
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_teachers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at (only if it doesn't exist)
DROP TRIGGER IF EXISTS update_teachers_updated_at ON teachers;
CREATE TRIGGER update_teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW
  EXECUTE FUNCTION update_teachers_updated_at();
