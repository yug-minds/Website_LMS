-- =======================================================================
-- Fix Infinite Recursion in course_progress RLS Policy (Fixed)
-- Date: 2025-01-23
-- =======================================================================

-- Only fix RLS policies if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_progress' AND table_schema = 'public') THEN
    -- Enable RLS
    ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;
    
    -- Drop problematic policies
    DROP POLICY IF EXISTS "Teachers can view course progress for their courses" ON public.course_progress;
    DROP POLICY IF EXISTS "Students can manage their own course progress" ON public.course_progress;
    
    -- Create simple student policy
    CREATE POLICY "Students can manage their own course progress"
    ON public.course_progress
    FOR ALL
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());
    
    -- Create simple teacher policy (avoid recursion)
    CREATE POLICY "Teachers can view course progress for their courses" 
    ON public.course_progress
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'teacher'
      )
    );
    
    RAISE NOTICE 'Fixed course_progress RLS policies';
  ELSE
    RAISE NOTICE 'Skipping course_progress RLS - table does not exist';
  END IF;
  
  -- Fix student_progress table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_progress' AND table_schema = 'public') THEN
    ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Students can manage their own student progress" ON public.student_progress;
    
    CREATE POLICY "Students can manage their own student progress"
    ON public.student_progress
    FOR ALL
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());
    
    RAISE NOTICE 'Fixed student_progress RLS policies';
  ELSE
    RAISE NOTICE 'Skipping student_progress RLS - table does not exist';
  END IF;
END $$;