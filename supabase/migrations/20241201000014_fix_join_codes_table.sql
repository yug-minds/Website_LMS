-- Fix join_codes table schema
-- This migration ensures the join_codes table has the correct structure

-- Drop and recreate the join_codes table with correct schema
DROP TABLE IF EXISTS join_codes CASCADE;

CREATE TABLE join_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  grade text,
  is_active boolean DEFAULT true,
  usage_type text DEFAULT 'multiple' CHECK (usage_type IN ('single', 'multiple')),
  times_used integer DEFAULT 0,
  max_uses integer DEFAULT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Create indexes for better performance
CREATE INDEX idx_join_codes_code ON join_codes(code);
CREATE INDEX idx_join_codes_school_id ON join_codes(school_id);
CREATE INDEX idx_join_codes_is_active ON join_codes(is_active);
CREATE INDEX idx_join_codes_school_grade ON join_codes(school_id, grade);

-- Enable RLS
ALTER TABLE join_codes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage all join codes" ON join_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "School admins can view their school join codes" ON join_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'school_admin'
      AND profiles.school_id = join_codes.school_id
    )
  );

-- Recreate the functions with correct schema
CREATE OR REPLACE FUNCTION generate_grade_join_code(
  school_id_param uuid,
  grade_param text,
  manual_code text DEFAULT NULL,
  usage_type_param text DEFAULT 'multiple',
  max_uses_param integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  generated_code text;
  school_code text;
  school_name_short text;
BEGIN
  -- Get school information
  SELECT code, name INTO school_code, school_name_short
  FROM schools 
  WHERE id = school_id_param;
  
  -- If manual code provided, use it (with validation)
  IF manual_code IS NOT NULL AND manual_code != '' THEN
    -- Check if manual code already exists
    IF EXISTS (SELECT 1 FROM join_codes WHERE code = manual_code) THEN
      RAISE EXCEPTION 'Joining code % already exists', manual_code;
    END IF;
    
    generated_code := UPPER(TRIM(manual_code));
  ELSE
    -- Auto-generate code based on school name and grade
    school_name_short := UPPER(SUBSTRING(REGEXP_REPLACE(school_name_short, '[^A-Za-z0-9]', ''), 1, 3));
    generated_code := school_name_short || '-' || grade_param || '-' || LPAD(FLOOR(RANDOM() * 1000)::text, 3, '0');
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM join_codes WHERE code = generated_code) LOOP
      generated_code := school_name_short || '-' || grade_param || '-' || LPAD(FLOOR(RANDOM() * 1000)::text, 3, '0');
    END LOOP;
  END IF;
  
  -- Insert the new joining code
  INSERT INTO join_codes (
    code, 
    school_id, 
    grade, 
    is_active, 
    usage_type, 
    times_used, 
    max_uses,
    expires_at
  ) VALUES (
    generated_code,
    school_id_param,
    grade_param,
    true,
    usage_type_param,
    0,
    CASE 
      WHEN usage_type_param = 'single' THEN 1
      WHEN max_uses_param IS NOT NULL THEN max_uses_param
      ELSE NULL
    END,
    NOW() + INTERVAL '1 year'
  );
  
  RETURN generated_code;
END;
$$;

-- Create function to generate all joining codes for a school's grades
CREATE OR REPLACE FUNCTION generate_school_grade_codes(
  school_id_param uuid,
  grades_array text[],
  manual_codes jsonb DEFAULT NULL,
  usage_type_param text DEFAULT 'multiple',
  max_uses_param integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb := '{}';
  grade_item text;
  manual_code text;
  generated_code text;
BEGIN
  FOREACH grade_item IN ARRAY grades_array
  LOOP
    -- Check if manual code provided for this grade
    IF manual_codes IS NOT NULL AND manual_codes ? grade_item THEN
      manual_code := manual_codes ->> grade_item;
    ELSE
      manual_code := NULL;
    END IF;
    
    -- Generate code for this grade
    SELECT generate_grade_join_code(
      school_id_param, 
      grade_item, 
      manual_code, 
      usage_type_param, 
      max_uses_param
    ) INTO generated_code;
    
    -- Add to result
    result := result || jsonb_build_object(grade_item, generated_code);
  END LOOP;
  
  RETURN result;
END;
$$;

-- Create function to validate joining code
CREATE OR REPLACE FUNCTION validate_joining_code(join_code_param text)
RETURNS TABLE(
  is_valid boolean,
  school_id uuid,
  school_name text,
  grade text,
  expires_at timestamp with time zone,
  usage_type text,
  times_used integer,
  max_uses integer,
  can_use boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  code_record record;
BEGIN
  -- Get code information
  SELECT 
    jc.school_id,
    s.name as school_name,
    jc.grade,
    jc.expires_at,
    jc.usage_type,
    jc.times_used,
    jc.max_uses,
    jc.is_active
  INTO code_record
  FROM join_codes jc
  JOIN schools s ON jc.school_id = s.id
  WHERE jc.code = join_code_param;
  
  -- Check if code exists and is valid
  IF code_record IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::timestamp with time zone, NULL::text, NULL::integer, NULL::integer, false;
    RETURN;
  END IF;
  
  -- Check if code is active and not expired
  IF NOT code_record.is_active OR code_record.expires_at < NOW() THEN
    RETURN QUERY SELECT false, code_record.school_id, code_record.school_name, code_record.grade, code_record.expires_at, code_record.usage_type, code_record.times_used, code_record.max_uses, false;
    RETURN;
  END IF;
  
  -- Check usage limits
  DECLARE
    can_use_code boolean := true;
  BEGIN
    IF code_record.usage_type = 'single' AND code_record.times_used >= 1 THEN
      can_use_code := false;
    ELSIF code_record.max_uses IS NOT NULL AND code_record.times_used >= code_record.max_uses THEN
      can_use_code := false;
    END IF;
    
    RETURN QUERY SELECT true, code_record.school_id, code_record.school_name, code_record.grade, code_record.expires_at, code_record.usage_type, code_record.times_used, code_record.max_uses, can_use_code;
  END;
END;
$$;

-- Create function to increment usage count
CREATE OR REPLACE FUNCTION increment_join_code_usage(code_param text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE join_codes 
  SET times_used = times_used + 1
  WHERE code = code_param;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count > 0;
END;
$$;

-- Create function to toggle code status
CREATE OR REPLACE FUNCTION toggle_joining_code_status(
  code_param text,
  activate_param boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE join_codes 
  SET is_active = activate_param
  WHERE code = code_param;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count > 0;
END;
$$;










