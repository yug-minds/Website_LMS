-- Add content column to chapters table for rich text content
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS content TEXT;

-- Verify storage bucket exists (this is usually done in UI, but good to have SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('course-files', 'course-files', true) ON CONFLICT DO NOTHING;

