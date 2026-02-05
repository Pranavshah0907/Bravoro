-- Fix api_slots RLS: Remove broad policy that allows all authenticated users to read
-- This table is internal state and should only be accessible via service role (edge functions)

-- Remove the overly broad policy
DROP POLICY IF EXISTS "Service role full access on api_slots" ON public.api_slots;

-- Create policy that explicitly targets service_role only
-- Note: In Postgres, policies with TO service_role only apply to that role
-- Regular authenticated/anon users will have no access (default deny)
CREATE POLICY "Service role can manage api_slots"
ON public.api_slots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Similarly fix request_queue - users can view their own entries via searches ownership check
-- but service role needs full access for queue management
DROP POLICY IF EXISTS "Service role full access on request_queue" ON public.request_queue;

-- Create policy explicitly for service_role
CREATE POLICY "Service role can manage request_queue"
ON public.request_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);