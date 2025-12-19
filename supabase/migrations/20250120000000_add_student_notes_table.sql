-- ==========================================================
--  Student Notes Table Migration
--  Purpose: Enable note-taking functionality for students
-- ==========================================================

-- Ensure courses table has primary key before creating foreign key
DO $$
BEGIN
    -- Check if courses table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'courses'
    ) THEN
        -- Check if primary key exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conrelid = 'public.courses'::regclass 
            AND contype = 'p'
        ) THEN
            -- Try to add primary key
            BEGIN
                ALTER TABLE public.courses ADD PRIMARY KEY (id);
                RAISE NOTICE 'Added PRIMARY KEY to public.courses(id)';
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Could not add PRIMARY KEY to public.courses(id): %', SQLERRM;
                -- If adding PK fails, we'll get a clearer error when adding the foreign key
            END;
        END IF;
    ELSE
        RAISE WARNING 'Table public.courses does not exist';
    END IF;
END $$;

-- Ensure other referenced tables have primary keys
DO $$
BEGIN
    -- Ensure chapters table has primary key
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'chapters'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.chapters'::regclass 
        AND contype = 'p'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'chapters' 
            AND column_name = 'id'
        ) THEN
            ALTER TABLE public.chapters ADD PRIMARY KEY (id);
        END IF;
    END IF;
    
    -- Ensure chapter_contents table has primary key
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'chapter_contents'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.chapter_contents'::regclass 
        AND contype = 'p'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'chapter_contents' 
            AND column_name = 'id'
        ) THEN
            ALTER TABLE public.chapter_contents ADD PRIMARY KEY (id);
        END IF;
    END IF;
END $$;

-- Create student_notes table without foreign keys first
CREATE TABLE IF NOT EXISTS public.student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID NOT NULL,
  chapter_id UUID,
  content_id UUID,
  note_text TEXT NOT NULL,
  highlighted_text TEXT, -- For text selection highlights
  position_data JSONB DEFAULT '{}'::jsonb, -- For positioning notes relative to content
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, course_id, chapter_id, content_id)
);

-- Add foreign key constraints after table creation
DO $$
BEGIN
    -- Add student_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.student_notes'::regclass 
        AND conname = 'student_notes_student_id_fkey'
    ) THEN
        ALTER TABLE public.student_notes 
        ADD CONSTRAINT student_notes_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    
    -- Add course_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.student_notes'::regclass 
        AND conname = 'student_notes_course_id_fkey'
    ) THEN
        ALTER TABLE public.student_notes 
        ADD CONSTRAINT student_notes_course_id_fkey 
        FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
    END IF;
    
    -- Add chapter_id foreign key (if chapters table exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'chapters'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.student_notes'::regclass 
        AND conname = 'student_notes_chapter_id_fkey'
    ) THEN
        ALTER TABLE public.student_notes 
        ADD CONSTRAINT student_notes_chapter_id_fkey 
        FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
    END IF;
    
    -- Add content_id foreign key (if chapter_contents table exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'chapter_contents'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.student_notes'::regclass 
        AND conname = 'student_notes_content_id_fkey'
    ) THEN
        ALTER TABLE public.student_notes 
        ADD CONSTRAINT student_notes_content_id_fkey 
        FOREIGN KEY (content_id) REFERENCES public.chapter_contents(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON public.student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_course ON public.student_notes(course_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_chapter ON public.student_notes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_content ON public.student_notes(content_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_student_course ON public.student_notes(student_id, course_id);

-- Enable RLS
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Students can view their own notes
CREATE POLICY "student_notes_select_own" ON public.student_notes
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can insert their own notes
CREATE POLICY "student_notes_insert_own" ON public.student_notes
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Students can update their own notes
CREATE POLICY "student_notes_update_own" ON public.student_notes
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Students can delete their own notes
CREATE POLICY "student_notes_delete_own" ON public.student_notes
  FOR DELETE
  USING (student_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_student_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_student_notes_updated_at_trigger
  BEFORE UPDATE ON public.student_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_student_notes_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_notes TO authenticated;

COMMENT ON TABLE public.student_notes IS 'Stores student notes for course content';
COMMENT ON COLUMN public.student_notes.note_text IS 'The main note text content';
COMMENT ON COLUMN public.student_notes.highlighted_text IS 'Text that was highlighted when note was created';
COMMENT ON COLUMN public.student_notes.position_data IS 'JSON data for positioning note relative to content (e.g., scroll position, element reference)';

