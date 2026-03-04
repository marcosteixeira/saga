-- Create the campaign-images bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-images', 'campaign-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on all objects in campaign-images
CREATE POLICY "Public read campaign images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-images');

-- Allow service role inserts (Edge Functions use service role key)
CREATE POLICY "Service role write campaign images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'campaign-images');
