-- Allow admins to read all searches (needed for workspace searches PDF export)
CREATE POLICY "Admins can view all searches"
  ON public.searches FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
