-- Add cognism_credits and theirstack_credits columns to credit_usage table
ALTER TABLE public.credit_usage
  ADD COLUMN IF NOT EXISTS cognism_credits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS theirstack_credits INTEGER NOT NULL DEFAULT 0;

-- Add CHECK constraints
ALTER TABLE public.credit_usage
  ADD CONSTRAINT check_cognism_credits CHECK (cognism_credits >= 0 AND cognism_credits <= 1000000),
  ADD CONSTRAINT check_theirstack_credits CHECK (theirstack_credits >= 0 AND theirstack_credits <= 1000000);
