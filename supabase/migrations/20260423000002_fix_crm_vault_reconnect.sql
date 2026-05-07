-- Follow-up to 20260423000000: address code review findings.
--
-- 1. encrypt_integration_token: use vault.update_secret on reconnect instead of
--    always calling vault.create_secret. Prevents orphaned vault.secrets rows
--    when a workspace reconnects the same CRM.
-- 2. integration_secrets RLS: make the "service role only" intent explicit via
--    TO service_role USING (true) rather than USING (false), matching the
--    project pattern established in 20260205141129.
-- 3. Document the write-policy-absence on integration_field_metadata.

CREATE OR REPLACE FUNCTION public.encrypt_integration_token(
  p_integration_id uuid,
  p_token text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing_secret_id uuid;
  v_secret_id uuid;
BEGIN
  SELECT vault_secret_id INTO v_existing_secret_id
  FROM public.integration_secrets
  WHERE integration_id = p_integration_id;

  IF v_existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_secret_id, p_token);
    RETURN v_existing_secret_id;
  END IF;

  SELECT vault.create_secret(
    p_token,
    'integration_' || p_integration_id::text,
    'Encrypted CRM API token for integration ' || p_integration_id::text
  ) INTO v_secret_id;

  INSERT INTO public.integration_secrets (integration_id, vault_secret_id)
  VALUES (p_integration_id, v_secret_id);

  RETURN v_secret_id;
END;
$$;

DROP POLICY IF EXISTS "service role only secrets" ON public.integration_secrets;

CREATE POLICY "service role only secrets"
  ON public.integration_secrets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.integration_field_metadata IS
'Cached CRM field metadata per integration, per object type. Writes are performed exclusively by service_role RPCs (finalize_crm_connection, refresh_crm_metadata) — no write policies for authenticated users is intentional.';
