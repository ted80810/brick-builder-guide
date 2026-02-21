-- Create storage bucket for manual step images
INSERT INTO storage.buckets (id, name, public)
VALUES ('manual-images', 'manual-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public can view manual images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'manual-images');

-- Allow service role to manage manual images
CREATE POLICY "Service role can manage manual images"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'manual-images')
WITH CHECK (bucket_id = 'manual-images');