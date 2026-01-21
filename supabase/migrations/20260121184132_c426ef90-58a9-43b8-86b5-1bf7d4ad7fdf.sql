-- Add result_type column to search_results table for distinguishing enriched vs missing contacts
ALTER TABLE public.search_results 
ADD COLUMN result_type text DEFAULT 'enriched';