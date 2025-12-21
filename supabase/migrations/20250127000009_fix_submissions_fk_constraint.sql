-- Fix foreign key constraint on submissions.assignment_id
-- The constraint may not have proper schema qualification, causing "relation does not exist" errors

-- First, drop the existing constraint if it exists
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the constraint name
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.submissions'::regclass
      AND confrelid = 'public.assignments'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.submissions'::regclass AND attname = 'assignment_id')]
    LIMIT 1;
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END IF;
END $$;

-- Recreate the constraint with explicit schema qualification
ALTER TABLE public.submissions
ADD CONSTRAINT submissions_assignment_id_fkey
FOREIGN KEY (assignment_id)
REFERENCES public.assignments(id)
ON DELETE CASCADE;

-- Verify the constraint was created
DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'submissions_assignment_id_fkey'
          AND conrelid = 'public.submissions'::regclass
    ) INTO constraint_exists;
    
    IF constraint_exists THEN
        RAISE NOTICE 'Foreign key constraint created successfully';
    ELSE
        RAISE WARNING 'Foreign key constraint may not have been created';
    END IF;
END $$;


















