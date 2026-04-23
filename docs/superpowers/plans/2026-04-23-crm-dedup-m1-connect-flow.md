# CRM Dedup — Milestone 1 (Connect Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the end-to-end CRM connect flow (Pipedrive only) — user connects their Pipedrive account from Settings → Integrations, Bravoro verifies the token, caches Pipedrive field metadata, runs auto-mapping, stores the token in Supabase Vault, and keeps the connection healthy via a daily cron. No dedup check yet (that's M2).

**Architecture:** Workspace-scoped integrations, hard-delete on disconnect, binary state machine (`connected` / `error`), adapter pattern in `supabase/functions/_shared/adapters/` scoped to M1 methods only, Supabase Vault via RPC wrapper for encrypted token storage, 4 new edge functions, 6 new React components, 1 new n8n cron workflow.

**Tech Stack:** Deno (Supabase edge functions), TypeScript, React 18 + Vite, Tailwind + shadcn/ui, Supabase (Postgres + Vault + RLS + Realtime), `jose` for JWT verification, native `fetch` for Pipedrive API, n8n for daily cron.

**Specs this plan implements:**
- `docs/superpowers/specs/2026-04-23-crm-dedup-m1-connect-flow-design.md` (primary)
- `docs/superpowers/specs/2026-04-23-crm-dedup-roadmap.md` (shared context)

---

## Working branch and preflight

This feature will live on a new branch `feat/crm-dedup-m1`. Do not merge M1 into main until all 18 scenarios in §9 of the M1 design spec pass.

- [ ] **Preflight 1: Verify Supabase Vault is enabled on the project**

Run:
```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT extname FROM pg_extension WHERE extname = 'supabase_vault';"
```
Expected: returns one row with `supabase_vault`. If empty, either run `CREATE EXTENSION supabase_vault CASCADE;` via dashboard SQL editor, or confirm the extension is available and the migration in Task 1 will handle it.

- [ ] **Preflight 2: Create and switch to the working branch**

```bash
git checkout -b feat/crm-dedup-m1
git push -u origin feat/crm-dedup-m1
```

---

## Phase 1 — Database migration and Vault wiring

### Task 1: Write the migration file

**Files:**
- Create: `supabase/migrations/20260423000000_add_crm_integrations.sql`

- [ ] **Step 1: Create the migration file with full schema, RLS, and RPCs**

File content (copy exactly):
```sql
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
```

- [ ] **Step 2: Apply the migration against the linked Supabase project**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe db push --linked
```
Expected: output ends with "Finished supabase db push" with no errors. If any error references a missing `update_updated_at_column` or `workspaces` table, stop and report — base schema is not as expected.

- [ ] **Step 3: Smoke-test Vault via the RPC pair**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT public.encrypt_integration_token('00000000-0000-0000-0000-000000000001'::uuid, 'test-token-plaintext');"
```
This will fail with a foreign-key error because integration id doesn't exist — and that's the point. We expect the failure signature `violates foreign key constraint "integration_secrets_integration_id_fkey"`. Any other error (e.g., "function vault.create_secret does not exist") means Vault isn't wired up correctly.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260423000000_add_crm_integrations.sql
git commit -m "feat(crm): add integrations schema + Vault RPCs

Creates integrations, integration_secrets, integration_field_metadata tables
with workspace-scoped RLS. Adds five SECURITY DEFINER RPCs for Vault-backed
token encryption/decryption, cascade-delete, and atomic connect/refresh."
```

---

### Task 2: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Regenerate types**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe gen types typescript --linked > src/integrations/supabase/types.ts
```

- [ ] **Step 2: Verify the file contains the new tables**

Run:
```bash
grep -c "integrations\|integration_secrets\|integration_field_metadata" src/integrations/supabase/types.ts
```
Expected: at least 6 matches (each table referenced multiple times in the generated types).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```
Expected: build succeeds. If it fails, the migration may have produced unexpected types — inspect the diff before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate Supabase types for CRM integrations schema"
```

---

## Phase 2 — Adapter framework

### Task 3: Adapter types module

**Files:**
- Create: `supabase/functions/_shared/adapters/types.ts`

- [ ] **Step 1: Create the adapter types file**

File content:
```typescript
// M1-scoped CRM adapter interface. M2 will extend with dedupCheck.

export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
}

export interface ConnectionResult {
  ok: boolean;
  accountIdentifier?: string;
  accountDisplayName?: string;
  error?: string;
}

export interface FieldMetadata {
  person: FieldDef[];
  org: FieldDef[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  isCustom: boolean;
}

export interface CustomFieldMappings {
  person: { websiteField: string[]; linkedinField: string[] };
  org: { websiteField: string[]; practiceType: string[] };
}

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid or revoked CRM token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/adapters/types.ts
git commit -m "feat(crm): adapter types (M1-scoped interface)"
```

---

### Task 4: Adapter registry

**Files:**
- Create: `supabase/functions/_shared/adapters/registry.ts`

- [ ] **Step 1: Create the registry file**

File content:
```typescript
import type { CrmAdapter } from './types.ts';
import { PipedriveAdapter } from './pipedrive.ts';

const REGISTRY: Record<string, new () => CrmAdapter> = {
  pipedrive: PipedriveAdapter,
};

export function getAdapter(crmType: string): CrmAdapter {
  const Ctor = REGISTRY[crmType];
  if (!Ctor) throw new Error(`Unknown CRM type: ${crmType}`);
  return new Ctor();
}

export function isKnownCrmType(crmType: string): boolean {
  return crmType in REGISTRY;
}
```

- [ ] **Step 2: Commit**

