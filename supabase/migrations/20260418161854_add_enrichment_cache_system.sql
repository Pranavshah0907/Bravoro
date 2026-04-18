-- 1. Add provider IDs and per-contact credit fields to master_contacts
ALTER TABLE master_contacts
  ADD COLUMN IF NOT EXISTS cognism_person_id TEXT,
  ADD COLUMN IF NOT EXISTS apollo_person_id TEXT,
  ADD COLUMN IF NOT EXISTS cognism_credits_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lusha_credits_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aleads_credits_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apollo_credits_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- Index on provider person IDs for fast lookup
CREATE INDEX IF NOT EXISTS idx_master_contacts_cognism_person_id ON master_contacts (cognism_person_id) WHERE cognism_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_master_contacts_apollo_person_id ON master_contacts (apollo_person_id) WHERE apollo_person_id IS NOT NULL;

-- 2. Create junction table: tracks which users have enriched which contacts
CREATE TABLE IF NOT EXISTS user_enriched_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_contact_id UUID NOT NULL REFERENCES master_contacts(id) ON DELETE CASCADE,
  search_id UUID REFERENCES searches(id) ON DELETE SET NULL,
  credits_charged INTEGER DEFAULT 0,
  enriched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, master_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_uec_user_id ON user_enriched_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_uec_master_contact_id ON user_enriched_contacts (master_contact_id);

-- RLS for user_enriched_contacts
ALTER TABLE user_enriched_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own enrichment records"
  ON user_enriched_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all enrichment records"
  ON user_enriched_contacts FOR ALL
  USING (auth.role() = 'service_role');

-- 3. RPC: check if user has enriched a contact, return data + is_cached flag
--    Returns: { is_cached, contact_data } or null if never enriched by anyone
CREATE OR REPLACE FUNCTION get_user_enriched_contact(
  p_user_id UUID,
  p_cognism_person_id TEXT DEFAULT NULL,
  p_apollo_person_id TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_domain TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_master RECORD;
  v_is_cached BOOLEAN;
BEGIN
  -- Find the contact in master_contacts using multiple strategies
  SELECT * INTO v_master
  FROM master_contacts mc
  WHERE
    (p_cognism_person_id IS NOT NULL AND mc.cognism_person_id = p_cognism_person_id)
    OR (p_apollo_person_id IS NOT NULL AND mc.apollo_person_id = p_apollo_person_id)
    OR (p_first_name IS NOT NULL AND p_domain IS NOT NULL
        AND mc.first_name = p_first_name AND mc.domain = p_domain)
  ORDER BY mc.last_updated_at DESC
  LIMIT 1;

  -- Not found by anyone
  IF v_master IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if THIS user has enriched this contact before
  SELECT EXISTS (
    SELECT 1 FROM user_enriched_contacts
    WHERE user_id = p_user_id AND master_contact_id = v_master.id
  ) INTO v_is_cached;

  -- Return contact data with cache flag
  RETURN jsonb_build_object(
    'is_cached', v_is_cached,
    'master_contact_id', v_master.id,
    'person_id', v_master.person_id,
    'first_name', v_master.first_name,
    'last_name', v_master.last_name,
    'email', v_master.email,
    'email_2', v_master.email_2,
    'phone_1', v_master.phone_1,
    'phone_2', v_master.phone_2,
    'linkedin', v_master.linkedin,
    'title', v_master.title,
    'organization', v_master.organization,
    'domain', v_master.domain,
    'provider', v_master.provider,
    'cognism_person_id', v_master.cognism_person_id,
    'apollo_person_id', v_master.apollo_person_id,
    'cognism_credits_used', v_master.cognism_credits_used,
    'lusha_credits_used', v_master.lusha_credits_used,
    'aleads_credits_used', v_master.aleads_credits_used,
    'apollo_credits_used', v_master.apollo_credits_used
  );
END;
$$;
