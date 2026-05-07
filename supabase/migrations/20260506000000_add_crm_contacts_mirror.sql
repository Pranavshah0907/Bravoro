-- pg_trgm enables fuzzy name matching via similarity()
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Workspace-scoped mirror of CRM Persons. One row per Pipedrive Person.
CREATE TABLE public.crm_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id    uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  external_id       text NOT NULL,
  name              text,
  email_normalized  text,
  emails_all        text[] NOT NULL DEFAULT '{}',
  domain            text,
  phone_normalized  text,
  raw               jsonb NOT NULL,
  last_synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_id)
);

CREATE INDEX idx_crm_contacts_integration    ON public.crm_contacts(integration_id);
CREATE INDEX idx_crm_contacts_email          ON public.crm_contacts(integration_id, email_normalized);
CREATE INDEX idx_crm_contacts_domain         ON public.crm_contacts(integration_id, domain);
CREATE INDEX idx_crm_contacts_emails_all_gin ON public.crm_contacts USING GIN (emails_all);
CREATE INDEX idx_crm_contacts_name_trgm      ON public.crm_contacts USING GIN (name gin_trgm_ops);

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
-- No authenticated-role policies. Edge functions read/write as service role
-- (which bypasses RLS by design).

-- Sync state on the existing integrations table
ALTER TABLE public.integrations
  ADD COLUMN contacts_last_synced_at  timestamptz,
  ADD COLUMN contacts_initial_synced  boolean NOT NULL DEFAULT false,
  ADD COLUMN contacts_sync_error      text;

COMMENT ON COLUMN public.integrations.contacts_last_synced_at IS
  'Timestamp passed as the >= filter on the next delta sync. NULL => run full backfill.';
COMMENT ON COLUMN public.integrations.contacts_initial_synced IS
  'False until the post-connect full backfill completes. Used by dedup-check to fail-open gracefully during the warm-up window.';
COMMENT ON COLUMN public.integrations.contacts_sync_error IS
  'Last sync error message (truncated). Does NOT change integrations.status — sync failures are separate from connection health.';
