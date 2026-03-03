-- Supabase Storage bucket for campaign images
-- Run this in the Supabase SQL editor or via the dashboard

-- Create the campaign-images bucket (public read access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-images',
  'campaign-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to campaign images
CREATE POLICY "Public read access for campaign images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'campaign-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload campaign images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-images');

-- Allow authenticated users to update/delete their own uploads
CREATE POLICY "Authenticated users can update campaign images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'campaign-images');

CREATE POLICY "Authenticated users can delete campaign images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-images');
