-- Comprehensive Chapter Storage Integration Migration
-- This migration ensures chapters support storing all content types with Supabase Storage integration

-- ============================================================================
-- 1. ENSURE chapters TABLE HAS ALL REQUIRED COLUMNS FOR CONTENT
-- ============================================================================

DO $$ 
BEGIN
    -- Add text_content column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'text_content'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN text_content TEXT;
    END IF;

    -- Add content_summary JSONB column for storing content metadata
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'content_summary'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN content_summary JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- Add thumbnail_url for chapter preview
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'thumbnail_url'
    ) THEN
        ALTER TABLE public.chapters ADD COLUMN thumbnail_url TEXT;
    END IF;
END $$;

-- ============================================================================
-- 2. ENSURE chapter_contents TABLE IS FULLY CONFIGURED
-- ============================================================================

-- Create chapter_contents table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.chapter_contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (
        content_type IN (
            'text',
            'video',
            'video_link',
            'pdf',
            'image',
            'file',
            'audio',
            'html',
            'link',
            'quiz',
            'assignment'
        )
    ),
    title TEXT NOT NULL,
    content_url TEXT, -- Public URL from Supabase Storage or external URL
    content_text TEXT, -- For text/html content
    storage_path TEXT, -- Path in Supabase Storage bucket (e.g., courses/{courseId}/chapters/{chapterId}/...)
    content_metadata JSONB DEFAULT '{}'::jsonb, -- Additional metadata (file size, mime type, etc.)
    thumbnail_url TEXT, -- Thumbnail for videos/images
    content_label TEXT, -- Optional label/description
    order_index INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER, -- For videos/audio
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add missing columns to chapter_contents if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapter_contents' AND column_name = 'storage_path'
    ) THEN
        ALTER TABLE public.chapter_contents ADD COLUMN storage_path TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapter_contents' AND column_name = 'content_metadata'
    ) THEN
        ALTER TABLE public.chapter_contents ADD COLUMN content_metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapter_contents' AND column_name = 'thumbnail_url'
    ) THEN
        ALTER TABLE public.chapter_contents ADD COLUMN thumbnail_url TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapter_contents' AND column_name = 'content_label'
    ) THEN
        ALTER TABLE public.chapter_contents ADD COLUMN content_label TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapter_contents' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.chapter_contents ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapter_contents' AND column_name = 'video_link'
    ) THEN
        ALTER TABLE public.chapter_contents ADD COLUMN video_link TEXT; -- For YouTube/external video links
    END IF;
END $$;

-- Update content_type constraint to include all supported types
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE public.chapter_contents 
    DROP CONSTRAINT IF EXISTS chapter_contents_content_type_check;
    
    -- Add new constraint with all content types
    ALTER TABLE public.chapter_contents
    ADD CONSTRAINT chapter_contents_content_type_check
    CHECK (
        content_type IN (
            'text',
            'video',
            'video_link',
            'pdf',
            'image',
            'file',
            'audio',
            'html',
            'link',
            'quiz',
            'assignment'
        )
    );
EXCEPTION
    WHEN duplicate_object THEN
        -- Constraint already exists, skip
        NULL;
END $$;

-- ============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chapter_contents_chapter_id 
    ON public.chapter_contents(chapter_id);

CREATE INDEX IF NOT EXISTS idx_chapter_contents_chapter_id_order 
    ON public.chapter_contents(chapter_id, order_index);

CREATE INDEX IF NOT EXISTS idx_chapter_contents_content_type 
    ON public.chapter_contents(content_type);

CREATE INDEX IF NOT EXISTS idx_chapter_contents_storage_path 
    ON public.chapter_contents(storage_path) WHERE storage_path IS NOT NULL;

-- ============================================================================
-- 4. ENSURE STORAGE BUCKET EXISTS (course-files)
-- ============================================================================

-- Note: Storage buckets are typically created via Supabase Dashboard or API
-- This is a reminder that the bucket should exist
-- The bucket 'course-files' should be created with:
-- - Public: true (or false with signed URLs)
-- - File size limit: 500MB (for videos) or 50MB (for other files)
-- - Allowed MIME types: video/*, image/*, application/pdf, etc.

-- ============================================================================
-- 5. CREATE FUNCTION TO UPDATE updated_at TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION update_chapter_contents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for chapter_contents
DROP TRIGGER IF EXISTS trigger_update_chapter_contents_updated_at ON public.chapter_contents;
CREATE TRIGGER trigger_update_chapter_contents_updated_at
    BEFORE UPDATE ON public.chapter_contents
    FOR EACH ROW
    EXECUTE FUNCTION update_chapter_contents_updated_at();

-- ============================================================================
-- 6. ADD HELPER FUNCTION TO GET STORAGE URL
-- ============================================================================

-- This function can be used to generate storage URLs
-- Note: In practice, URLs are generated client-side using Supabase Storage API
-- This is just a placeholder for documentation

COMMENT ON TABLE public.chapter_contents IS 
'Stores all content items for chapters. Supports videos, PDFs, images, text, and other media types. 
Storage paths follow the pattern: courses/{courseId}/chapters/{chapterId}/{contentType}/{fileName}';

COMMENT ON COLUMN public.chapter_contents.storage_path IS 
'Path in Supabase Storage bucket. Format: courses/{courseId}/chapters/{chapterId}/{contentType}/{fileName}';

COMMENT ON COLUMN public.chapter_contents.content_url IS 
'Public URL to access the content. Can be Supabase Storage public URL or external URL (e.g., YouTube)';

COMMENT ON COLUMN public.chapter_contents.content_metadata IS 
'JSONB object storing additional metadata: file size, mime type, dimensions, duration, etc.';
















