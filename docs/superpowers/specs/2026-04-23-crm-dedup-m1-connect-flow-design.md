# CRM Dedup — Milestone 1: Connect Flow — Design Spec

**Date:** 2026-04-23
**Status:** Design approved, implementation plan pending
**Source PRD:** `InputFiles/PRD_bravoro_crm_dedup.md`
**Companion specs:** `2026-04-23-crm-dedup-roadmap.md`, `2026-04-23-crm-dedup-m2-dedup-gate-design.md`

---

## 1. Milestone scope

**What ships in M1:** a user can connect their Pipedrive account to Bravoro, see a "Connected as [Account Name]" confirmation, refresh the cached field metadata on demand, and disconnect. The CRM connection does nothing yet — it's a stored, verified credential with cached metadata waiting for M2 to wire it into the enrichment waterfall.

**Why this slice:** it exercises the full architecture (Supabase Vault, adapter pattern, RLS, realtime UI, cron health check) with minimal matching-algorithm complexity. M1 shakes out infra bugs before M2 tackles the 3-layer fuzzy matching. Matching is where all the hard logic lives; validating the plumbing first keeps risk low.

**What does NOT ship in M1:** the dedup check itself. No verdict endpoint, no n8n dedup workflow, no wiring into `trigger-n8n-webhook`, no normalization functions, no matching layers. These are M2.

---

## 2. Architecture overview

### Three layers, minimal surface

**Frontend** — new component `IntegrationsPanel` mounted as the 4th tab on `src/pages/Settings.tsx`. Three visual states (empty / connected / error) driven by a single `useIntegration(workspaceId)` hook. The component code is CRM-agnostic — it renders whatever the backend provides (`crm_type`, `account_display_name`, `status`). Future adapters ship without frontend changes beyond adding their `crm_type` to a dropdown enum.

**Supabase backend** — three new tables (`integrations`, `integration_secrets`, `integration_field_metadata`), Vault extension enabled, three SQL RPCs (encrypt/decrypt/delete-cascade), and four new edge functions:
- `crm-test-connection` — connect + bootstrap metadata + auto-map
- `crm-refresh-metadata` — re-fetch fields, re-run auto-map
- `crm-disconnect` — hard delete row + Vault secret
- `crm-health-check` — cron endpoint; flips stale tokens to `error`

Adapter framework at `supabase/functions/_shared/adapters/` (new folder). Interface scoped to M1 methods only; M2 extends.

**n8n** — one new workflow with two nodes: Cron (daily 03:00 UTC) → HTTP POST to `crm-health-check` with header-auth shared secret. No user flow touches n8n in M1. Existing webhooks (`trigger-n8n-webhook`, etc.) are **not modified**.

### Trust boundary

- Tokens are decrypted **only** inside edge functions via the RPC. They never cross HTTP boundaries except the initial user-provided token on connect (which is written straight to Vault and never returned).
- The frontend's authority is the `integrations` row it can read via RLS (its own workspace only). All CRM API calls, Vault access, and field metadata fetching happen server-side.
- n8n in M1 does not read `integrations`; it only triggers the cron endpoint which then reads the table server-side using service role.

### File layout

```
supabase/
  migrations/
    20260423000000_add_crm_integrations.sql          (new)
  functions/
    _shared/
      adapters/
        types.ts                                      (new)
        registry.ts                                   (new)
        pipedrive.ts                                  (new)
    crm-test-connection/index.ts                      (new)
    crm-refresh-metadata/index.ts                     (new)
    crm-disconnect/index.ts                           (new)
    crm-health-check/index.ts                         (new)

src/
  components/
    integrations/
      IntegrationsPanel.tsx                           (new)
      ConnectForm.tsx                                 (new)
      ConnectedCard.tsx                               (new)
      ErrorCard.tsx                                   (new)
      useIntegration.ts                               (new)
      CrmErrorToastWatcher.tsx                        (new)
  pages/
    Settings.tsx                                      (modified: add 4th tab)
  App.tsx                                             (modified: mount toast watcher)
  integrations/
    supabase/
      types.ts                                        (regenerated after migration)
```

---

