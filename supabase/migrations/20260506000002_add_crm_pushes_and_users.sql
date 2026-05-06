-- Spec C: crm_pushes bookkeeping (idempotency + UI status badges)
CREATE TABLE public.crm_pushes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id      uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  search_id           uuid REFERENCES public.searches(id) ON DELETE SET NULL,
  bravoro_record_id   text,
  bravoro_email       text,
  destination_id      text NOT NULL,
  destination_label   text NOT NULL,
  external_deal_id    text,
  external_person_id  text,
  external_org_id     text,
  status              text NOT NULL CHECK (status IN ('success', 'failed')),
  error_message       text,
  pushed_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pushed_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, bravoro_record_id, destination_id)
);

CREATE INDEX idx_crm_pushes_workspace ON public.crm_pushes(workspace_id);
CREATE INDEX idx_crm_pushes_search    ON public.crm_pushes(search_id);
CREATE INDEX idx_crm_pushes_failed    ON public.crm_pushes(status) WHERE status = 'failed';

ALTER TABLE public.crm_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read own pushes"
  ON public.crm_pushes FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "service role only writes"
  ON public.crm_pushes FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service role only updates"
  ON public.crm_pushes FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Cached Pipedrive user list for the owner picker
ALTER TABLE public.integrations
  ADD COLUMN cached_users jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN default_owner_external_id text;

COMMENT ON COLUMN public.integrations.cached_users IS
  'Array of {id, name, email, active_flag} from Pipedrive /v1/users. Refreshed on connect and at every fetchFieldMetadata refresh. Used by the push modal to populate the owner dropdown.';
COMMENT ON COLUMN public.integrations.default_owner_external_id IS
  'Reserved for v1.1 per-destination owner mapping. NULL in v1 (push uses the matched-by-email user, falls back to the user passed in the request).';

-- Add crm_pushes to realtime publication so the UI badges update live
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_pushes;
