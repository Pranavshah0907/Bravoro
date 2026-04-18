-- Add contact-type credit columns to credit_usage
ALTER TABLE credit_usage
  ADD COLUMN mobile_phone_contacts integer NOT NULL DEFAULT 0,
  ADD COLUMN mobile_phone_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN direct_phone_contacts integer NOT NULL DEFAULT 0,
  ADD COLUMN direct_phone_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN email_only_contacts integer NOT NULL DEFAULT 0,
  ADD COLUMN email_only_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN jobs_count integer NOT NULL DEFAULT 0,
  ADD COLUMN jobs_credits integer NOT NULL DEFAULT 0;

-- Add a comment documenting the credit multipliers
COMMENT ON COLUMN credit_usage.mobile_phone_credits IS 'contacts_with_mobile_phone * 4';
COMMENT ON COLUMN credit_usage.direct_phone_credits IS 'contacts_with_direct_phone_only * 3';
COMMENT ON COLUMN credit_usage.email_only_credits IS 'email_only_contacts * 2';
COMMENT ON COLUMN credit_usage.jobs_credits IS 'total_jobs_found_count * 1';