## 3. Database schema

### 3.1 Migration: `20260423000000_add_crm_integrations.sql`

```sql
-- Vault extension (one-time). Cascade because Vault depends on pgsodium.
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

-- integrations: workspace members full CRUD on their workspace's row
CREATE POLICY "workspace members manage own integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

-- Global admins get full CRUD across all workspaces
CREATE POLICY "admins manage all integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Secrets: blocked at RLS; service role bypasses
CREATE POLICY "service role only secrets"
  ON public.integration_secrets FOR ALL USING (false);

-- Metadata: workspace members SELECT only
CREATE POLICY "workspace members read own metadata"
  ON public.integration_field_metadata FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.integrations i
      WHERE i.id = integration_field_metadata.integration_id
      AND i.workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Global admins read any metadata
CREATE POLICY "admins read all metadata"
  ON public.integration_field_metadata FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Vault RPCs

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

-- Transactional helper used by crm-refresh-metadata to update mappings + both metadata rows atomically
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
      last_checked_at = now(),
      last_error = NULL,
      status = 'connected',
      updated_at = now()
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

-- Transactional helper used by crm-test-connection to write integration row + Vault secret + metadata atomically
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
  SET account_identifier = EXCLUDED.account_identifier,
      account_display_name = EXCLUDED.account_display_name,
      status = 'connected',
      last_checked_at = now(),
      last_error = NULL,
      custom_field_mappings = EXCLUDED.custom_field_mappings,
      connected_by_user_id = EXCLUDED.connected_by_user_id,
      updated_at = now()
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

-- Grants
REVOKE ALL ON FUNCTION public.encrypt_integration_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_integration_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_integration_cascade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_crm_connection(uuid, text, text, text, jsonb, uuid, text, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.encrypt_integration_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_integration_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_integration_cascade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_crm_connection(uuid, text, text, text, jsonb, uuid, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_crm_metadata(uuid, jsonb, jsonb, jsonb) TO service_role;
```

Also add the refresh RPC to the REVOKE section above (same pattern):
```sql
REVOKE ALL ON FUNCTION public.refresh_crm_metadata(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
```

### 3.2 Prerequisite verification
Before merging the migration, confirm **Supabase Vault extension** is available on the project's plan. All paid plans include it by default; free tier does not. Running the migration on a plan without Vault raises a clear error, so no silent breakage — but we should verify ahead of time.

### 3.3 `custom_field_mappings` JSONB shape (written in M1, read in M2)

```json
{
  "person": {
    "websiteField": ["1a19f770dec08e0419c57ef005ea13fe97d6f636"],
    "linkedinField": []
  },
  "org": {
    "websiteField": ["d983791534ef643387bee25bbe686fa496f019e0"],
    "practiceType": []
  }
}
```

M1 writes this after auto-mapping runs. M2 reads it during matching. The `practiceType` slot is reserved now to avoid a shape migration in M2.

---

## 4. Adapter framework

### 4.1 `supabase/functions/_shared/adapters/types.ts`

