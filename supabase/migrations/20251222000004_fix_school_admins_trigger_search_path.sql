-- Fix school_admins trigger function to use proper search_path
-- This fixes the "relation profiles does not exist" error

-- Update the function to explicitly use public schema
CREATE OR REPLACE FUNCTION sync_profile_school_id_from_school_admins()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.profiles 
  SET school_id = NEW.school_id 
  WHERE id = NEW.profile_id AND role = 'school_admin';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS sync_profile_school_id_school_admin ON school_admins;
CREATE TRIGGER sync_profile_school_id_school_admin
  AFTER INSERT OR UPDATE ON school_admins
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_school_id_from_school_admins();




