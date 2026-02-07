-- =======================================================================
-- Fix Student School ID Sync
-- 
-- Date: 2025-12-23
-- Purpose: Ensure profiles.school_id is properly synced from student_schools
-- =======================================================================

-- Fix the trigger function to use proper search_path (like school_admins)
CREATE OR REPLACE FUNCTION sync_profile_school_id_from_student_schools()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only sync if this is an active enrollment
  IF NEW.is_active = true THEN
    UPDATE public.profiles 
    SET school_id = NEW.school_id 
    WHERE id = NEW.student_id AND role = 'student';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS sync_profile_school_id_student ON student_schools;
CREATE TRIGGER sync_profile_school_id_student
  AFTER INSERT OR UPDATE ON student_schools
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION sync_profile_school_id_from_student_schools();

-- Fix existing data: Update profiles.school_id for all students based on their active student_schools enrollment
UPDATE public.profiles p
SET school_id = ss.school_id
FROM (
  SELECT DISTINCT ON (student_id) 
    student_id, 
    school_id
  FROM student_schools
  WHERE is_active = true
  ORDER BY student_id, enrolled_at DESC
) ss
WHERE p.id = ss.student_id 
  AND p.role = 'student'
  AND (p.school_id IS DISTINCT FROM ss.school_id);

-- Log how many records were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % student profiles with correct school_id', updated_count;
END $$;