```typescript
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

### 4.2 `supabase/functions/_shared/adapters/registry.ts`

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

### 4.3 `supabase/functions/_shared/adapters/pipedrive.ts`

High-level structure:

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
      const res = await fetchJson(`https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(token)}`);
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
}

function normalizeField(raw: any): FieldDef {
  return {
    key: raw.key,
    label: raw.name,
    type: raw.field_type,
    isCustom: raw.edit_flag === true,
  };
}

function labelMatches(label: string, keywords: string[]): boolean {
  const lbl = label.toLowerCase();
  return keywords.some(k => lbl.includes(k));
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
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10) * 1000 || 250 * attempt;
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

### 4.4 Design decisions encoded above

- `testConnection` uses the **global endpoint** `api.pipedrive.com/v1/users/me` (we don't yet know the company domain). Subsequent M2 calls will use `{company}.pipedrive.com`.
- `InvalidTokenError` is a typed sentinel so callers can translate to friendly messages exactly once (at the edge-function layer), not at the HTTP helper.
- `fetchJson` retries on 429 with `Retry-After` backoff — preps us for M2's higher call volume.
- **No external npm packages** for M1. Native `fetch` only.
- `practiceType` slot is present but empty in auto-mapping — reserved for M2 Layer-2 org-type matching.

---

## 5. Edge functions

All four deploy with `--no-verify-jwt` (ES256 gotcha per project CLAUDE.md). Auth is handled in-function.

### 5.1 `crm-test-connection`

**Auth:** user JWT, verified via jose JWKS (pattern from `trigger-n8n-webhook/index.ts`).

**Request:**
```json
POST /functions/v1/crm-test-connection
Authorization: Bearer <user_jwt>
{ "crm_type": "pipedrive", "token": "xxxxxxxx" }
```

**Logic:**
1. Verify JWT → `userId`.
2. Validate body: `crm_type` is a string, known via `isKnownCrmType`; `token` is a non-empty string.
3. Look up `profiles.workspace_id` for `userId`. If null → 400 `{ok:false, error:"User is not assigned to a workspace."}`.
4. `adapter = getAdapter(crm_type)`.
5. `result = await adapter.testConnection(token)`. If `!result.ok` → return `{ok:false, error: result.error}` with HTTP 200 (user-input error, not server error).
6. `metadata = await adapter.fetchFieldMetadata(token)`. On `InvalidTokenError` → return `{ok:false, error:"Token was rejected when reading fields. Try reconnecting."}` HTTP 200.
7. `customFieldMappings = adapter.autoMapCustomFields(metadata)`.
8. Call `finalize_crm_connection` RPC with all nine params. Returns `integration_id`.
9. Return `{ok:true, integrationId, accountDisplayName: result.accountDisplayName}`.

**Error responses:**
- 401 — JWT verification failed.
- 400 — missing/invalid body, no workspace.
- 200 + `{ok:false, error}` — Pipedrive rejected the token or returned unexpected data.
- 500 — unexpected crash. Return `{ok:false, error:"Something went wrong. Try again."}`. Log `console.error(err)`.

### 5.2 `crm-refresh-metadata`

**Auth:** user JWT.

**Request:**
```json
POST /functions/v1/crm-refresh-metadata
Authorization: Bearer <user_jwt>
{ "integration_id": "uuid-abc" }
```

**Logic:**
1. Verify JWT → `userId`.
2. Load integration by id. Look up `profiles.workspace_id`. If `integration.workspace_id !== profile.workspace_id` AND user is not a global admin → 403.
3. `token = await decrypt_integration_token(integration_id)` RPC.
4. `adapter = getAdapter(integration.crm_type)`.
5. `metadata = await adapter.fetchFieldMetadata(token)`. On `InvalidTokenError`:
   - `UPDATE integrations SET status='error', last_error='Token invalid or revoked', last_checked_at=now() WHERE id=?`.
   - Return `{ok:false, error:"Token is no longer valid. Reconnect to continue."}` HTTP 200.
6. `customFieldMappings = adapter.autoMapCustomFields(metadata)`.
7. Call `refresh_crm_metadata(integration_id, customFieldMappings, personFields, orgFields)` RPC — single atomic write for integration row + both metadata rows.
8. Return `{ok:true, customFieldMappings, fieldCount:{person: N, org: N}}`.

### 5.3 `crm-disconnect`

**Auth:** user JWT.

**Request:**
```json
POST /functions/v1/crm-disconnect
Authorization: Bearer <user_jwt>
{ "integration_id": "uuid-abc" }
```

**Logic:**
1. Verify JWT → `userId`.
2. Load integration by id.
   - If not found → return `{ok:true}` (idempotent — already disconnected). Log at info level.
   - If found, verify `integration.workspace_id === profile.workspace_id` OR user is global admin. 403 on mismatch.
3. Call `delete_integration_cascade(integration_id)` RPC.
4. Return `{ok:true}`.

### 5.4 `crm-health-check`

**Auth:** header `x-cron-secret` compared to `CRM_HEALTH_CHECK_SECRET` env var. No JWT.

**Request:**
```json
POST /functions/v1/crm-health-check
x-cron-secret: <shared-secret>
{}
```

**Logic:**
1. Verify shared secret. If mismatch → 401.
2. `SELECT id, crm_type FROM integrations WHERE status='connected'`.
3. In batches of 10, via `Promise.allSettled`:
   - `token = await decrypt_integration_token(id)`.
   - `result = await adapter.testConnection(token)`.
   - If `result.ok` → `UPDATE integrations SET last_checked_at=now() WHERE id=?`.
   - If `!result.ok` → `UPDATE integrations SET status='error', last_error=result.error, last_checked_at=now() WHERE id=?`.
4. Return `{checked: N, still_connected: X, newly_error: Y}`.

**Error isolation:** per-row try/catch inside the batch so one broken integration can't sink the run. Use `console.error` for per-row failures with `integration_id`.

### 5.5 Shared conventions

- Service-role Supabase client created at module scope.
- CORS headers from the existing template (`trigger-n8n-webhook/index.ts`).
- Never log tokens. Log `integration_id`, `workspace_id`, and error type only.
- Response envelope: `{ok: boolean, ...}` — matches the `invokeEdgeFunction` frontend wrapper contract.

---

## 6. Frontend UI

### 6.1 Settings page

`src/pages/Settings.tsx` gets a 4th tab between Usage and Developer Tools:

```tsx
<TabsTrigger value="integrations" className="gap-2">
  <Plug className="h-4 w-4" />
  Integrations
