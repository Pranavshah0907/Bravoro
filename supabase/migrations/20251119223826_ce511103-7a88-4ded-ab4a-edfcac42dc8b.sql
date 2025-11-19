-- Drop the incorrect existing policy
DROP POLICY IF EXISTS "Users can view own result files" ON storage.objects;

-- Create correct policy: Users can download result files for their own jobs
CREATE POLICY "Users can download their job results"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'results' 
  AND auth.uid() IN (
    SELECT user_id 
    FROM public.jobs 
    WHERE id::text = split_part(name, '_result.xlsx', 1)
  )
);