-- Allow service role to insert credit usage (for edge functions)
CREATE POLICY "Service role can insert credit usage"
ON public.credit_usage
FOR INSERT
WITH CHECK (true);