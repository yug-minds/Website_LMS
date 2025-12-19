-- Enhanced joining code system for grade-specific student enrollment
-- This migration improves the joining code system to support unique codes per grade

-- Create function to generate unique grade-specific joining codes
CREATE OR REPLACE FUNCTION generate_grade_join_code(school_id_param uuid, grade_param text)
RETURNS text AS $$
DECLARE
  new_code text;
  counter integer := 1;
  school_prefix text;
BEGIN
  -- Get school prefix (first 3 letters of school name)
  SELECT UPPER(LEFT(name, 3)) INTO school_prefix 
  FROM schools 
  WHERE id = school_id_param;
  
  -- If school name is too short, use default prefix
  IF school_prefix IS NULL OR LENGTH(school_prefix) < 3 THEN
    school_prefix := 'SCH';
  END IF;
  
  LOOP
    -- Generate code format: SCHOOL_PREFIX + GRADE_NUMBER + COUNTER
    -- Example: YUG1-001, YUG2-001, etc.
    new_code := school_prefix || grade_param || '-' || LPAD(counter::text, 3, '0');
    
    -- Check if code already exists in join_codes table
    IF NOT EXISTS (SELECT 1 FROM join_codes WHERE code = new_code) THEN
      RETURN new_code;
    END IF;
    
    counter := counter + 1;
    
    -- Prevent infinite loop
    IF counter > 999 THEN
      RAISE EXCEPTION 'Unable to generate unique grade join code for school % grade %', school_id_param, grade_param;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate all joining codes for a school's grades
CREATE OR REPLACE FUNCTION generate_school_grade_codes(school_id_param uuid, grades_array text[])
RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}';
  grade_item text;
  generated_code text;
BEGIN
  -- Loop through each grade and generate a unique code
  FOREACH grade_item IN ARRAY grades_array
  LOOP
    generated_code := generate_grade_join_code(school_id_param, grade_item);
    result := result || jsonb_build_object(grade_item, generated_code);
    
    -- Insert into join_codes table
    INSERT INTO join_codes (code, school_id, grade, is_active, expires_at)
    VALUES (
      generated_code, 
      school_id_param, 
      grade_item, 
      true, 
      NOW() + INTERVAL '1 year' -- Codes expire after 1 year
    )
    ON CONFLICT (code) DO NOTHING; -- Ignore if code already exists
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate joining code and get school/grade info
CREATE OR REPLACE FUNCTION validate_joining_code(code_param text)
RETURNS TABLE(
  is_valid boolean,
  school_id uuid,
  school_name text,
  grade text,
  expires_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jc.is_active AND (jc.expires_at IS NULL OR jc.expires_at > NOW()) as is_valid,
    jc.school_id,
    s.name as school_name,
    jc.grade,
    jc.expires_at
  FROM join_codes jc
  JOIN schools s ON s.id = jc.school_id
  WHERE jc.code = code_param;
END;
$$ LANGUAGE plpgsql;

-- Create function to deactivate joining code after successful student registration
CREATE OR REPLACE FUNCTION deactivate_joining_code(code_param text)
RETURNS boolean AS $$
DECLARE
  updated_rows integer;
BEGIN
  UPDATE join_codes 
  SET is_active = false 
  WHERE code = code_param AND is_active = true;
  
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql;

-- Add index for better performance on code validation
CREATE INDEX IF NOT EXISTS idx_join_codes_code_active ON join_codes(code, is_active) WHERE is_active = true;

-- Add index for school-grade lookups
CREATE INDEX IF NOT EXISTS idx_join_codes_school_grade ON join_codes(school_id, grade, is_active) WHERE is_active = true;

-- Update RLS policies for join_codes
DROP POLICY IF EXISTS "Admins can manage join codes" ON join_codes;
DROP POLICY IF EXISTS "School admins can view their school join codes" ON join_codes;

-- Create comprehensive RLS policies
CREATE POLICY "Admins can manage all join codes" ON join_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "School admins can view their school join codes" ON join_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN schools s ON s.school_admin_id = p.id
      WHERE p.id = auth.uid() AND p.role = 'school_admin' AND s.id = join_codes.school_id
    )
  );

-- Allow public access for code validation (for student registration)
CREATE POLICY "Public can validate join codes" ON join_codes
  FOR SELECT USING (is_active = true);

-- Create view for active joining codes with school information
CREATE OR REPLACE VIEW active_joining_codes AS
SELECT 
  jc.id,
  jc.code,
  jc.school_id,
  s.name as school_name,
  jc.grade,
  jc.is_active,
  jc.expires_at,
  jc.created_at
FROM join_codes jc
JOIN schools s ON s.id = jc.school_id
WHERE jc.is_active = true;

-- Grant permissions on the view
GRANT SELECT ON active_joining_codes TO authenticated;
GRANT SELECT ON active_joining_codes TO anon;












