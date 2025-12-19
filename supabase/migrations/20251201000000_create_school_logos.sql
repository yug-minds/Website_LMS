-- Migration: Create school_logos table for logo management
-- Date: 2025-12-01

-- Create table
CREATE TABLE IF NOT EXISTS public.school_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  storage_path TEXT,
  upload_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_logos_upload_date ON public.school_logos(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_school_logos_is_deleted ON public.school_logos(is_deleted);

-- Enable RLS (optional - admin operations use service role)
ALTER TABLE public.school_logos ENABLE ROW LEVEL SECURITY;

-- Policies: allow read for all, admin manage
DO $$
BEGIN
  -- Read policy (public, only non-deleted)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_logos' AND policyname = 'Public can read non-deleted logos'
  ) THEN
    CREATE POLICY "Public can read non-deleted logos" ON public.school_logos
      FOR SELECT USING (is_deleted = FALSE);
  END IF;

  -- Admin manage policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_logos' AND policyname = 'Admins can manage school logos'
  ) THEN
    CREATE POLICY "Admins can manage school logos" ON public.school_logos
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
      );
  END IF;
END $$;

-- Note: Create storage bucket "school-logos" manually in Supabase Storage.
-- The API will return a helpful error if the bucket is missing.

