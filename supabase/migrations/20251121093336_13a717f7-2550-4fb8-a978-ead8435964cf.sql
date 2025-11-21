-- Allow authenticated users to read files from the 'results' bucket
CREATE POLICY "Authenticated can read results files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'results');