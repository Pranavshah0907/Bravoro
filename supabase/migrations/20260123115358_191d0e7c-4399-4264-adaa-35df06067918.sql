-- Add new columns to credit_usage for detailed credit tracking
ALTER TABLE public.credit_usage 
ADD COLUMN IF NOT EXISTS contacts_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS enriched_contacts_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS apollo_email_credits integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS apollo_phone_credits integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_credits integer NOT NULL DEFAULT 0;