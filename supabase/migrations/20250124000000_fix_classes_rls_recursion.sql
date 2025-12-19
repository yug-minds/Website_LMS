-- =======================================================================
-- Fix Infinite Recursion in Classes Table RLS Policies
-- 
-- Issue: The classes table RLS policies query profiles table, which can
-- cause infinite recursion when course_progress policies query classes.
-- 
-- Solution: Use SECURITY DEFINER functions to check roles without
-- triggering RLS recursion, similar to the fix for profiles table.
-- 
-- Date: 2025-01-24
-- =======================================================================

-- ====================================
-- Step 1: Ensure is_admin_user() function exists
-- ====================================
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ====================================
-- Step 2: Create is_school_admin_user() function
-- ====================================
CREATE OR REPLACE FUNCTION public.is_school_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'school_admin'
  );
$$;

-- ====================================
-- Step 3: Create get_user_school_id() function
-- ====================================
-- This function returns the school_id for the current user if they are a school_admin
-- Uses SECURITY DEFINER to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles 
  WHERE id = auth.uid() AND role = 'school_admin'
  LIMIT 1;
$$;

-- ====================================
-- Step 4: Fix Classes Table RLS Policies
-- ====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'classes') THEN
    -- Drop all existing classes policies
    DROP POLICY IF EXISTS "Admins can manage classes" ON classes;
    DROP POLICY IF EXISTS "School admins can manage their school classes" ON classes;
    DROP POLICY IF EXISTS "Teachers can view their assigned classes" ON classes;
    DROP POLICY IF EXISTS "School admins can manage their school classes" ON classes;
    
    -- Policy 1: Admins can manage all classes (uses SECURITY DEFINER function)
    CREATE POLICY "Admins can manage classes" ON classes
      FOR ALL 
      USING (public.is_admin_user())
      WITH CHECK (public.is_admin_user());
    
    -- Policy 2: School admins can manage classes for their school (uses SECURITY DEFINER function)
    CREATE POLICY "School admins can manage their school classes" ON classes
      FOR ALL 
      USING (
        public.is_school_admin_user()
        AND school_id = public.get_user_school_id()
      )
      WITH CHECK (
        public.is_school_admin_user()
        AND school_id = public.get_user_school_id()
      );
    
    -- Policy 3: Teachers can view their assigned classes
    -- This policy doesn't query profiles directly, so it's safe
    CREATE POLICY "Teachers can view their assigned classes" ON classes
      FOR SELECT 
      USING (
        id IN (
          SELECT tc.class_id FROM teacher_classes tc
          WHERE tc.teacher_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM teacher_schools ts
          WHERE ts.teacher_id = auth.uid()
          AND ts.school_id = classes.school_id
        )
      );
  END IF;
END $$;

-- ====================================
-- Step 5: Fix Course Progress Policies
-- ====================================
-- The course_progress policies query classes and profiles, which was causing recursion
-- We need to ensure they use SECURITY DEFINER functions to avoid recursion
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_progress') THEN
    -- Drop all existing course_progress policies that might cause recursion
    DROP POLICY IF EXISTS "Admins can manage course progress" ON course_progress;
    DROP POLICY IF EXISTS "School admins can view their school course progress" ON course_progress;
    DROP POLICY IF EXISTS "Teachers can view course progress for their courses" ON course_progress;
    
    -- Policy 1: Admins can manage all course progress (uses SECURITY DEFINER function)
    CREATE POLICY "Admins can manage course progress" ON course_progress
      FOR ALL
      USING (public.is_admin_user())
      WITH CHECK (public.is_admin_user());
    
    -- Policy 2: School admins can view course progress for their school (uses SECURITY DEFINER function)
    CREATE POLICY "School admins can view their school course progress" ON course_progress
      FOR SELECT
      USING (
        public.is_school_admin_user()
        AND EXISTS (
          SELECT 1 FROM public.courses
          WHERE courses.id = course_progress.course_id
          AND courses.school_id = public.get_user_school_id()
        )
      );
    
    -- Policy 3: Teachers can view course progress for their courses
    -- Uses teacher_classes and classes, but classes policies now use SECURITY DEFINER functions
    CREATE POLICY "Teachers can view course progress for their courses" ON course_progress
      FOR SELECT
      USING (
        -- Teachers can view progress for courses matching their assigned classes' grades
        EXISTS (
          SELECT 1 FROM teacher_classes tc
          JOIN classes c ON c.id = tc.class_id
          JOIN courses co ON co.grade = c.grade
          WHERE tc.teacher_id = auth.uid()
          AND co.id = course_progress.course_id
        )
        -- Or if they're assigned to a school, they can view progress for courses in that school
        OR EXISTS (
          SELECT 1 FROM teacher_schools ts
          JOIN courses co ON co.school_id = ts.school_id
          WHERE ts.teacher_id = auth.uid()
          AND co.id = course_progress.course_id
        )
      );
    
    -- Policy 4: Students can manage their own course progress (no recursion risk)
    DROP POLICY IF EXISTS "Students can manage their own course progress" ON course_progress;
    CREATE POLICY "Students can manage their own course progress" ON course_progress
      FOR ALL
      USING (student_id = auth.uid())
      WITH CHECK (student_id = auth.uid());
  END IF;
END $$;

-- ====================================
-- Step 6: Grant Execute Permissions
-- ====================================
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_school_id() TO authenticated;

-- ====================================
-- Step 7: Update Statistics
-- ====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'classes') THEN
    ANALYZE classes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_progress') THEN
    ANALYZE course_progress;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'teacher_classes') THEN
    ANALYZE teacher_classes;
  END IF;
END $$;

-- ====================================
-- Step 8: Verification
-- ====================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Classes RLS recursion fix complete';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed policies:';
  RAISE NOTICE '  - Admins can manage classes (uses is_admin_user)';
  RAISE NOTICE '  - School admins can manage their school classes (uses is_school_admin_user)';
  RAISE NOTICE '  - Teachers can view their assigned classes (safe, no profiles query)';
  RAISE NOTICE '  - Teachers can view course progress (updated to avoid recursion)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test course_progress queries in frontend';
  RAISE NOTICE '2. Verify no more infinite recursion errors';
  RAISE NOTICE '3. Monitor for any RLS-related issues';
END $$;

