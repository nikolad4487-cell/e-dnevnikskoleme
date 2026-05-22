-- Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Enable RLS on storage.objects if not enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policies for storage.objects

-- SELECT
CREATE POLICY "Allow authenticated users to select objects in school-assets" ON storage.objects
FOR SELECT USING (bucket_id = 'school-assets' AND auth.role() = 'authenticated');

-- INSERT
CREATE POLICY "Allow authenticated users to insert objects in school-assets" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'school-assets' AND auth.role() = 'authenticated');

-- UPDATE
CREATE POLICY "Allow authenticated users to update objects in school-assets" ON storage.objects
FOR UPDATE USING (bucket_id = 'school-assets' AND auth.role() = 'authenticated');

-- DELETE
CREATE POLICY "Allow authenticated users to delete objects in school-assets" ON storage.objects
FOR DELETE USING (bucket_id = 'school-assets' AND auth.role() = 'authenticated');
