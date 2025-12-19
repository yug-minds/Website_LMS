-- Create school_admins table for dedicated school admin management
CREATE TABLE IF NOT EXISTS school_admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  temp_password text,
  is_active boolean DEFAULT true,
  permissions jsonb DEFAULT '{}', -- Store role-specific permissions
  last_login timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES profiles(id) -- Who created this admin
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_school_admins_school_id ON school_admins(school_id);
CREATE INDEX IF NOT EXISTS idx_school_admins_email ON school_admins(email);
CREATE INDEX IF NOT EXISTS idx_school_admins_is_active ON school_admins(is_active);
CREATE INDEX IF NOT EXISTS idx_school_admins_created_at ON school_admins(created_at);

-- Enable RLS
ALTER TABLE school_admins ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage all school admins" ON school_admins
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "School admins can view their own data" ON school_admins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'school_admin' AND school_id = school_admins.school_id
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_school_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_school_admins_updated_at
  BEFORE UPDATE ON school_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_school_admins_updated_at();










