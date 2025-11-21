-- Drop the old constraint first
ALTER TABLE searches DROP CONSTRAINT IF EXISTS searches_search_type_check;

-- Update any existing 'excel' rows to 'bulk'
UPDATE searches SET search_type = 'bulk' WHERE search_type = 'excel';

-- Add the new constraint that allows 'manual' and 'bulk'
ALTER TABLE searches ADD CONSTRAINT searches_search_type_check 
CHECK (search_type = ANY (ARRAY['manual'::text, 'bulk'::text]));