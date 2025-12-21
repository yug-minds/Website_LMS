-- Ensure course_access table exists
CREATE TABLE IF NOT EXISTS public.course_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    grade TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(course_id, school_id, grade)
);

-- Enable RLS
ALTER TABLE public.course_access ENABLE ROW LEVEL SECURITY;

-- Add policies if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'course_access' AND policyname = 'Admins can manage course access'
    ) THEN
        CREATE POLICY "Admins can manage course access"
            ON public.course_access
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'course_access' AND policyname = 'School admins can view their school course access'
    ) THEN
        CREATE POLICY "School admins can view their school course access"
            ON public.course_access
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.school_admins
                    WHERE school_admins.user_id = auth.uid() 
                    AND school_admins.school_id = course_access.school_id
                )
            );
    END IF;
END $$;
