Note: registry imports `PipedriveAdapter` which doesn't exist yet — this will fail to type-check until Task 5. We commit the registry now so the dependency direction is clear; Deno edge functions are only type-checked at deploy time, so local tooling won't stop us.

```bash
git add supabase/functions/_shared/adapters/registry.ts
git commit -m "feat(crm): adapter registry"
```

---

### Task 5: Pipedrive adapter — `testConnection` + HTTP helper

**Files:**
- Create: `supabase/functions/_shared/adapters/pipedrive.ts`

- [ ] **Step 1: Create the adapter skeleton with the HTTP helper and testConnection**

File content:
```typescript
import type {
  CrmAdapter, ConnectionResult, FieldMetadata, FieldDef, CustomFieldMappings,
} from './types.ts';
import { InvalidTokenError } from './types.ts';

const WEBSITE_KEYWORDS = ['website', 'webseite', 'homepage', 'url', 'web', 'domain'];
const LINKEDIN_KEYWORDS = ['linkedin'];

export class PipedriveAdapter implements CrmAdapter {
  async testConnection(token: string): Promise<ConnectionResult> {
    try {
      const res = await fetchJson(
        `https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(token)}`
      );
      const user = res.data;
      if (!user || !user.company_domain) {
        return { ok: false, error: 'Unexpected response from Pipedrive. Try reconnecting.' };
      }
      return {
        ok: true,
        accountIdentifier: user.company_domain,
        accountDisplayName: `${user.name} (${user.company_domain}.pipedrive.com)`,
      };
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        return {
          ok: false,
          error: 'Invalid API token. Check that you copied it correctly from Pipedrive → Personal preferences → API.',
        };
      }
      return { ok: false, error: "Couldn't reach Pipedrive. Try again in a moment." };
    }
  }

  async fetchFieldMetadata(_token: string): Promise<FieldMetadata> {
    throw new Error('Not implemented yet — see Task 6');
  }

  autoMapCustomFields(_metadata: FieldMetadata): CustomFieldMappings {
    throw new Error('Not implemented yet — see Task 7');
  }
}

async function fetchJson(url: string, attempt = 1): Promise<any> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) {
      throw new InvalidTokenError();
    }
    if (res.status === 429 && attempt <= 3) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 250 * attempt;
      await new Promise(r => setTimeout(r, retryAfter));
      return fetchJson(url, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`Pipedrive ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Smoke-test `testConnection` against a real token**

Create a throwaway test file `/tmp/test-pipedrive.ts` (outside the repo, do not commit):
```typescript
import { PipedriveAdapter } from './supabase/functions/_shared/adapters/pipedrive.ts';
const token = Deno.env.get('PIPEDRIVE_TEST_TOKEN') ?? '';
const adapter = new PipedriveAdapter();
console.log(JSON.stringify(await adapter.testConnection(token), null, 2));
```
Run:
```bash
PIPEDRIVE_TEST_TOKEN=<your-real-token> deno run --allow-net --allow-env /tmp/test-pipedrive.ts
```
Expected with valid token: `{ok: true, accountIdentifier: "<your-domain>", accountDisplayName: "<name> (<domain>.pipedrive.com)"}`.
Expected with garbage token: `{ok: false, error: "Invalid API token..."}`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/adapters/pipedrive.ts
git commit -m "feat(crm): Pipedrive adapter testConnection + fetchJson helper"
```

---

### Task 6: Pipedrive adapter — `fetchFieldMetadata`

**Files:**
- Modify: `supabase/functions/_shared/adapters/pipedrive.ts`

- [ ] **Step 1: Replace the `fetchFieldMetadata` stub with the real implementation**

Find the `async fetchFieldMetadata` method (currently throws "Not implemented yet — see Task 6") and replace its body with:

```typescript
  async fetchFieldMetadata(token: string): Promise<FieldMetadata> {
    const [personRes, orgRes] = await Promise.all([
      fetchJson(`https://api.pipedrive.com/v1/personFields?api_token=${encodeURIComponent(token)}&limit=500`),
      fetchJson(`https://api.pipedrive.com/v1/organizationFields?api_token=${encodeURIComponent(token)}&limit=500`),
    ]);
    return {
      person: (personRes.data ?? []).map(normalizeField),
      org: (orgRes.data ?? []).map(normalizeField),
    };
  }
```

Then at the bottom of the file (after the class, before `fetchJson`), add:
```typescript
function normalizeField(raw: any): FieldDef {
  return {
    key: raw.key,
    label: raw.name,
    type: raw.field_type,
    isCustom: raw.edit_flag === true,
  };
}
```

- [ ] **Step 2: Smoke-test against a real token**

Append to `/tmp/test-pipedrive.ts`:
```typescript
const meta = await adapter.fetchFieldMetadata(token);
console.log(`person fields: ${meta.person.length}, org fields: ${meta.org.length}`);
console.log('first 3 person fields:', meta.person.slice(0, 3));
```
Run again:
```bash
PIPEDRIVE_TEST_TOKEN=<token> deno run --allow-net --allow-env /tmp/test-pipedrive.ts
```
Expected: non-zero counts, field objects with `key`, `label`, `type`, `isCustom`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/adapters/pipedrive.ts
git commit -m "feat(crm): Pipedrive adapter fetchFieldMetadata"
```

---

### Task 7: Pipedrive adapter — `autoMapCustomFields` with tests

**Files:**
- Modify: `supabase/functions/_shared/adapters/pipedrive.ts`
- Create: `supabase/functions/_shared/adapters/pipedrive.test.ts`

- [ ] **Step 1: Write the failing test first (TDD)**

