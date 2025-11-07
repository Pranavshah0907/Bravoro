-- Alter searches table to support multiple seniority levels and add results per function
ALTER TABLE public.searches 
  ALTER COLUMN seniority TYPE text[] USING ARRAY[seniority]::text[];

ALTER TABLE public.searches 
  ADD COLUMN results_per_function integer DEFAULT 10;