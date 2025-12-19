-- Fix handle_new_user trigger to respect role from user_metadata
-- This ensures that when users are created via Management API with a role in user_metadata,
-- the profile gets the correct role instead of always defaulting to 'student'

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get role from user_metadata if available, otherwise default to 'student'
  user_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    'student'
  );
  
  -- Validate role is one of the allowed values
  IF user_role NOT IN ('admin', 'school_admin', 'teacher', 'student') THEN
    user_role := 'student';
  END IF;
  
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    user_role
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;