Create `supabase/functions/_shared/adapters/pipedrive.test.ts`:
```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { PipedriveAdapter } from "./pipedrive.ts";
import type { FieldMetadata } from "./types.ts";

function customField(key: string, label: string): any {
  return { key, label, type: 'varchar', isCustom: true };
}
function standardField(key: string, label: string): any {
  return { key, label, type: 'varchar', isCustom: false };
}

Deno.test("autoMapCustomFields: maps website keywords on person fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [
      standardField('name', 'Name'),
      customField('hash_web1', 'Website'),
      customField('hash_web2', 'Webseite'),
      customField('hash_hp', 'Homepage'),
      customField('hash_other', 'Lieblingsfarbe'),
    ],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.websiteField.sort(), ['hash_hp', 'hash_web1', 'hash_web2']);
  assertEquals(mapping.person.linkedinField, []);
});

Deno.test("autoMapCustomFields: maps linkedin keywords on person fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [customField('hash_li', 'LinkedIn Profile')],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.linkedinField, ['hash_li']);
});

Deno.test("autoMapCustomFields: maps website keywords on org fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [],
    org: [customField('hash_orgweb', 'Company Website')],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.org.websiteField, ['hash_orgweb']);
});

Deno.test("autoMapCustomFields: ignores standard (non-custom) fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [standardField('name', 'Website')],
    org: [standardField('website', 'Website')],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.websiteField, []);
  assertEquals(mapping.org.websiteField, []);
});

Deno.test("autoMapCustomFields: returns empty shape with practiceType slot when no matches", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = { person: [], org: [] };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping, {
    person: { websiteField: [], linkedinField: [] },
    org: { websiteField: [], practiceType: [] },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd supabase/functions/_shared/adapters && deno test --allow-net --allow-env pipedrive.test.ts
```
Expected: all 5 tests FAIL with an error mentioning "Not implemented yet".

- [ ] **Step 3: Replace the `autoMapCustomFields` stub with the real implementation**

In `supabase/functions/_shared/adapters/pipedrive.ts`, replace the `autoMapCustomFields` method body with:

```typescript
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings {
    const mapping: CustomFieldMappings = {
      person: { websiteField: [], linkedinField: [] },
      org: { websiteField: [], practiceType: [] },
    };
    for (const f of metadata.person) {
      if (!f.isCustom) continue;
      if (labelMatches(f.label, WEBSITE_KEYWORDS))  mapping.person.websiteField.push(f.key);
      if (labelMatches(f.label, LINKEDIN_KEYWORDS)) mapping.person.linkedinField.push(f.key);
    }
    for (const f of metadata.org) {
      if (!f.isCustom) continue;
      if (labelMatches(f.label, WEBSITE_KEYWORDS)) mapping.org.websiteField.push(f.key);
    }
    return mapping;
  }
```

And add a helper function below the class:
```typescript
function labelMatches(label: string, keywords: string[]): boolean {
  const lbl = label.toLowerCase();
  return keywords.some(k => lbl.includes(k));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd supabase/functions/_shared/adapters && deno test --allow-net --allow-env pipedrive.test.ts
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/adapters/pipedrive.ts supabase/functions/_shared/adapters/pipedrive.test.ts
git commit -m "feat(crm): Pipedrive autoMapCustomFields + tests"
```

---

## Phase 3 — Edge functions

All edge functions use the project-wide JWT verification pattern from `trigger-n8n-webhook/index.ts`. All deploy with `--no-verify-jwt`.

### Task 8: `crm-test-connection` edge function

**Files:**
- Create: `supabase/functions/crm-test-connection/index.ts`

- [ ] **Step 1: Write the edge function**

