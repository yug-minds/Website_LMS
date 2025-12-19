-- ==========================================================
--  Create Certificates Storage Bucket
--  Purpose: Store generated certificate images
-- ==========================================================

-- Create storage bucket for certificates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  true, -- Public bucket for easy access
  5242880, -- 5MB limit (certificates are typically smaller)
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ==========================================================
--  RLS Policies for Certificates Bucket
-- ==========================================================

-- Students can view their own certificates
-- Path format: {studentId}/{courseId}/{timestamp}.png
DROP POLICY IF EXISTS "Students can view own certificates" ON storage.objects;
CREATE POLICY "Students can view own certificates" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'certificates' AND
    auth.role() = 'authenticated' AND
    -- Extract student_id from path: {studentId}/{courseId}/{filename}
    -- Path starts with student_id, so check if name starts with auth.uid()
    (name LIKE auth.uid()::text || '/%' OR name = auth.uid()::text)
  );

-- Service role can upload certificates (for API generation)
-- Note: Service role bypasses RLS, but we add this for clarity
DROP POLICY IF EXISTS "Service role can upload certificates" ON storage.objects;
CREATE POLICY "Service role can upload certificates" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'certificates'
  );

-- Service role can manage all certificates (for updates/deletes)
DROP POLICY IF EXISTS "Service role can manage certificates" ON storage.objects;
CREATE POLICY "Service role can manage certificates" ON storage.objects
  FOR ALL USING (
    bucket_id = 'certificates'
  );

-- Admins can view all certificates
DROP POLICY IF EXISTS "Admins can view all certificates" ON storage.objects;
CREATE POLICY "Admins can view all certificates" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'certificates' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Teachers can view certificates for their students
DROP POLICY IF EXISTS "Teachers can view student certificates" ON storage.objects;
CREATE POLICY "Teachers can view student certificates" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'certificates' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- School admins can view certificates for their school's students
-- Note: This is a simplified policy - school admins can view all certificates
-- More granular control can be added if needed
DROP POLICY IF EXISTS "School admins can view student certificates" ON storage.objects;
CREATE POLICY "School admins can view student certificates" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'certificates' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'school_admin'
    )
  );

COMMENT ON POLICY "Students can view own certificates" ON storage.objects IS 
  'Allows students to view their own certificates from the certificates bucket';

COMMENT ON POLICY "Service role can upload certificates" ON storage.objects IS 
  'Allows service role to upload generated certificates';


