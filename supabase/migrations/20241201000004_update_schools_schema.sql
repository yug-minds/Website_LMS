-- Update schools table with comprehensive fields
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS school_code text,
ADD COLUMN IF NOT EXISTS join_code text,
ADD COLUMN IF NOT EXISTS school_email text,
ADD COLUMN IF NOT EXISTS school_admin_id uuid references profiles(id),
ADD COLUMN IF NOT EXISTS school_admin_name text,
ADD COLUMN IF NOT EXISTS school_admin_email text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'India',
ADD COLUMN IF NOT EXISTS pincode text,
ADD COLUMN IF NOT EXISTS affiliation_type text,
ADD COLUMN IF NOT EXISTS school_type text,
ADD COLUMN IF NOT EXISTS established_year integer,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS grades_offered jsonb,
ADD COLUMN IF NOT EXISTS total_students_estimate integer,
ADD COLUMN IF NOT EXISTS total_teachers_estimate integer,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Pending Verification')),
ADD COLUMN IF NOT EXISTS created_by uuid references profiles(id);

-- Create join_codes table for better join code management
CREATE TABLE IF NOT EXISTS join_codes (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  school_id uuid references schools(id) on delete cascade,
  grade text,
  is_active boolean default true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_schools_school_code ON schools(school_code);
CREATE INDEX IF NOT EXISTS idx_schools_join_code ON schools(join_code);
CREATE INDEX IF NOT EXISTS idx_schools_school_admin_id ON schools(school_admin_id);
CREATE INDEX IF NOT EXISTS idx_schools_city ON schools(city);
CREATE INDEX IF NOT EXISTS idx_schools_state ON schools(state);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);
CREATE INDEX IF NOT EXISTS idx_join_codes_code ON join_codes(code);
CREATE INDEX IF NOT EXISTS idx_join_codes_school_id ON join_codes(school_id);
CREATE INDEX IF NOT EXISTS idx_join_codes_is_active ON join_codes(is_active);

-- Create RLS policies for join_codes
ALTER TABLE join_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage join codes" ON join_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "School admins can view their school join codes" ON join_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'school_admin'
    )
  );

-- Create function to generate school code
CREATE OR REPLACE FUNCTION generate_school_code()
RETURNS text AS $$
DECLARE
  new_code text;
  counter integer := 1;
BEGIN
  LOOP
    new_code := 'SCH-' || LPAD(counter::text, 4, '0');
    
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM schools WHERE school_code = new_code) THEN
      RETURN new_code;
    END IF;
    
    counter := counter + 1;
    
    -- Prevent infinite loop
    IF counter > 9999 THEN
      RAISE EXCEPTION 'Unable to generate unique school code';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate join code
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS text AS $$
DECLARE
  new_code text;
  counter integer := 1;
BEGIN
  LOOP
    new_code := 'JNSCH-' || LPAD(counter::text, 5, '0');
    
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM schools WHERE join_code = new_code) THEN
      RETURN new_code;
    END IF;
    
    counter := counter + 1;
    
    -- Prevent infinite loop
    IF counter > 99999 THEN
      RAISE EXCEPTION 'Unable to generate unique join code';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-generate school admin password
CREATE OR REPLACE FUNCTION generate_school_admin_password()
RETURNS text AS $$
BEGIN
  RETURN 'SA' || substring(md5(random()::text) from 1 for 8);
END;
$$ LANGUAGE plpgsql;
