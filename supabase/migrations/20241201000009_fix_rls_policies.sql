-- Fix RLS policies that are causing infinite recursion

-- Drop problematic policies
DROP POLICY IF EXISTS "Profiles can view self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles can update self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles can insert self" ON public.profiles;

-- Create simple, non-recursive policies for profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
        CREATE POLICY "Users can view own profile"
        ON public.profiles FOR SELECT
        USING (auth.uid() = id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile"
        ON public.profiles FOR UPDATE
        USING (auth.uid() = id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
        CREATE POLICY "Users can insert own profile"
        ON public.profiles FOR INSERT
        WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Fix other potentially problematic policies (only if tables exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'students') THEN
        DROP POLICY IF EXISTS "Students can view own data" ON public.students;
        DROP POLICY IF EXISTS "Students can update own data" ON public.students;
        
        -- Create students policies with proper error handling
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Students can view own data') THEN
            CREATE POLICY "Students can view own data"
            ON public.students FOR SELECT
            USING (profile_id = auth.uid());
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Students can update own data') THEN
            CREATE POLICY "Students can update own data"
            ON public.students FOR UPDATE
            USING (profile_id = auth.uid());
        END IF;
    END IF;
END $$;

-- Fix enrollments policies (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'enrollments') THEN
        DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;
        DROP POLICY IF EXISTS "Students can update own enrollments" ON public.enrollments;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'enrollments' AND policyname = 'Students can view own enrollments') THEN
            CREATE POLICY "Students can view own enrollments"
            ON public.enrollments FOR SELECT
            USING (student_id = auth.uid());
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'enrollments' AND policyname = 'Students can update own enrollments') THEN
            CREATE POLICY "Students can update own enrollments"
            ON public.enrollments FOR UPDATE
            USING (student_id = auth.uid());
        END IF;
    END IF;
END $$;

-- Fix notifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can view own notifications') THEN
        CREATE POLICY "Users can view own notifications"
        ON public.notifications FOR SELECT
        USING (user_id = auth.uid());
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update own notifications') THEN
        CREATE POLICY "Users can update own notifications"
        ON public.notifications FOR UPDATE
        USING (user_id = auth.uid());
    END IF;
END $$;