File content:
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter, isKnownCrmType } from '../_shared/adapters/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userJwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jose.jwtVerify(userJwt, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      userId = payload.sub as string;
      if (!userId) throw new Error('no sub');
    } catch {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { crm_type, token } = body;
    if (typeof crm_type !== 'string' || typeof token !== 'string' || !token) {
      return json({ ok: false, error: 'Missing crm_type or token.' }, 400);
    }
    if (!isKnownCrmType(crm_type)) {
      return json({ ok: false, error: "This CRM isn't supported yet." }, 400);
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.workspace_id) {
      return json({ ok: false, error: "Your account isn't assigned to a workspace." }, 400);
    }

    const adapter = getAdapter(crm_type);

    const connResult = await adapter.testConnection(token);
    if (!connResult.ok) {
      return json({ ok: false, error: connResult.error });
    }

    let metadata;
    try {
      metadata = await adapter.fetchFieldMetadata(token);
    } catch (err) {
      console.error('fetchFieldMetadata failed', (err as Error).message);
      return json({ ok: false, error: 'Token was rejected when reading fields. Try reconnecting.' });
    }

    const customFieldMappings = adapter.autoMapCustomFields(metadata);

    const { data: integrationId, error: rpcError } = await supabase.rpc('finalize_crm_connection', {
      p_workspace_id: profile.workspace_id,
      p_crm_type: crm_type,
      p_account_identifier: connResult.accountIdentifier,
      p_account_display_name: connResult.accountDisplayName,
      p_custom_field_mappings: customFieldMappings,
      p_connected_by_user_id: userId,
      p_token: token,
      p_person_fields: metadata.person,
      p_org_fields: metadata.org,
    });
    if (rpcError) {
      console.error('finalize_crm_connection failed', rpcError);
      return json({ ok: false, error: 'Failed to save connection. Try again.' }, 500);
    }

    return json({
      ok: true,
      integrationId,
      accountDisplayName: connResult.accountDisplayName,
    });
  } catch (err) {
    console.error('crm-test-connection crash', err);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
```

- [ ] **Step 2: Deploy the function**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions deploy crm-test-connection --no-verify-jwt --project-ref ggvhwxpaovfvoyvzixqw
```
Expected: "Deployed Functions on project..." with no errors.

- [ ] **Step 3: Manual test — valid token**

Get a user JWT first (sign in via the frontend, inspect Network tab for `Authorization: Bearer ...`, copy that JWT). Then:
```bash
curl -X POST "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-test-connection" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"crm_type":"pipedrive","token":"<YOUR_PIPEDRIVE_TOKEN>"}'
```
Expected: `{"ok":true,"integrationId":"<uuid>","accountDisplayName":"<name> (<domain>.pipedrive.com)"}`.

Verify via SQL:
```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT id, crm_type, status, account_display_name, jsonb_pretty(custom_field_mappings) FROM public.integrations;"
```
Expected: one row, `status='connected'`, populated `custom_field_mappings` JSON.

- [ ] **Step 4: Manual test — invalid token**

```bash
curl -X POST "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-test-connection" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"crm_type":"pipedrive","token":"clearly-not-a-real-token"}'
```
Expected: `{"ok":false,"error":"Invalid API token..."}`. No new row created.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/crm-test-connection/index.ts
git commit -m "feat(crm): crm-test-connection edge function"
```

---

### Task 9: `crm-refresh-metadata` edge function

**Files:**
- Create: `supabase/functions/crm-refresh-metadata/index.ts`

- [ ] **Step 1: Write the edge function**

File content:
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter } from '../_shared/adapters/registry.ts';
import { InvalidTokenError } from '../_shared/adapters/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userJwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jose.jwtVerify(userJwt, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      userId = payload.sub as string;
      if (!userId) throw new Error('no sub');
    } catch {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { integration_id } = await req.json();
    if (typeof integration_id !== 'string') {
      return json({ ok: false, error: 'Missing integration_id.' }, 400);
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, crm_type, workspace_id')
      .eq('id', integration_id)
      .maybeSingle();
    if (!integration) return json({ ok: false, error: 'Integration not found.' }, 404);

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', userId)
      .maybeSingle();

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleRow;

    if (!isAdmin && profile?.workspace_id !== integration.workspace_id) {
      return json({ ok: false, error: 'Not allowed.' }, 403);
    }

    const { data: token, error: decryptErr } = await supabase.rpc('decrypt_integration_token', {
      p_integration_id: integration_id,
    });
    if (decryptErr || !token) {
      console.error('decrypt failed', decryptErr);
      return json({ ok: false, error: 'Connection is broken. Reconnect to continue.' }, 500);
    }

    const adapter = getAdapter(integration.crm_type);

    let metadata;
    try {
      metadata = await adapter.fetchFieldMetadata(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        await supabase.from('integrations').update({
          status: 'error',
          last_error: 'Token invalid or revoked',
          last_checked_at: new Date().toISOString(),
        }).eq('id', integration_id);
        return json({ ok: false, error: 'Token is no longer valid. Reconnect to continue.' });
      }
      throw err;
    }

    const customFieldMappings = adapter.autoMapCustomFields(metadata);

    const { error: rpcError } = await supabase.rpc('refresh_crm_metadata', {
      p_integration_id: integration_id,
      p_custom_field_mappings: customFieldMappings,
      p_person_fields: metadata.person,
      p_org_fields: metadata.org,
    });
    if (rpcError) {
      console.error('refresh_crm_metadata failed', rpcError);
      return json({ ok: false, error: 'Failed to save refreshed metadata. Try again.' }, 500);
    }

    return json({
      ok: true,
      customFieldMappings,
      fieldCount: { person: metadata.person.length, org: metadata.org.length },
    });
  } catch (err) {
    console.error('crm-refresh-metadata crash', err);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
```

- [ ] **Step 2: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions deploy crm-refresh-metadata --no-verify-jwt --project-ref ggvhwxpaovfvoyvzixqw
```

- [ ] **Step 3: Manual test**

Using the integration_id from Task 8:
```bash
curl -X POST "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-refresh-metadata" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"integration_id":"<UUID_FROM_TASK_8>"}'
```
Expected: `{"ok":true,"customFieldMappings":{...},"fieldCount":{"person":N,"org":M}}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/crm-refresh-metadata/index.ts
git commit -m "feat(crm): crm-refresh-metadata edge function"
```

---

### Task 10: `crm-disconnect` edge function

**Files:**
- Create: `supabase/functions/crm-disconnect/index.ts`

- [ ] **Step 1: Write the edge function**

File content:
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userJwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jose.jwtVerify(userJwt, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      userId = payload.sub as string;
      if (!userId) throw new Error('no sub');
    } catch {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { integration_id } = await req.json();
    if (typeof integration_id !== 'string') {
      return json({ ok: false, error: 'Missing integration_id.' }, 400);
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, workspace_id')
      .eq('id', integration_id)
      .maybeSingle();
    if (!integration) {
      console.log('disconnect: already gone', integration_id);
      return json({ ok: true });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', userId)
      .maybeSingle();

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleRow;

    if (!isAdmin && profile?.workspace_id !== integration.workspace_id) {
      return json({ ok: false, error: 'Not allowed.' }, 403);
    }

    const { error: rpcError } = await supabase.rpc('delete_integration_cascade', {
      p_integration_id: integration_id,
    });
    if (rpcError) {
      console.error('delete_integration_cascade failed', rpcError);
      return json({ ok: false, error: 'Failed to disconnect. Try again.' }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('crm-disconnect crash', err);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
```

