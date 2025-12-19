-- Drop the existing check constraint and create a new one that includes bulk_people_enrichment
ALTER TABLE public.searches DROP CONSTRAINT IF EXISTS searches_search_type_check;

ALTER TABLE public.searches ADD CONSTRAINT searches_search_type_check 
CHECK (search_type IN ('manual', 'bulk', 'bulk_people_enrichment'));