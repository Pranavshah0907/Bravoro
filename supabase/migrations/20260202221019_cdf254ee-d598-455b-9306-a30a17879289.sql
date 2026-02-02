-- Add policy to allow users to view their own contacts from their searches
-- This ensures non-admin users can access contacts from searches they own
CREATE POLICY "Users can view their own contacts"
ON public.master_contacts
FOR SELECT
USING (
  auth.uid() = source_user_id OR
  EXISTS (
    SELECT 1 FROM searches
    WHERE searches.id = master_contacts.source_search_id
    AND searches.user_id = auth.uid()
  ) OR
  has_role(auth.uid(), 'admin'::app_role)
);