- [ ] **Step 2: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions deploy crm-disconnect --no-verify-jwt --project-ref ggvhwxpaovfvoyvzixqw
```

- [ ] **Step 3: Manual test — successful disconnect**

```bash
curl -X POST "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-disconnect" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"integration_id":"<UUID_FROM_TASK_8>"}'
```
Expected: `{"ok":true}`.

Verify row AND Vault secret are gone:
```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT count(*) FROM public.integrations; SELECT count(*) FROM vault.secrets WHERE name LIKE 'integration_%';"
```
Expected: both counts = 0.

- [ ] **Step 4: Manual test — idempotent on already-deleted**

Run the same curl again. Expected: `{"ok":true}` (not a 404).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/crm-disconnect/index.ts
git commit -m "feat(crm): crm-disconnect edge function"
```

---

### Task 11: `crm-health-check` edge function + n8n secret

**Files:**
- Create: `supabase/functions/crm-health-check/index.ts`

- [ ] **Step 1: Generate the shared secret and store it**

Generate a random 64-char hex string:
```bash
openssl rand -hex 32
```
Copy the output. Store it as edge function secret:
```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe secrets set CRM_HEALTH_CHECK_SECRET=<HEX_STRING> --project-ref ggvhwxpaovfvoyvzixqw
```
Save the same value locally (in a note) — we'll paste it into n8n in Task 19.

- [ ] **Step 2: Write the edge function**

File content:
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getAdapter } from '../_shared/adapters/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const BATCH_SIZE = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const expectedSecret = Deno.env.get('CRM_HEALTH_CHECK_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: rows, error } = await supabase
      .from('integrations')
      .select('id, crm_type')
      .eq('status', 'connected');
    if (error) {
      console.error('load integrations failed', error);
      return json({ error: 'query failed' }, 500);
    }

    let stillConnected = 0;
    let newlyError = 0;
    const integrations = rows ?? [];

    for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
      const batch = integrations.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(async (row) => {
        try {
          const { data: token } = await supabase.rpc('decrypt_integration_token', {
            p_integration_id: row.id,
          });
          if (!token) throw new Error('token_missing');
          const adapter = getAdapter(row.crm_type);
          const result = await adapter.testConnection(token);
          if (result.ok) {
            await supabase.from('integrations').update({
              last_checked_at: new Date().toISOString(),
            }).eq('id', row.id);
            stillConnected += 1;
          } else {
            await supabase.from('integrations').update({
              status: 'error',
              last_error: result.error ?? 'Connection check failed',
              last_checked_at: new Date().toISOString(),
            }).eq('id', row.id);
            newlyError += 1;
          }
        } catch (err) {
          console.error('health check row failed', row.id, (err as Error).message);
          await supabase.from('integrations').update({
            status: 'error',
            last_error: 'Health check failed. Reconnect to continue.',
            last_checked_at: new Date().toISOString(),
          }).eq('id', row.id);
          newlyError += 1;
        }
      }));
    }

    return json({ checked: integrations.length, still_connected: stillConnected, newly_error: newlyError });
  } catch (err) {
    console.error('crm-health-check crash', err);
    return json({ error: 'crash' }, 500);
  }
});
```

- [ ] **Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions deploy crm-health-check --no-verify-jwt --project-ref ggvhwxpaovfvoyvzixqw
```

- [ ] **Step 4: Manual test — first create a connection, then trigger the cron**

Re-run the Task 8 curl to recreate a connection (we deleted it in Task 10). Then:
```bash
curl -X POST "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-health-check" \
  -H "x-cron-secret: <YOUR_HEX_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{"checked":1,"still_connected":1,"newly_error":0}`.

Missing/wrong secret:
```bash
curl -X POST "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-health-check" \
  -H "x-cron-secret: wrong" \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{"error":"Unauthorized"}` with 401.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/crm-health-check/index.ts
git commit -m "feat(crm): crm-health-check cron edge function"
```

---

## Phase 4 — Frontend

### Task 12: `useIntegration` hook

**Files:**
- Create: `src/components/integrations/useIntegration.ts`

- [ ] **Step 1: Create the folder and hook**

File content:
```typescript
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type IntegrationRow = Database["public"]["Tables"]["integrations"]["Row"];

