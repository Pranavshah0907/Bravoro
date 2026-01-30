-- Drop the existing constraint
ALTER TABLE searches DROP CONSTRAINT IF EXISTS searches_status_check;

-- Recreate with 'queued' and 'pending' statuses added
ALTER TABLE searches ADD CONSTRAINT searches_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'queued'::text, 'completed'::text, 'error'::text]));