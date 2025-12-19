-- Create storage bucket for course files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-files',
  'course-files',
  true,
  52428800, -- 50MB limit
  ARRAY[
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'audio/mp3',
    'audio/wav',
    'audio/m4a',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create RLS policies for course-files bucket
DROP POLICY IF EXISTS "Authenticated users can upload course files" ON storage.objects;
CREATE POLICY "Authenticated users can upload course files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'course-files' AND
    auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Authenticated users can view course files" ON storage.objects;
CREATE POLICY "Authenticated users can view course files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'course-files' AND
    auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Admins can manage course files" ON storage.objects;
CREATE POLICY "Admins can manage course files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'course-files' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Teachers can manage their course files" ON storage.objects;
CREATE POLICY "Teachers can manage their course files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'course-files' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );
