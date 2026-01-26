-- Add admin SELECT policy to credit_usage table so admins can view all users' credit data
CREATE POLICY "Admins can view all credit usage"
ON public.credit_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));