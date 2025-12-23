-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated can read results files" ON storage.objects;

-- Create user-scoped policy based on searches table ownership
CREATE POLICY "Users can read own search results files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'results' AND
  auth.uid() IN (
    SELECT user_id FROM public.searches 
    WHERE id::text = split_part(name, '_result.xlsx', 1)
  )
);

-- Allow admins to read all result files
CREATE POLICY "Admins can read all results files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'results' AND
  public.has_role(auth.uid(), 'admin'::app_role)
);