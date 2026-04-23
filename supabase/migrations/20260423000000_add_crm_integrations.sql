-- Vault extension (one-time)
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

-- Main integrations table (workspace-scoped)
CREATE TABLE public.integrations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crm_type                 text NOT NULL CHECK (crm_type IN ('pipedrive')),
  account_identifier       text NOT NULL,
  account_display_name     text NOT NULL,
  status                   text NOT NULL CHECK (status IN ('connected', 'error')),
  last_checked_at          timestamptz NOT NULL DEFAULT now(),
  last_error               text,
  custom_field_mappings    jsonb NOT NULL DEFAULT '{}',
  connected_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, crm_type)
);

CREATE INDEX idx_integrations_workspace ON public.integrations(workspace_id);
CREATE INDEX idx_integrations_status_error ON public.integrations(status) WHERE status = 'error';

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Secrets pointer table (service-role only)
CREATE TABLE public.integration_secrets (
  integration_id   uuid PRIMARY KEY REFERENCES public.integrations(id) ON DELETE CASCADE,
  vault_secret_id  uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Field metadata cache
CREATE TABLE public.integration_field_metadata (
  integration_id  uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  object_type     text NOT NULL CHECK (object_type IN ('person', 'org')),
  fields_json     jsonb NOT NULL,
  refreshed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, object_type)
);

-- RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_field_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage own integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "admins manage all integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "service role only secrets"
  ON public.integration_secrets FOR ALL USING (false);

CREATE POLICY "workspace members read own metadata"
  ON public.integration_field_metadata FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.integrations i
      WHERE i.id = integration_field_metadata.integration_id
      AND i.workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "admins read all metadata"
  ON public.integration_field_metadata FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RPC: encrypt_integration_token
CREATE OR REPLACE FUNCTION public.encrypt_integration_token(
  p_integration_id uuid,
  p_token text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault.create_secret(
    p_token,
    'integration_' || p_integration_id::text,
    'Encrypted CRM API token for integration ' || p_integration_id::text
  ) INTO v_secret_id;

  INSERT INTO public.integration_secrets (integration_id, vault_secret_id)
  VALUES (p_integration_id, v_secret_id)
  ON CONFLICT (integration_id) DO UPDATE
  SET vault_secret_id = EXCLUDED.vault_secret_id;

  RETURN v_secret_id;
END;
$$;

-- RPC: decrypt_integration_token
CREATE OR REPLACE FUNCTION public.decrypt_integration_token(
  p_integration_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT ds.decrypted_secret INTO v_token
  FROM vault.decrypted_secrets ds
  JOIN public.integration_secrets isec ON isec.vault_secret_id = ds.id
  WHERE isec.integration_id = p_integration_id;

  RETURN v_token;
END;
$$;

-- RPC: delete_integration_cascade
CREATE OR REPLACE FUNCTION public.delete_integration_cascade(
  p_integration_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
  FROM public.integration_secrets
  WHERE integration_id = p_integration_id;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  DELETE FROM public.integrations WHERE id = p_integration_id;
END;
$$;

-- RPC: finalize_crm_connection (atomic write of integration row + Vault secret + metadata)
CREATE OR REPLACE FUNCTION public.finalize_crm_connection(
  p_workspace_id uuid,
  p_crm_type text,
  p_account_identifier text,
  p_account_display_name text,
  p_custom_field_mappings jsonb,
  p_connected_by_user_id uuid,
  p_token text,
  p_person_fields jsonb,
  p_org_fields jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_integration_id uuid;
BEGIN
  INSERT INTO public.integrations (
    workspace_id, crm_type, account_identifier, account_display_name,
    status, last_checked_at, last_error, custom_field_mappings, connected_by_user_id
  ) VALUES (
    p_workspace_id, p_crm_type, p_account_identifier, p_account_display_name,
    'connected', now(), NULL, p_custom_field_mappings, p_connected_by_user_id
  )
  ON CONFLICT (workspace_id, crm_type) DO UPDATE
  SET account_identifier    = EXCLUDED.account_identifier,
      account_display_name  = EXCLUDED.account_display_name,
      status                = 'connected',
      last_checked_at       = now(),
      last_error            = NULL,
      custom_field_mappings = EXCLUDED.custom_field_mappings,
      connected_by_user_id  = EXCLUDED.connected_by_user_id,
      updated_at            = now()
  RETURNING id INTO v_integration_id;

  PERFORM public.encrypt_integration_token(v_integration_id, p_token);

  INSERT INTO public.integration_field_metadata (integration_id, object_type, fields_json, refreshed_at)
  VALUES (v_integration_id, 'person', p_person_fields, now())
  ON CONFLICT (integration_id, object_type) DO UPDATE
  SET fields_json = EXCLUDED.fields_json, refreshed_at = now();

  INSERT INTO public.integration_field_metadata (integration_id, object_type, fields_json, refreshed_at)
  VALUES (v_integration_id, 'org', p_org_fields, now())
  ON CONFLICT (integration_id, object_type) DO UPDATE
  SET fields_json = EXCLUDED.fields_json, refreshed_at = now();

  RETURN v_integration_id;
END;
$$;

-- RPC: refresh_crm_metadata (atomic update without touching the Vault secret)
CREATE OR REPLACE FUNCTION public.refresh_crm_metadata(
  p_integration_id uuid,
  p_custom_field_mappings jsonb,
  p_person_fields jsonb,
  p_org_fields jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.integrations
  SET custom_field_mappings = p_custom_field_mappings,
      last_checked_at       = now(),
      last_error            = NULL,
      status                = 'connected',
      updated_at            = now()
  WHERE id = p_integration_id;

  INSERT INTO public.integration_field_metadata (integration_id, object_type, fields_json, refreshed_at)
  VALUES (p_integration_id, 'person', p_person_fields, now())
  ON CONFLICT (integration_id, object_type) DO UPDATE
  SET fields_json = EXCLUDED.fields_json, refreshed_at = now();

  INSERT INTO public.integration_field_metadata (integration_id, object_type, fields_json, refreshed_at)
  VALUES (p_integration_id, 'org', p_org_fields, now())
  ON CONFLICT (integration_id, object_type) DO UPDATE
  SET fields_json = EXCLUDED.fields_json, refreshed_at = now();
END;
$$;

-- Lock down RPCs to service_role
REVOKE ALL ON FUNCTION public.encrypt_integration_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_integration_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_integration_cascade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_crm_connection(uuid, text, text, text, jsonb, uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_crm_metadata(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.encrypt_integration_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_integration_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_integration_cascade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_crm_connection(uuid, text, text, text, jsonb, uuid, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_crm_metadata(uuid, jsonb, jsonb, jsonb) TO service_role;
