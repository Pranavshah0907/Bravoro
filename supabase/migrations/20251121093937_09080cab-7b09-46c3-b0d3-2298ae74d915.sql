-- Add DELETE policies for user data privacy (GDPR compliance)

-- Allow users to delete their own job records
CREATE POLICY "Users can delete own jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own search history
CREATE POLICY "Users can delete own searches"
ON public.searches
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own webhook settings
CREATE POLICY "Users can delete own webhook settings"
ON public.webhook_settings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own profile
CREATE POLICY "Users can delete own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = id);