</TabsTrigger>
// ...
<TabsContent value="integrations">
  <IntegrationsPanel />
</TabsContent>
```

### 6.2 `useIntegration(workspaceId)` hook

```typescript
interface UseIntegrationResult {
  integration: Integration | null;
  fieldCounts: { person: number; org: number } | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useIntegration(workspaceId: string | null): UseIntegrationResult
```

- Queries `integrations` where `workspace_id = workspaceId`, `maybeSingle()`.
- Also queries `integration_field_metadata` for field counts (two rows → two counts).
- Subscribes to Supabase realtime on the `integrations` row for this workspace. On any insert/update/delete → refetch.

### 6.3 Component behavior

**`IntegrationsPanel`** — switch on `integration?.status`:
- `null` → `<ConnectForm />`
- `'connected'` → `<ConnectedCard integration={...} fieldCounts={...} />`
- `'error'` → `<ErrorCard integration={...} />`

**`ConnectForm`**:
- CRM dropdown bound to constant `AVAILABLE_CRMS = [{value:'pipedrive', label:'Pipedrive'}]`.
- Token input `type="password"`, `autocomplete="off"`. Help copy under the input: link to Pipedrive's Personal preferences → API page.
- Connect button → `invokeEdgeFunction('crm-test-connection', { crm_type, token })`.
- Button states: idle / loading (spinner + "Testing connection…") / disabled while loading.
- Success → toast "Connected to Pipedrive", hook refetches, panel flips to ConnectedCard.
- Failure → red inline error under the form with `error` string.
- Token input is cleared after submit. Token is never written to state, only to the request body.

**`ConnectedCard`**:
- Green dot + "Pipedrive — Connected".
- `account_display_name` line.
- "Last checked: X minutes ago" — computed with a small relative-time helper (or existing util if there is one).
- Field count line: "N person fields · M org fields synced".
- "Refresh fields" button → `invokeEdgeFunction('crm-refresh-metadata', { integration_id })`. Success toast.
- "Disconnect" button → confirm dialog ("Disconnect Pipedrive? Bravoro will stop using this CRM for dedup checks.") → `crm-disconnect` call → toast → refetch.

**`ErrorCard`**:
- Red banner, warning icon, "Pipedrive — Connection error".
- `last_error` string.
- `last_checked_at` relative time.
- "Reconnect" button → inline `ConnectForm` (CRM preselected, token empty). Same submit flow; server upserts the existing row back to `status='connected'`.
- "Disconnect" button → same as ConnectedCard.

### 6.4 `CrmErrorToastWatcher`

- Mounted once in `src/App.tsx` at top level (inside the router).
- On mount:
  1. If no authenticated user → no-op.
  2. Query current user's workspace integration.
  3. If `integration?.status === 'error'`:
     - Key: `crm_error_toast_last_shown_${workspace_id}`.
     - If `localStorage.getItem(key) !== today-YYYY-MM-DD` → show toast, set key to today.
- Toast: title "Pipedrive connection needs attention", description (placeholder wording — refine before ship), actions: **Fix now** (navigate to `/settings?tab=integrations`) and **Dismiss** (same as waiting — next day resurfaces).
- Subscribes to realtime on the integration row so a successful reconnect on another device stops the toast from appearing on this one.

### 6.5 Modified files

| File | Change |
|---|---|
| `src/pages/Settings.tsx` | Add 4th tab + import `IntegrationsPanel`. ~10 lines. |
| `src/App.tsx` | Mount `<CrmErrorToastWatcher />`. ~3 lines. |
| `src/integrations/supabase/types.ts` | Regenerate after migration (existing `supabase.exe gen types` workflow). |

---

## 7. n8n workflow (M1 only: cron health check)

Workflow name: `crm_health_check_daily`. Two nodes.

### Node 1: Cron trigger
- Schedule: daily at 03:00 UTC.

### Node 2: HTTP Request
- Method: POST.
- URL: `https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-health-check`.
- Headers:
  - `Content-Type: application/json`
  - `x-cron-secret: {{ $credentials.crm_health_check_secret }}`
- Body: `{}`.
- Retry on fail: 3 attempts, exponential backoff.
- Timeout: 60 seconds.

### n8n credential
Create `crm_health_check_secret` credential in n8n holding the shared secret value. The same value goes into Supabase edge function env var `CRM_HEALTH_CHECK_SECRET`.

### Why n8n and not Supabase pg_cron
n8n is already running in our infra. One new workflow is cheaper to own than wiring up pg_cron + pg_net. When we add more scheduled jobs (there aren't any today), the consolidation argument might flip.

---

## 8. Error handling contract (summary)

| Situation | User-facing message | System action |
|---|---|---|
| Invalid API token on connect | "Invalid API token. Check that you copied it correctly from Pipedrive → Personal preferences → API." | No row created, no Vault secret |
| Pipedrive unreachable on connect | "Couldn't reach Pipedrive. Try again in a moment." | No row created |
| Unexpected response from Pipedrive | "Unexpected response from Pipedrive. Try reconnecting." | No row created |
| User not in a workspace | "Your account isn't assigned to a workspace." | 400 response |
| Token revoked while connected (detected by refresh or cron) | Banner: `last_error` text. Daily toast. | `status='error'`, `last_error` populated |
| Unknown CRM type | "This CRM isn't supported yet." | 400 response |
| Vault decryption failure | "Connection is broken. Reconnect to continue." | `status='error'` |
| Unexpected server crash | "Something went wrong. Try again." | 500 response, `console.error` log |

**Never surface to user:** raw Pipedrive error bodies, HTTP status codes, stack traces, JWT validation details, SQL errors.

---

## 9. Testing plan

Primary approach: manual test matrix below. Optional enhancement: Playwright is now available in the project (per updated project CLAUDE.md) with authenticated-UI scaffolding (`scripts/playwright-auth-setup.mjs` + `scripts/playwright-screenshot.mjs`). If time permits during implementation, the happy-path connect flow (scenarios #1 and #8) is a good candidate for a first automated test, because it's the most-exercised flow and the setup cost is low.

### Manual test matrix

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Happy path | Paste valid Pipedrive token, click Connect | ConnectedCard within 5s, Vault secret exists, person+org metadata rows exist |
| 2 | Invalid token | Paste garbage | Red inline error, no row created, no Vault secret |
| 3 | Pipedrive unreachable | `hosts` file blocks `api.pipedrive.com` | "Couldn't reach Pipedrive…" error, no row |
| 4 | Refresh fields | Click Refresh on connected card | Toast success, `last_checked_at` updates |
| 5 | Add custom field, refresh | Add "Website 2" custom field in Pipedrive, click Refresh | Mapping now includes new field key |
| 6 | Token revoked mid-session | Revoke token in Pipedrive → click Refresh | Status flips to `error`, red ErrorCard shown |
| 7 | Daily cron detection | Manually POST to `crm-health-check` with `x-cron-secret`; one integration has revoked token | That integration flips to error, others unchanged |
| 8 | Disconnect happy path | Click Disconnect → confirm | Row gone, Vault secret gone (verify via SQL), empty state shown |
| 9 | Disconnect on error row | From ErrorCard, click Disconnect | Same cleanup as #8 |
| 10 | Second user in workspace | Log in as another member | Sees ConnectedCard; can click Refresh/Disconnect |
| 11 | Cross-workspace isolation (RLS) | Log in as user in different workspace | Sees empty state, no row leak |
| 12 | Realtime multi-device | Tab A connected; disconnect from Tab B | Tab A flips to empty state within ~2s |
| 13 | Daily toast | Set status=error in DB; load app twice on same day | Toast appears once, second load is silent |
| 14 | Daily toast reset | Set localStorage key to yesterday; reload | Toast reappears |
| 15 | Toast "Fix now" | Click Fix now | Navigates to Settings → Integrations |
| 16 | RLS on integration_secrets | Query `integration_secrets` as authenticated user | No rows returned (RLS blocks) |
| 17 | No orphan Vault secrets | After 10 connect→disconnect cycles | `SELECT count(*) FROM vault.secrets WHERE name LIKE 'integration_%'` = 0 |
| 18 | Admin cross-workspace | Log in as global admin, navigate to another workspace | Can see/edit integrations via admin panel path (M1.5 — not required for M1 acceptance) |

---

## 10. Acceptance criteria

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
- [ ] Error states display only friendly copy (no raw Pipedrive/HTTP errors).
- [ ] Disconnect clears UI and cached metadata.
- [ ] Refresh fields updates `last_checked_at`.
- [ ] Daily toast appears once per day on error state; dismisses via X.
- [ ] Realtime: disconnect on one device updates another within 2s.

**Security**
- [ ] No token appears in any log line (spot-grepped during manual test matrix #1).
- [ ] Non-workspace-member cannot read `integrations` row.
- [ ] Service-role-only access to `integration_secrets`.
- [ ] Pipedrive token used during development is rotated before M2 ships.

**n8n**
- [ ] Workflow `crm_health_check_daily` executes on schedule without error.
- [ ] Shared secret matches between n8n credential and edge function env var.

---

## 11. Implementation order (drives the M1 plan)

1. **Migration + Vault verification** — run on local Supabase, confirm Vault works end-to-end with a test token.
2. **Adapter types + registry + Pipedrive skeleton** — just the interface and class shape, no method bodies beyond throw-not-implemented.
3. **Pipedrive `testConnection`** — simplest method, validates the `fetchJson` helper.
4. **`crm-test-connection` edge function, unit level** — calls adapter stub, returns fixed response. Deploy to staging.
5. **Pipedrive `fetchFieldMetadata` + `autoMapCustomFields`** — complete the adapter for M1 scope.
6. **Wire `crm-test-connection` end-to-end** — full logic including `finalize_crm_connection` RPC.
7. **Frontend `useIntegration` hook + `ConnectForm`** — happy-path connect flow in the UI.
8. **`ConnectedCard` + `crm-refresh-metadata` edge function** — read + refresh paths.
9. **`ErrorCard` + `crm-disconnect` edge function** — error and destructive paths.
10. **`crm-health-check` edge function + n8n workflow** — cron plumbing.
11. **`CrmErrorToastWatcher`** — daily toast.
12. **Manual test matrix** — all 18 scenarios. Fix issues before calling M1 done.

Each step is independently testable. Don't advance past a step with known failures.

---

## 12. Environment variables & secrets

New env vars to add to Supabase edge function environment:

| Var | Purpose | Source |
|---|---|---|
| `CRM_HEALTH_CHECK_SECRET` | Validates cron-triggered calls to `crm-health-check` | Generate random 64-char hex; store in both Supabase and n8n credential |

No new frontend env vars. Existing `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are all reused.

---

## 13. Open questions and follow-ups

None outstanding for M1. All design decisions are resolved. Move to implementation plan.
