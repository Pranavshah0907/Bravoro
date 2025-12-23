-- Add CHECK constraints to credit_usage table for server-side validation
ALTER TABLE credit_usage
ADD CONSTRAINT check_apollo_credits 
  CHECK (apollo_credits >= 0 AND apollo_credits <= 1000000),
ADD CONSTRAINT check_cleon1_credits 
  CHECK (cleon1_credits >= 0 AND cleon1_credits <= 1000000),
ADD CONSTRAINT check_lusha_credits 
  CHECK (lusha_credits >= 0 AND lusha_credits <= 1000000);