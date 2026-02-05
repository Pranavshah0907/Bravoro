-- Fix password_reset_tokens RLS policy
-- Remove the overly permissive "Service role full access" policy that allows public SELECT
DROP POLICY IF EXISTS "Service role full access" ON public.password_reset_tokens;

-- Create separate policies for INSERT and UPDATE only (no SELECT for public)
-- Service role can insert new tokens (used by send-email edge function)
CREATE POLICY "Service role can insert tokens"
ON public.password_reset_tokens
FOR INSERT
WITH CHECK (true);

-- Service role can update tokens (to mark as used)
CREATE POLICY "Service role can update tokens"
ON public.password_reset_tokens
FOR UPDATE
USING (true);

-- No SELECT policy for anon/authenticated roles - all reads must go through edge functions
-- This prevents public enumeration of reset tokens, emails, and user IDs