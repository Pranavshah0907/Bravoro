-- M1.5 — Expand custom_field_mappings JSONB from M1 narrow shape (4 slots) to
-- M1.5 canonical 13-slot shape, and add update_crm_field_mappings RPC for
-- user-driven mapping edits via the new field-mapping UI.

-- Part A: Reshape existing rows (idempotent — only rows still in M1 shape).
--
-- Detection: a row is in M1.5 shape iff person.firstName key exists. Rows
-- created after M1.5 ships go through the rewritten autoMapCustomFields and
-- already have the canonical shape, so this guard skips them.
UPDATE public.integrations
SET custom_field_mappings = jsonb_build_object(
  'person', jsonb_build_object(
    'firstName',   '["first_name"]'::jsonb,
    'lastName',    '["last_name"]'::jsonb,
    'email',       '["email"]'::jsonb,
    'mobilePhone', '[]'::jsonb,
    'directPhone', '[]'::jsonb,
    'jobTitle',    '["job_title"]'::jsonb,
    'linkedin',    COALESCE(custom_field_mappings->'person'->'linkedinField', '[]'::jsonb),
    'website',     COALESCE(custom_field_mappings->'person'->'websiteField', '[]'::jsonb)
  ),
  'org', jsonb_build_object(
    'name',     '["name"]'::jsonb,
    'domain',   '[]'::jsonb,
    'website',  ('["website"]'::jsonb || COALESCE(custom_field_mappings->'org'->'websiteField', '[]'::jsonb)),
    'linkedin', '[]'::jsonb,
    'industry', COALESCE(custom_field_mappings->'org'->'practiceType', '[]'::jsonb)
  )
)
WHERE crm_type = 'pipedrive'
  AND (custom_field_mappings->'person'->'firstName') IS NULL;

-- Part B: New RPC for user-driven mapping updates.
CREATE OR REPLACE FUNCTION public.update_crm_field_mappings(
  p_integration_id uuid,
  p_mappings jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.integrations
  SET custom_field_mappings = p_mappings,
      updated_at = now()
  WHERE id = p_integration_id
    AND status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration % not found or not connected', p_integration_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_crm_field_mappings(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_crm_field_mappings(uuid, jsonb) TO service_role;
