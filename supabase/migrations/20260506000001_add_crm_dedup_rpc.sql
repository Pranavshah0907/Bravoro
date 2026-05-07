-- Layer 3 fuzzy match for crm-dedup-check: same domain + similar name
-- via pg_trgm.similarity(). Returns the best match above the threshold,
-- or no rows.
CREATE OR REPLACE FUNCTION public.crm_contact_fuzzy_name_match(
  p_integration_id uuid,
  p_domain         text,
  p_name           text,
  p_threshold      float8 DEFAULT 0.6
) RETURNS TABLE (external_id text, similarity_score float4)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT external_id, similarity(name, p_name) AS similarity_score
  FROM public.crm_contacts
  WHERE integration_id = p_integration_id
    AND domain = p_domain
    AND name IS NOT NULL
    AND similarity(name, p_name) > p_threshold
  ORDER BY similarity(name, p_name) DESC
  LIMIT 1;
$$;