export interface UseIntegrationResult {
  integration: IntegrationRow | null;
  fieldCounts: { person: number; org: number } | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useIntegration(workspaceId: string | null): UseIntegrationResult {
  const [integration, setIntegration] = useState<IntegrationRow | null>(null);
  const [fieldCounts, setFieldCounts] = useState<{ person: number; org: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setIntegration(null);
      setFieldCounts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: intRow, error: intErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (intErr) throw intErr;
      setIntegration(intRow);

      if (intRow) {
        const { data: metaRows, error: metaErr } = await supabase
          .from("integration_field_metadata")
          .select("object_type, fields_json")
          .eq("integration_id", intRow.id);
        if (metaErr) throw metaErr;
        const person = metaRows?.find((r) => r.object_type === "person");
        const org = metaRows?.find((r) => r.object_type === "org");
        setFieldCounts({
          person: Array.isArray(person?.fields_json) ? (person!.fields_json as unknown[]).length : 0,
          org: Array.isArray(org?.fields_json) ? (org!.fields_json as unknown[]).length : 0,
        });
      } else {
        setFieldCounts(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`integrations:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "integrations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, load]);

  return { integration, fieldCounts, loading, error, refetch: load };
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/useIntegration.ts
git commit -m "feat(crm): useIntegration hook with realtime subscription"
```

---

### Task 13: `ConnectForm` component

**Files:**
- Create: `src/components/integrations/ConnectForm.tsx`

- [ ] **Step 1: Write the component**

File content:
```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink } from "lucide-react";

const AVAILABLE_CRMS = [{ value: "pipedrive", label: "Pipedrive" }];

const HELP_URLS: Record<string, string> = {
  pipedrive: "https://support.pipedrive.com/en/article/how-can-i-find-my-personal-api-key",
};

interface Props {
  onConnected: () => void;
  defaultCrm?: string;
}

export function ConnectForm({ onConnected, defaultCrm }: Props) {
  const [crmType, setCrmType] = useState(defaultCrm ?? "pipedrive");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ ok: boolean; error?: string; accountDisplayName?: string }>(
        "crm-test-connection",
        { body: { crm_type: crmType, token } }
      );
      if (error) {
        setFormError(error.message);
        return;
      }
      if (!data?.ok) {
        setFormError(data?.error ?? "Connection failed.");
        return;
      }
      toast({
        title: "Connected",
        description: data.accountDisplayName ?? "CRM connected successfully.",
      });
      setToken("");
      onConnected();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your CRM</CardTitle>
        <CardDescription>
          Connect to stop re-enriching contacts you already have. Bravoro will check your CRM before spending credits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="crm">CRM</Label>
            <Select value={crmType} onValueChange={setCrmType}>
              <SelectTrigger id="crm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_CRMS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">API token</Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your API token"
              disabled={submitting}
              required
            />
            <a
              href={HELP_URLS[crmType]}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Where do I find my token?
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">{formError}</p>
          )}
          <Button type="submit" disabled={submitting || !token}>
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing connection…</>
            ) : (
              "Connect"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/ConnectForm.tsx
git commit -m "feat(crm): ConnectForm component (empty-state card)"
```

---

### Task 14: `ConnectedCard` component

**Files:**
- Create: `src/components/integrations/ConnectedCard.tsx`

- [ ] **Step 1: Write the component**

File content:
```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, RefreshCw, Unplug } from "lucide-react";

type IntegrationRow = {
  id: string;
  crm_type: string;
  account_display_name: string;
  last_checked_at: string;
};

interface Props {
  integration: IntegrationRow;
  fieldCounts: { person: number; org: number } | null;
  onChanged: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function ConnectedCard({ integration, fieldCounts, onChanged }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ ok: boolean; error?: string; fieldCount?: { person: number; org: number } }>(
        "crm-refresh-metadata",
        { body: { integration_id: integration.id } }
      );
      if (error || !data?.ok) {
        toast({ title: "Refresh failed", description: error?.message ?? data?.error ?? "Unknown error", variant: "destructive" });
        onChanged();
        return;
      }
      toast({
        title: "Fields refreshed",
        description: `${data.fieldCount?.person ?? 0} person · ${data.fieldCount?.org ?? 0} org fields synced.`,
      });
      onChanged();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const { error } = await invokeEdgeFunction<{ ok: boolean }>(
        "crm-disconnect",
        { body: { integration_id: integration.id } }
      );
      if (error) {
        toast({ title: "Disconnect failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Disconnected", description: "CRM removed from Bravoro." });
      setConfirmOpen(false);
      onChanged();
    } finally {
      setDisconnecting(false);
    }
  }

  const crmLabel = integration.crm_type.charAt(0).toUpperCase() + integration.crm_type.slice(1);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span className="font-semibold">{crmLabel} — Connected</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <p className="font-medium">{integration.account_display_name}</p>
            <p className="text-muted-foreground">Last checked: {relativeTime(integration.last_checked_at)}</p>
            {fieldCounts && (
              <p className="text-muted-foreground">
                {fieldCounts.person} person fields · {fieldCounts.org} org fields synced
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh fields
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {crmLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Bravoro will stop using this CRM for dedup checks. You can reconnect anytime by pasting the API token again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/ConnectedCard.tsx
git commit -m "feat(crm): ConnectedCard component with refresh and disconnect"
```

---

### Task 15: `ErrorCard` component

**Files:**
- Create: `src/components/integrations/ErrorCard.tsx`

- [ ] **Step 1: Write the component**

File content:
```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Unplug } from "lucide-react";
import { ConnectForm } from "./ConnectForm";

type IntegrationRow = {
  id: string;
  crm_type: string;
  account_display_name: string;
  last_checked_at: string;
  last_error: string | null;
};

interface Props {
  integration: IntegrationRow;
  onChanged: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function ErrorCard({ integration, onChanged }: Props) {
  const [showReconnect, setShowReconnect] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast } = useToast();

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const { error } = await invokeEdgeFunction<{ ok: boolean }>(
        "crm-disconnect",
        { body: { integration_id: integration.id } }
      );
      if (error) {
        toast({ title: "Disconnect failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Disconnected", description: "CRM removed from Bravoro." });
      setConfirmOpen(false);
      onChanged();
    } finally {
      setDisconnecting(false);
    }
  }

  const crmLabel = integration.crm_type.charAt(0).toUpperCase() + integration.crm_type.slice(1);

  if (showReconnect) {
    return <ConnectForm defaultCrm={integration.crm_type} onConnected={onChanged} />;
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold">{crmLabel} — Connection error</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <p>{integration.last_error ?? "Unknown connection error."}</p>
            <p className="text-muted-foreground">Last checked: {relativeTime(integration.last_checked_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowReconnect(true)}>
              Reconnect
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {crmLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this CRM from Bravoro. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/integrations/ErrorCard.tsx
git commit -m "feat(crm): ErrorCard component with reconnect and disconnect"
```

---

### Task 16: `IntegrationsPanel` + wire into Settings

**Files:**
- Create: `src/components/integrations/IntegrationsPanel.tsx`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Create the panel**

File `src/components/integrations/IntegrationsPanel.tsx`:
```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegration } from "./useIntegration";
import { ConnectForm } from "./ConnectForm";
import { ConnectedCard } from "./ConnectedCard";
import { ErrorCard } from "./ErrorCard";
import { Loader2 } from "lucide-react";

export function IntegrationsPanel() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) {
        setLoadingWs(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", uid)
        .maybeSingle();
      setWorkspaceId(profile?.workspace_id ?? null);
      setLoadingWs(false);
    })();
  }, []);

  const { integration, fieldCounts, loading, refetch } = useIntegration(workspaceId);

  if (loadingWs || loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account isn't assigned to a workspace yet. Contact an admin.
      </p>
    );
  }

  if (!integration) return <ConnectForm onConnected={refetch} />;
  if (integration.status === "error") return <ErrorCard integration={integration} onChanged={refetch} />;
  return <ConnectedCard integration={integration} fieldCounts={fieldCounts} onChanged={refetch} />;
}
```

- [ ] **Step 2: Wire into Settings page**

In `src/pages/Settings.tsx`:

1. Add the import near the top with the other imports:
   ```typescript
   import { IntegrationsPanel } from "@/components/integrations/IntegrationsPanel";
   import { Plug } from "lucide-react";
   ```
   (Add `Plug` to the existing `lucide-react` import line if one exists, otherwise add new import.)

2. Locate the `<TabsList>` block. After the `usage` TabsTrigger (line ~244–247 per current file), add:
   ```tsx
   <TabsTrigger value="integrations" className="gap-2">
     <Plug className="h-4 w-4" />
     Integrations
   </TabsTrigger>
   ```

3. After the last `<TabsContent value="usage">...</TabsContent>`, add:
   ```tsx
   <TabsContent value="integrations">
     <IntegrationsPanel />
   </TabsContent>
   ```

- [ ] **Step 3: Verify build**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```
Expected: succeeds.

- [ ] **Step 4: Manual browser test of connect happy path**

Start dev server (if not already running):
```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run dev
```
Open `http://localhost:8080`, log in, navigate to Settings → Integrations, paste real Pipedrive token, click Connect. Verify green ConnectedCard appears within 5 seconds.

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/IntegrationsPanel.tsx src/pages/Settings.tsx
git commit -m "feat(crm): IntegrationsPanel + Settings tab wiring"
```

---

### Task 17: `CrmErrorToastWatcher`

**Files:**
- Create: `src/components/integrations/CrmErrorToastWatcher.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the toast watcher component**

File `src/components/integrations/CrmErrorToastWatcher.tsx`:
```typescript
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CrmErrorToastWatcher() {
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", uid)
        .maybeSingle();
      const wsId = profile?.workspace_id;
      if (!wsId || cancelled) return;

      const { data: integration } = await supabase
        .from("integrations")
        .select("id, crm_type, status, last_error")
        .eq("workspace_id", wsId)
        .eq("status", "error")
        .maybeSingle();
      if (!integration || cancelled) return;

      const storageKey = `crm_error_toast_last_shown_${wsId}`;
      const lastShown = localStorage.getItem(storageKey);
      const today = todayYmd();
      if (lastShown === today) return;

      localStorage.setItem(storageKey, today);
      toast({
        title: `${integration.crm_type.charAt(0).toUpperCase() + integration.crm_type.slice(1)} connection needs attention`,
        description: integration.last_error ?? "Reconnect to resume dedup checks.",
        action: (
          <ToastAction altText="Fix now" onClick={() => navigate("/settings?tab=integrations")}>
            Fix now
          </ToastAction>
        ),
      });
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [toast, navigate]);

  return null;
}
```

- [ ] **Step 2: Mount in App.tsx**

In `src/App.tsx`:

1. Add the import with other imports:
   ```typescript
   import { CrmErrorToastWatcher } from "@/components/integrations/CrmErrorToastWatcher";
   ```

2. Inside the router tree, after the top-level `<BrowserRouter>` (or equivalent) opening, add:
   ```tsx
   <CrmErrorToastWatcher />
   ```
   Place it adjacent to the `<Toaster />` mount. The exact location depends on the current App.tsx structure — mount it anywhere inside the router but outside routes, so it runs on every route transition.

- [ ] **Step 3: Verify build**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```
Expected: succeeds.

- [ ] **Step 4: Manual test**

In Supabase SQL editor, manually flip the existing integration to error state:
```sql
UPDATE public.integrations SET status='error', last_error='Simulated error for testing';
```
Reload the app in the browser. Toast should appear within 1 second. Dismiss via X. Reload again within the same day — toast should NOT reappear. Open browser DevTools, clear the `crm_error_toast_last_shown_<ws-id>` localStorage entry, reload — toast reappears.

Flip back to connected:
```sql
UPDATE public.integrations SET status='connected', last_error=NULL;
```

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/CrmErrorToastWatcher.tsx src/App.tsx
git commit -m "feat(crm): daily error toast for broken CRM connections"
```

---

## Phase 5 — n8n workflow + final validation

### Task 18: n8n daily cron workflow

This task is done in the n8n UI (no code changes in the repo).

- [ ] **Step 1: Create the workflow**

1. Open n8n at `https://n8n.srv1081444.hstgr.cloud/`.
2. Create a new workflow named `crm_health_check_daily`.
3. Add a **Cron** (Schedule Trigger) node: mode "Every day", hour 3, minute 0, timezone UTC.
4. Add an **HTTP Request** node:
   - Method: `POST`
   - URL: `https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-health-check`
   - Authentication: "Generic Credential Type" → Header Auth. Create a new credential `crm_health_check_secret`: Name `x-cron-secret`, Value = the hex string generated in Task 11 Step 1.
   - Headers (add explicitly): `Content-Type: application/json`
   - Body content type: JSON
   - Body (JSON): `{}`
   - Options → Retry on fail: enabled, 3 attempts, exponential backoff.
   - Options → Timeout: 60000 ms.
5. Connect Cron → HTTP Request.
6. Save and activate the workflow.

- [ ] **Step 2: Manually trigger to verify**

Click "Execute Workflow" once in the n8n UI. Expected: green checkmarks on both nodes, HTTP Request response shows `{"checked":N,"still_connected":N,"newly_error":0}`.

- [ ] **Step 3: No commit — n8n state lives in n8n, not the repo**

Optionally add a one-line note to `docs/superpowers/plans/2026-04-23-crm-dedup-m1-connect-flow.md` below Task 18 noting the workflow name and creation date, then:
```bash
git commit --allow-empty -m "chore(crm): n8n crm_health_check_daily workflow created"
```

---

### Task 19: Run the manual test matrix

This is the acceptance gate for M1. Use the 18-scenario matrix in §9 of the design spec (`docs/superpowers/specs/2026-04-23-crm-dedup-m1-connect-flow-design.md`).

- [ ] **Step 1: Walk through all 18 scenarios**

For each row in the matrix, perform the steps and verify the expected outcome. Keep a checklist (paper, text file, whatever). Any failure = fix before proceeding.

Scenarios in summary (full details in spec §9):
1. Happy-path connect
2. Invalid token
3. Pipedrive unreachable (hosts block)
4. Refresh fields
5. Add custom field and refresh
6. Token revoked mid-session
7. Manual cron trigger with revoked token
8. Disconnect from connected state
9. Disconnect from error state
10. Second user in same workspace sees card
11. User in different workspace sees empty state
12. Realtime multi-device sync
13. Daily toast fires once per day
14. Daily toast re-fires after localStorage reset
15. Toast "Fix now" navigation
16. RLS on `integration_secrets` blocks non-service-role reads
17. Zero orphan Vault secrets after repeat connect/disconnect cycles
18. Global admin cross-workspace (optional — M1.5 if time)

- [ ] **Step 2: Grep for token leaks**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions logs crm-test-connection --project-ref ggvhwxpaovfvoyvzixqw | grep -iE "token|api_token"
```
Expected: no hits (the word "token" may appear in error messages; verify none contain actual token values). Repeat for each new edge function.

- [ ] **Step 3: Optional — Playwright happy-path automation**

If time allows, script scenarios #1 and #8 in a new file `scripts/playwright-crm-connect.mjs` using the pattern from `scripts/playwright-screenshot.mjs`. Not required for M1 acceptance but useful for M2 regression coverage.

- [ ] **Step 4: Rotate the development Pipedrive token**

Per roadmap §security, rotate the token used during development before merging to main. In Pipedrive: Settings → Personal preferences → API → Regenerate API token. The existing integration will go to `error` state. Reconnect with the new token to restore.

- [ ] **Step 5: Final commit and PR-ready**

```bash
git push origin feat/crm-dedup-m1
```

Open a PR to `main` titled "M1: CRM dedup — Pipedrive connect flow". Link the PR description to both spec documents. Request review.

---

## Acceptance criteria — do all these pass before merging?

Copy the list from §10 of the spec and tick each:

**Backend**
- [ ] Migration runs cleanly in Supabase local AND staging.
- [ ] Vault extension enabled and verified functional.
- [ ] `crm-test-connection` returns `ok:true` for valid token, `ok:false` with friendly error for invalid.
- [ ] Connected row has correct `account_display_name`, populated `custom_field_mappings`, `status='connected'`.
- [ ] `integration_field_metadata` rows exist for `person` and `org` after connect.
- [ ] Token stored in Vault, retrievable only via RPC as service role.
- [ ] Disconnect removes both Vault secret and row; zero orphaned Vault secrets after repeat cycles.
- [ ] `crm-health-check` correctly flips revoked integrations to `error`; leaves healthy ones alone.

**Frontend**
- [ ] User can select Pipedrive, enter token, click Connect, see "Connected" state within 5s.
- [ ] Error states display only friendly copy.
- [ ] Disconnect clears UI and cached metadata.
- [ ] Refresh fields updates `last_checked_at`.
- [ ] Daily toast appears once per day on error state; dismisses via X.
- [ ] Realtime: disconnect on one device updates another within 2s.

**Security**
- [ ] No token appears in any log line.
- [ ] Non-workspace-member cannot read `integrations` row.
- [ ] Service-role-only access to `integration_secrets`.
- [ ] Pipedrive token used during development is rotated before merge.

**n8n**
- [ ] Workflow `crm_health_check_daily` executes on schedule.
- [ ] Shared secret matches between n8n credential and Supabase env var.

---

## References

- Spec (this plan implements): `docs/superpowers/specs/2026-04-23-crm-dedup-m1-connect-flow-design.md`
- Roadmap: `docs/superpowers/specs/2026-04-23-crm-dedup-roadmap.md`
- M2 draft spec (do NOT implement in this session): `docs/superpowers/specs/2026-04-23-crm-dedup-m2-dedup-gate-design.md`
- Source PRD: `InputFiles/PRD_bravoro_crm_dedup.md`
- Existing edge function reference: `supabase/functions/trigger-n8n-webhook/index.ts` (JWT + CORS pattern)
- Frontend edge function wrapper: `src/integrations/supabase/client.ts` (`invokeEdgeFunction`)
