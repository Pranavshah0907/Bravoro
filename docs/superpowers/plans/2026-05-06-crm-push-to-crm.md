# CRM Push to CRM — Implementation Plan (Plan C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing "Push to CRM" action — a button on the Results page that lets the user push enriched contacts as Deals into a chosen Pipedrive pipeline + first stage, with linked Persons and Organizations, source attribution, and idempotency.

**Architecture:** Adapter gains four methods (`listDestinations`, `findOrCreateOrganization`, `findOrCreatePerson`, `createDeal`). Two new JWT-authenticated edge functions (`crm-list-destinations`, `crm-push`). New `crm_pushes` bookkeeping table for idempotency and UI status badges. Push is serial under Pipedrive's ~10 req/s ceiling, soft-capped at 100 leads per request. The mirror from Plan A is reused — `findOrCreatePerson` checks it before hitting Pipedrive, then writes the new Person back into the mirror so subsequent dedup-checks see it without waiting for the cron.

**Tech Stack:** Deno (Supabase edge functions), TypeScript, React 18 + shadcn/ui, Supabase Vault via existing RPCs, native `fetch` for Pipedrive API.

**Spec this plan implements:** `docs/superpowers/specs/2026-05-06-crm-push-to-crm-design.md`

**Branch:** continues on `feat/crm-dedup-m1`. Plan A must be complete first.

---

## Preflight

- [ ] **Plan A is complete and `crm_contacts` table exists**

```bash
/c/Users/prana/scoop/shims/supabase.exe migration list --linked 2>&1 | grep 20260506000000
```
Expected: a row with both LOCAL and REMOTE populated.

- [ ] **Pipedrive token connected via UI** (needed for smoke-tests in Tasks 8–9)

If not yet connected: open http://localhost:8080, sign in, Settings → Integrations → connect Pipedrive. Smoke-tests later in this plan will surface this if missing.

---

## Phase 1 — Database

### Task 1: Migration for `crm_pushes` + cached_users + default_owner

**Files:**
- Create: `supabase/migrations/20260506000002_add_crm_pushes_and_users.sql`

- [ ] **Step 1: Create the migration**

```sql
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
```

- [ ] **Step 2: Apply**

```bash
/c/Users/prana/scoop/shims/supabase.exe db push --linked 2>&1 | tail -5
```
Expected: `Finished supabase db push.`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260506000002_add_crm_pushes_and_users.sql
git commit -m "feat(crm): crm_pushes table + cached_users + default_owner

Bookkeeping for the user-triggered push flow (Spec C). UNIQUE
(integration_id, bravoro_record_id, destination_id) enforces
idempotency at the table level — re-pushing the same lead to the same
destination returns the existing crm_pushes row instead of creating
a duplicate Deal in Pipedrive.

Cached_users JSONB on integrations is populated during connect and
refresh-metadata; UI uses it to render the owner picker without
hitting Pipedrive every time the modal opens. default_owner_external_id
is reserved for v1.1 per-destination owner mapping.

Realtime publication is extended so the UI status badges update
live as crm-push completes."
```

### Task 2: Regenerate Supabase types

- [ ] **Step 1**

```bash
/c/Users/prana/scoop/shims/supabase.exe gen types typescript --linked > src/integrations/supabase/types.ts
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit; echo "exit: $?"
```
Expected: exit 0.

- [ ] **Step 2: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate for crm_pushes + cached_users"
```

---

## Phase 2 — Adapter interface + Pipedrive impl

### Task 3: Extend adapter types

**Files:**
- Modify: `supabase/functions/_shared/adapters/types.ts`

- [ ] **Step 1: Append the new shapes and method signatures**

Append to `supabase/functions/_shared/adapters/types.ts`:

```typescript
// ─── Spec C: push to CRM ───────────────────────────────────────────────────

export interface Destination {
  id: string;
  label: string;
  group?: string;
  pipelineId?: string;
  stageId?: string;
}

export interface CrmUser {
  externalId: string;
  name: string;
  email: string | null;
  active: boolean;
}

export interface OrgInput {
  name: string | null;
  domain: string | null;
}

export interface PersonInput {
  name: string;
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  jobTitle: string | null;
  organizationExternalId: string | null;
  customFields?: Record<string, unknown>;
}

export interface DealInput {
  title: string;
  pipelineId: string;
  stageId: string;
  ownerExternalId: string | null;
  personExternalId: string;
  organizationExternalId: string | null;
  sourceLabel: string;        // 'Bravoro' for Quellenherkunft
  sourceId: string | null;    // Bravoro record_id or search_id for ID der Ursprungsquelle
  channelLabel: string | null;
  customFields?: Record<string, unknown>;
}
```

Update the `CrmAdapter` interface block:

```typescript
export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
  fetchContacts(token: string, opts?: FetchContactsOpts): AsyncGenerator<NormalizedContact, void, void>;
  // NEW (Spec C):
  fetchUsers(token: string): Promise<CrmUser[]>;
  listDestinations(token: string): Promise<Destination[]>;
  findOrCreateOrganization(token: string, input: OrgInput): Promise<{ externalId: string; created: boolean }>;
  findOrCreatePerson(token: string, input: PersonInput): Promise<{ externalId: string; created: boolean; raw?: unknown }>;
  createDeal(token: string, input: DealInput): Promise<{ externalId: string }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/adapters/types.ts
git commit -m "feat(crm): adapter interface gains push methods (Spec C)

fetchUsers, listDestinations, findOrCreateOrganization,
findOrCreatePerson, createDeal. Pipedrive implementations follow."
```

---

### Task 4: Pipedrive `fetchUsers` + `listDestinations`

**Files:**
- Modify: `supabase/functions/_shared/adapters/pipedrive.ts`

- [ ] **Step 1: Update imports**

Add to the existing imports block:

```typescript
import type {
  CrmAdapter, ConnectionResult, FieldMetadata, FieldDef, CustomFieldMappings,
  FetchContactsOpts, NormalizedContact,
  Destination, CrmUser, OrgInput, PersonInput, DealInput,
} from './types.ts';
```

- [ ] **Step 2: Add the methods inside `PipedriveAdapter`**

Append (inside the class, after `fetchContactsDelta`):

```typescript
async fetchUsers(token: string): Promise<CrmUser[]> {
  const url = new URL('https://api.pipedrive.com/v1/users');
  url.searchParams.set('api_token', token);
  const res = await fetchJson(url.toString());
  return ((res.data ?? []) as any[]).map((u) => ({
    externalId: String(u.id),
    name: u.name ?? '',
    email: u.email ?? null,
    active: u.active_flag !== false,
  }));
}

async listDestinations(token: string): Promise<Destination[]> {
  const [pRes, sRes] = await Promise.all([
    fetchJson(`https://api.pipedrive.com/v1/pipelines?api_token=${encodeURIComponent(token)}`),
    fetchJson(`https://api.pipedrive.com/v1/stages?api_token=${encodeURIComponent(token)}`),
  ]);
  const stagesByPipeline = new Map<number, any[]>();
  for (const st of (sRes.data ?? [])) {
    if (!stagesByPipeline.has(st.pipeline_id)) stagesByPipeline.set(st.pipeline_id, []);
    stagesByPipeline.get(st.pipeline_id)!.push(st);
  }
  const out: Destination[] = [];
  for (const p of (pRes.data ?? [])) {
    const stages = (stagesByPipeline.get(p.id) ?? []).sort((a: any, b: any) => a.order_nr - b.order_nr);
    if (stages.length === 0) continue;
    const first = stages[0];
    out.push({
      id: `pipeline:${p.id}|stage:${first.id}`,
      label: `${p.name} — ${first.name}`,
      group: p.name,
      pipelineId: String(p.id),
      stageId: String(first.id),
    });
  }
  return out;
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai-crm/supabase/functions/_shared/adapters" && /c/Users/prana/scoop/shims/deno check pipedrive.ts 2>&1 | tail -5
```
Expected: `Check pipedrive.ts` (no errors). Errors will appear because `findOrCreateOrganization`, `findOrCreatePerson`, `createDeal` aren't implemented yet — that's fine, fixed in next tasks.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/adapters/pipedrive.ts
git commit -m "feat(crm): Pipedrive fetchUsers + listDestinations

fetchUsers reads /v1/users for the owner-picker dropdown.
listDestinations flattens (pipeline × first stage) to a single dropdown
list shaped 'Pipeline Name — First Stage'."
```

---

### Task 5: Pipedrive `findOrCreateOrganization` + `findOrCreatePerson` + `createDeal`

**Files:**
- Modify: `supabase/functions/_shared/adapters/pipedrive.ts`

- [ ] **Step 1: Append the three methods inside `PipedriveAdapter` class**

Append (inside the class):

```typescript
async findOrCreateOrganization(
  token: string,
  input: OrgInput,
): Promise<{ externalId: string; created: boolean }> {
  if (!input.domain && !input.name) {
    throw new Error('org_input_empty');
  }

  // Try search by domain first (most reliable for B2B)
  if (input.domain) {
    const searchUrl = new URL('https://api.pipedrive.com/v1/organizations/search');
    searchUrl.searchParams.set('api_token', token);
    searchUrl.searchParams.set('term', input.domain);
    searchUrl.searchParams.set('fields', 'address,name');
    const r = await fetchJson(searchUrl.toString());
    const items = r.data?.items ?? [];
    if (items.length > 0) {
      return { externalId: String(items[0].item.id), created: false };
    }
  }

  // Fallback: search by name
  if (input.name) {
    const searchUrl = new URL('https://api.pipedrive.com/v1/organizations/search');
    searchUrl.searchParams.set('api_token', token);
    searchUrl.searchParams.set('term', input.name);
    searchUrl.searchParams.set('fields', 'name');
    const r = await fetchJson(searchUrl.toString());
    const items = r.data?.items ?? [];
    if (items.length > 0) {
      return { externalId: String(items[0].item.id), created: false };
    }
  }

  // Create
  const createUrl = `https://api.pipedrive.com/v1/organizations?api_token=${encodeURIComponent(token)}`;
  const body: any = { name: input.name ?? input.domain };
  const created = await fetchJson(createUrl, 1, { method: 'POST', body });
  return { externalId: String(created.data.id), created: true };
}

async findOrCreatePerson(
  token: string,
  input: PersonInput,
): Promise<{ externalId: string; created: boolean; raw?: unknown }> {
  // Search by email if available — most reliable signal
  if (input.email) {
    const searchUrl = new URL('https://api.pipedrive.com/v1/persons/search');
    searchUrl.searchParams.set('api_token', token);
    searchUrl.searchParams.set('term', input.email);
    searchUrl.searchParams.set('fields', 'email');
    searchUrl.searchParams.set('exact_match', 'true');
    const r = await fetchJson(searchUrl.toString());
    const items = r.data?.items ?? [];
    if (items.length > 0) {
      return { externalId: String(items[0].item.id), created: false };
    }
  }

  // Build the create payload
  const createBody: any = {
    name: input.name,
    visible_to: 3, // entire company — Pipedrive default
  };
  if (input.email) createBody.email = [{ value: input.email, primary: true, label: 'work' }];
  if (input.phone) createBody.phone = [{ value: input.phone, primary: true, label: 'work' }];
  if (input.organizationExternalId) createBody.org_id = Number(input.organizationExternalId);
  if (input.jobTitle) createBody.job_title = input.jobTitle;
  if (input.customFields) {
    for (const [k, v] of Object.entries(input.customFields)) {
      if (v !== undefined && v !== null) createBody[k] = v;
    }
  }

  const createUrl = `https://api.pipedrive.com/v1/persons?api_token=${encodeURIComponent(token)}`;
  const created = await fetchJson(createUrl, 1, { method: 'POST', body: createBody });
  return { externalId: String(created.data.id), created: true, raw: created.data };
}

async createDeal(token: string, input: DealInput): Promise<{ externalId: string }> {
  const body: any = {
    title: input.title,
    pipeline_id: Number(input.pipelineId),
    stage_id: Number(input.stageId),
    person_id: Number(input.personExternalId),
    visible_to: 3,
  };
  if (input.organizationExternalId) body.org_id = Number(input.organizationExternalId);
  if (input.ownerExternalId) body.user_id = Number(input.ownerExternalId);

  // Source attribution — these are STANDARD Pipedrive deal fields, settable directly
  if (input.sourceLabel) body.origin = input.sourceLabel;             // Pipedrive's standard 'origin' (Quellenherkunft)
  if (input.sourceId) body.origin_id = input.sourceId;                // 'origin_id' (ID der Ursprungsquelle)
  if (input.channelLabel) body.channel = input.channelLabel;          // 'channel' (Quellkanal)

  if (input.customFields) {
    for (const [k, v] of Object.entries(input.customFields)) {
      if (v !== undefined && v !== null) body[k] = v;
    }
  }

  const url = `https://api.pipedrive.com/v1/deals?api_token=${encodeURIComponent(token)}`;
  const created = await fetchJson(url, 1, { method: 'POST', body });
  return { externalId: String(created.data.id) };
}
```

- [ ] **Step 2: Update `fetchJson` to accept POST options**

Replace the current `fetchJson` implementation at the bottom of the file with:

```typescript
async function fetchJson(url: string, attempt = 1, opts?: { method?: string; body?: any }): Promise<any> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const init: RequestInit = { signal: ctrl.signal };
    if (opts?.method) init.method = opts.method;
    if (opts?.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, init);
    if (res.status === 401 || res.status === 403) {
      throw new InvalidTokenError();
    }
    if (res.status === 429 && attempt <= 3) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 250 * attempt;
      await new Promise(r => setTimeout(r, retryAfter));
      return fetchJson(url, attempt + 1, opts);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Pipedrive ${res.status}: ${txt.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai-crm/supabase/functions/_shared/adapters" && /c/Users/prana/scoop/shims/deno check pipedrive.ts 2>&1 | tail -5
```
Expected: `Check pipedrive.ts` clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/adapters/pipedrive.ts
git commit -m "feat(crm): Pipedrive findOrCreateOrg/Person + createDeal

Push primitives. Org find-or-create searches by domain first, falls
back to name. Person find-or-create searches by exact email match.
createDeal sets standard origin/origin_id/channel for the source-
attribution required by Spec C. fetchJson grew a body argument so
all four methods share the same retry-on-429 path."
```

---

## Phase 3 — Edge functions

### Task 6: Cache Pipedrive users on connect + refresh

**Files:**
- Modify: `supabase/functions/crm-test-connection/index.ts`
- Modify: `supabase/functions/crm-refresh-metadata/index.ts`

- [ ] **Step 1: Extend crm-test-connection**

In `crm-test-connection/index.ts`, after `metadata = await adapter.fetchFieldMetadata(token);`, fetch users and pass them through. Add (right before the `customFieldMappings = ...` line):

```typescript
let cachedUsers: any[] = [];
try {
  cachedUsers = await adapter.fetchUsers(token);
} catch (err) {
  console.warn('fetchUsers failed (non-fatal):', (err as Error).message);
}
```

Then after `finalize_crm_connection` succeeds, persist the users:

```typescript
// Persist cached users (best-effort; non-fatal if it fails)
if (integrationId && cachedUsers.length > 0) {
  await supabase
    .from('integrations')
    .update({ cached_users: cachedUsers })
    .eq('id', integrationId);
}
```

- [ ] **Step 2: Extend crm-refresh-metadata similarly**

Open `supabase/functions/crm-refresh-metadata/index.ts`. After the existing fetchFieldMetadata call, add:

```typescript
try {
  const users = await adapter.fetchUsers(token);
  if (users.length > 0) {
    await supabase.from('integrations').update({ cached_users: users }).eq('id', integration.id);
  }
} catch (err) {
  console.warn('fetchUsers refresh failed (non-fatal):', (err as Error).message);
}
```

- [ ] **Step 3: Redeploy both**

```bash
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-test-connection --no-verify-jwt 2>&1 | tail -3
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-refresh-metadata --no-verify-jwt 2>&1 | tail -3
```
Expected: both `Deployed Functions on project...`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/crm-test-connection/index.ts supabase/functions/crm-refresh-metadata/index.ts
git commit -m "feat(crm): cache Pipedrive users on connect + metadata refresh

Populates integrations.cached_users so the push modal can render its
owner picker without an extra round-trip on every modal open. Failures
are non-fatal — connect/refresh still succeed."
```

---

### Task 7: `crm-list-destinations` edge function

**Files:**
- Create: `supabase/functions/crm-list-destinations/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the function**

Create `supabase/functions/crm-list-destinations/index.ts`:

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter } from '../_shared/adapters/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
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
      return json({ error: 'unauthorized' }, 401);
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await supabase
      .from('profiles').select('workspace_id').eq('id', userId).maybeSingle();
    if (!profile?.workspace_id) return json({ error: 'no_workspace' }, 400);

    const { data: integ } = await supabase
      .from('integrations')
      .select('id, crm_type, status, cached_users')
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!integ) return json({ error: 'no_connected_integration' }, 404);
    if (integ.status !== 'connected') return json({ error: 'integration_error' }, 409);

    const { data: token } = await supabase.rpc('decrypt_integration_token', { p_integration_id: integ.id });
    if (!token) return json({ error: 'token_missing' }, 500);

    const adapter = getAdapter(integ.crm_type);
    const destinations = await adapter.listDestinations(token);

    return json({
      ok: true,
      destinations,
      users: integ.cached_users ?? [],
    }, 200, { 'Cache-Control': 'private, max-age=300' });
  } catch (err) {
    console.error('crm-list-destinations crash', (err as Error).message);
    return json({ error: 'crash' }, 500);
  }
});
```

- [ ] **Step 2: Pin verify_jwt=false**

Append to `supabase/config.toml`:

```toml
[functions.crm-list-destinations]
verify_jwt = false
```

- [ ] **Step 3: Deploy**

```bash
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-list-destinations --no-verify-jwt 2>&1 | tail -3
```

- [ ] **Step 4: Smoke test (auth gate only — full test needs a JWT)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-list-destinations
```
Expected: `401`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/crm-list-destinations/index.ts supabase/config.toml
git commit -m "feat(crm): crm-list-destinations edge function

JWT-authenticated. Returns the workspace's connected integration's
list of destinations (pipeline + first stage) and cached_users in one
call so the push modal hydrates with a single round-trip.
Cache-Control: private, max-age=300."
```

---

### Task 8: `crm-push` edge function

**Files:**
- Create: `supabase/functions/crm-push/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the function**

Create `supabase/functions/crm-push/index.ts`:

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter } from '../_shared/adapters/registry.ts';
import { normalizeEmail, extractDomain, normalizePhone } from '../_shared/normalize.ts';

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

const MAX_LEADS_PER_REQUEST = 100;

interface InputLead {
  record_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  domain?: string | null;
  organization?: string | null;
  title?: string | null;
  phone_1?: string | null;
  phone_2?: string | null;
  linkedin?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
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
      return json({ error: 'unauthorized' }, 401);
    }

    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const {
      destination_id,
      owner_external_id,
      search_id,
      search_name,
      leads,
    }: {
      destination_id: string;
      owner_external_id: string | null;
      search_id: string | null;
      search_name: string | null;
      leads: InputLead[];
    } = body;

    if (!destination_id) return json({ error: 'missing_destination_id' }, 400);
    if (!Array.isArray(leads) || leads.length === 0) return json({ error: 'missing_leads' }, 400);
    if (leads.length > MAX_LEADS_PER_REQUEST) {
      return json({ error: 'too_many_leads', max: MAX_LEADS_PER_REQUEST }, 400);
    }

    const m = destination_id.match(/^pipeline:(\w+)\|stage:(\w+)$/);
    if (!m) return json({ error: 'bad_destination_id' }, 400);
    const [, pipelineId, stageId] = m;

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await supabase
      .from('profiles').select('workspace_id').eq('id', userId).maybeSingle();
    if (!profile?.workspace_id) return json({ error: 'no_workspace' }, 400);

    const { data: integ } = await supabase
      .from('integrations')
      .select('id, crm_type, status, account_identifier')
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!integ) return json({ error: 'no_connected_integration' }, 404);
    if (integ.status !== 'connected') return json({ error: 'integration_error' }, 409);

    const { data: token } = await supabase.rpc('decrypt_integration_token', { p_integration_id: integ.id });
    if (!token) return json({ error: 'token_missing' }, 500);

    const adapter = getAdapter(integ.crm_type);
    const titlePrefix = Deno.env.get('CRM_PUSH_TITLE_PREFIX') ?? '';
    const destinationLabel = await resolveDestinationLabel(adapter, token, destination_id);

    const results: any[] = [];
    let succeeded = 0, failed = 0, idempotent = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      try {
        // Idempotency check
        const { data: existing } = await supabase
          .from('crm_pushes')
          .select('id, status, external_deal_id')
          .eq('integration_id', integ.id)
          .eq('bravoro_record_id', lead.record_id)
          .eq('destination_id', destination_id)
          .maybeSingle();

        if (existing && existing.status === 'success') {
          results.push({
            lead_index: i, record_id: lead.record_id,
            status: 'skipped_idempotent',
            external_deal_id: existing.external_deal_id,
            destination_label: destinationLabel,
          });
          idempotent++;
          continue;
        }

        // Build name + payload
        const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
                  || (lead.email ? lead.email.split('@')[0] : 'Unnamed Contact');
        const email = normalizeEmail(lead.email ?? null);
        const domain = lead.domain
          ? lead.domain.trim().toLowerCase()
          : (email ? extractDomain(email) : null);
        const phone = normalizePhone(lead.phone_1 ?? null) ?? normalizePhone(lead.phone_2 ?? null);

        // 1. Org
        let orgId: string | null = null;
        if (domain || lead.organization) {
          try {
            const o = await adapter.findOrCreateOrganization(token, {
              name: lead.organization ?? null,
              domain: domain ?? null,
            });
            orgId = o.externalId;
          } catch (err) {
            console.warn('org find/create failed (non-fatal):', (err as Error).message);
          }
        }

        // 2. Person (uses Plan A mirror as a hint via direct lookup before hitting CRM)
        let personId: string;
        if (email) {
          const { data: mirrorHit } = await supabase
            .from('crm_contacts')
            .select('external_id')
            .eq('integration_id', integ.id)
            .eq('email_normalized', email)
            .limit(1)
            .maybeSingle();
          if (mirrorHit) {
            personId = mirrorHit.external_id;
          } else {
            const p = await adapter.findOrCreatePerson(token, {
              name,
              email,
              phone,
              linkedIn: lead.linkedin ?? null,
              jobTitle: lead.title ?? null,
              organizationExternalId: orgId,
            });
            personId = p.externalId;
            // Update mirror so next dedup-check sees this Person without waiting for cron
            if (p.created) {
              await supabase.from('crm_contacts').upsert({
                integration_id: integ.id,
                external_id: personId,
                name,
                email_normalized: email,
                emails_all: [email],
                domain,
                phone_normalized: phone,
                raw: p.raw ?? { id: personId },
                last_synced_at: new Date().toISOString(),
              }, { onConflict: 'integration_id,external_id' });
            }
          }
        } else {
          const p = await adapter.findOrCreatePerson(token, {
            name,
            email: null,
            phone,
            linkedIn: lead.linkedin ?? null,
            jobTitle: lead.title ?? null,
            organizationExternalId: orgId,
          });
          personId = p.externalId;
        }

        // 3. Deal
        const title = `${titlePrefix}${name}${domain ? ` — ${domain}` : ''}`;
        const deal = await adapter.createDeal(token, {
          title,
          pipelineId,
          stageId,
          ownerExternalId: owner_external_id ?? null,
          personExternalId: personId,
          organizationExternalId: orgId,
          sourceLabel: 'Bravoro',
          sourceId: lead.record_id ?? null,
          channelLabel: search_name ?? null,
        });

        // Bookkeeping upsert
        await supabase.from('crm_pushes').upsert({
          integration_id: integ.id,
          workspace_id: profile.workspace_id,
          search_id: search_id ?? null,
          bravoro_record_id: lead.record_id,
          bravoro_email: email,
          destination_id,
          destination_label: destinationLabel,
          external_deal_id: deal.externalId,
          external_person_id: personId,
          external_org_id: orgId,
          status: 'success',
          error_message: null,
          pushed_by_user_id: userId,
          pushed_at: new Date().toISOString(),
        }, { onConflict: 'integration_id,bravoro_record_id,destination_id' });

        results.push({
          lead_index: i, record_id: lead.record_id,
          status: 'success',
          external_deal_id: deal.externalId,
          destination_label: destinationLabel,
        });
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from('crm_pushes').upsert({
          integration_id: integ.id,
          workspace_id: profile.workspace_id,
          search_id: search_id ?? null,
          bravoro_record_id: lead.record_id,
          bravoro_email: normalizeEmail(lead.email ?? null),
          destination_id,
          destination_label: destinationLabel,
          status: 'failed',
          error_message: msg.slice(0, 500),
          pushed_by_user_id: userId,
          pushed_at: new Date().toISOString(),
        }, { onConflict: 'integration_id,bravoro_record_id,destination_id' });
        results.push({
          lead_index: i, record_id: lead.record_id,
          status: 'failed',
          error_message: msg.slice(0, 500),
        });
        failed++;
      }
    }

    return json({
      ok: true,
      results,
      stats: { succeeded, failed, skipped_idempotent: idempotent },
    });
  } catch (err) {
    console.error('crm-push crash', (err as Error).message);
    return json({ error: 'crash' }, 500);
  }
});

async function resolveDestinationLabel(adapter: any, token: string, destinationId: string): Promise<string> {
  try {
    const dests = await adapter.listDestinations(token);
    const found = dests.find((d: any) => d.id === destinationId);
    return found?.label ?? destinationId;
  } catch {
    return destinationId;
  }
}
```

- [ ] **Step 2: Pin verify_jwt=false**

Append to `supabase/config.toml`:

```toml
[functions.crm-push]
verify_jwt = false
```

- [ ] **Step 3: Set the dev title prefix**

```bash
/c/Users/prana/scoop/shims/supabase.exe secrets set CRM_PUSH_TITLE_PREFIX="[BRAVORO TEST] " 2>&1 | tail -3
```
Expected: `Finished supabase secrets set.`

- [ ] **Step 4: Deploy**

```bash
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-push --no-verify-jwt 2>&1 | tail -3
```

- [ ] **Step 5: Smoke test (auth gate)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-push
```
Expected: `401`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/crm-push/index.ts supabase/config.toml
git commit -m "feat(crm): crm-push edge function

JWT-authenticated. Per-lead serial orchestration:
  1. Idempotency short-circuit via crm_pushes UNIQUE
  2. Org find-or-create (by domain → name → create)
  3. Person find via Plan A mirror (fast), or via Pipedrive search
     (exact-email), or create. New persons are written back to the
     mirror immediately so subsequent dedup-checks see them.
  4. Deal creation with source attribution (origin='Bravoro',
     origin_id=record_id, channel=search_name) and the
     [BRAVORO TEST] title prefix from CRM_PUSH_TITLE_PREFIX env.
  5. Bookkeeping upsert into crm_pushes.

Soft-cap of 100 leads per request keeps us under Supabase's 60s
edge-function timeout (each lead is ≤4 Pipedrive API calls ≈ 400ms;
100 × 400ms = 40s typical)."
```

---

## Phase 4 — Frontend

### Task 9: `useCrmPushes` hook + `useCrmDestinations` hook

**Files:**
- Create: `src/components/integrations/useCrmPushes.ts`
- Create: `src/components/integrations/useCrmDestinations.ts`

- [ ] **Step 1: Push history hook**

Create `src/components/integrations/useCrmPushes.ts`:

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CrmPushRow {
  id: string;
  bravoro_record_id: string | null;
  destination_id: string;
  destination_label: string;
  external_deal_id: string | null;
  status: 'success' | 'failed';
  pushed_at: string;
  error_message: string | null;
}

export function useCrmPushes(searchId?: string) {
  const [pushes, setPushes] = useState<Map<string, CrmPushRow>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!searchId) { setLoading(false); return; }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('crm_pushes')
        .select('id, bravoro_record_id, destination_id, destination_label, external_deal_id, status, pushed_at, error_message')
        .eq('search_id', searchId);
      if (cancelled) return;
      const map = new Map<string, CrmPushRow>();
      for (const r of (data ?? [])) {
        if (r.bravoro_record_id) map.set(r.bravoro_record_id, r as CrmPushRow);
      }
      setPushes(map);
      setLoading(false);
    })();

    channel = supabase
      .channel(`crm_pushes:${searchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_pushes',
        filter: `search_id=eq.${searchId}`,
      }, (payload) => {
        const row = (payload.new ?? payload.old) as CrmPushRow;
        if (!row.bravoro_record_id) return;
        setPushes((prev) => {
          const next = new Map(prev);
          if (payload.eventType === 'DELETE') next.delete(row.bravoro_record_id!);
          else next.set(row.bravoro_record_id!, row);
          return next;
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [searchId]);

  return { pushes, loading };
}
```

- [ ] **Step 2: Destinations hook**

Create `src/components/integrations/useCrmDestinations.ts`:

```typescript
import { useEffect, useState } from 'react';
import { invokeEdgeFunction } from '@/integrations/supabase/client';

export interface CrmDestination {
  id: string;
  label: string;
  group?: string;
}
export interface CrmUser {
  externalId: string;
  name: string;
  email: string | null;
  active: boolean;
}

interface State {
  loading: boolean;
  destinations: CrmDestination[];
  users: CrmUser[];
  error: string | null;
}

export function useCrmDestinations(open: boolean) {
  const [state, setState] = useState<State>({ loading: false, destinations: [], users: [], error: null });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    invokeEdgeFunction('crm-list-destinations', {})
      .then((res: any) => {
        if (cancelled) return;
        if (res?.ok) {
          setState({
            loading: false,
            destinations: res.destinations ?? [],
            users: res.users ?? [],
            error: null,
          });
        } else {
          setState({ loading: false, destinations: [], users: [], error: res?.error ?? 'unknown_error' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, destinations: [], users: [], error: err?.message ?? 'fetch_failed' });
      });
    return () => { cancelled = true; };
  }, [open]);

  return state;
}
```

- [ ] **Step 3: TS check**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit; echo "exit: $?"
```
Expected: `exit: 0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/integrations/useCrmPushes.ts src/components/integrations/useCrmDestinations.ts
git commit -m "feat(crm): React hooks for push history and destinations

useCrmPushes(searchId) returns a realtime-updating Map keyed by
bravoro_record_id so the Results table can render per-row push status
badges that update live as crm-push completes.

useCrmDestinations(open) calls crm-list-destinations once when its
arg flips to true; cached on the server (max-age=300)."
```

---

### Task 10: `PushToCrmModal` component

**Files:**
- Create: `src/components/integrations/PushToCrmModal.tsx`

- [ ] **Step 1: Write the modal**

Create `src/components/integrations/PushToCrmModal.tsx`:

```typescript
import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { invokeEdgeFunction } from '@/integrations/supabase/client';
import { useCrmDestinations, type CrmDestination } from './useCrmDestinations';
import { useCrmPushes } from './useCrmPushes';
import { useToast } from '@/hooks/use-toast';

interface LeadInput {
  record_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  domain?: string | null;
  organization?: string | null;
  title?: string | null;
  phone_1?: string | null;
  phone_2?: string | null;
  linkedin?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchId: string;
  searchName: string;
  leads: LeadInput[];
  currentUserEmail: string | null;
}

export function PushToCrmModal({ open, onOpenChange, searchId, searchName, leads, currentUserEmail }: Props) {
  const { destinations, users, loading: destsLoading, error: destsError } = useCrmDestinations(open);
  const { pushes } = useCrmPushes(searchId);
  const { toast } = useToast();

  const [destinationId, setDestinationId] = useState<string>('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  useEffect(() => {
    if (destinations.length > 0 && !destinationId) setDestinationId(destinations[0].id);
  }, [destinations, destinationId]);

  useEffect(() => {
    if (users.length === 0) { setOwnerId(''); return; }
    // Auto-match by email
    const match = currentUserEmail
      ? users.find((u) => u.active && u.email?.toLowerCase() === currentUserEmail.toLowerCase())
      : null;
    setOwnerId(match?.externalId ?? '');
  }, [users, currentUserEmail]);

  const newLeads = useMemo(
    () => leads.filter((l) => !pushes.get(l.record_id) || pushes.get(l.record_id)?.status === 'failed'),
    [leads, pushes],
  );

  const onPush = async () => {
    if (!destinationId || newLeads.length === 0) return;
    setPushing(true);
    setResults(null);
    try {
      const res: any = await invokeEdgeFunction('crm-push', {
        destination_id: destinationId,
        owner_external_id: ownerId || null,
        search_id: searchId,
        search_name: searchName,
        leads: newLeads,
      });
      if (!res?.ok) {
        toast({ title: 'Push failed', description: res?.error ?? 'Unknown error', variant: 'destructive' });
      } else {
        setResults(res.results ?? []);
        const s = res.stats ?? {};
        const summary = `${s.succeeded ?? 0} pushed, ${s.failed ?? 0} failed${s.skipped_idempotent ? `, ${s.skipped_idempotent} already pushed` : ''}`;
        toast({
          title: s.failed > 0 ? 'Push complete with errors' : 'Push complete',
          description: summary,
        });
      }
    } catch (err: any) {
      toast({ title: 'Push failed', description: err?.message ?? 'Network error', variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Push contacts to CRM</DialogTitle>
          <DialogDescription>
            {leads.length} contacts in this search. {pushes.size > 0 && `${pushes.size} already pushed.`}
          </DialogDescription>
        </DialogHeader>

        {destsError && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {destsError === 'no_connected_integration'
              ? 'No CRM connected. Connect Pipedrive in Settings → Integrations first.'
              : `Couldn't load destinations: ${destsError}`}
          </div>
        )}

        {!destsError && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Destination</label>
              <Select value={destinationId} onValueChange={setDestinationId} disabled={destsLoading || destinations.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={destsLoading ? 'Loading…' : 'Select destination'} />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Owner</label>
              <Select value={ownerId} onValueChange={setOwnerId} disabled={destsLoading || users.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {users.filter((u) => u.active).map((u) => (
                    <SelectItem key={u.externalId} value={u.externalId}>
                      {u.name}{u.email ? ` · ${u.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {results && (
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1 text-xs">
                {results.map((r) => (
                  <div key={r.record_id} className="flex items-center gap-2">
                    {r.status === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                    {r.status === 'skipped_idempotent' && <CheckCircle2 className="h-3 w-3 text-muted-foreground" />}
                    {r.status === 'failed' && <AlertCircle className="h-3 w-3 text-destructive" />}
                    <span className="truncate">{r.record_id}</span>
                    <span className="text-muted-foreground ml-auto">{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>
            Cancel
          </Button>
          <Button
            onClick={onPush}
            disabled={pushing || destsLoading || !destinationId || newLeads.length === 0 || !!destsError}
            className="gap-2"
          >
            {pushing && <Loader2 className="h-4 w-4 animate-spin" />}
            <Upload className="h-4 w-4" />
            Push {newLeads.length} {newLeads.length === 1 ? 'contact' : 'contacts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: TS check**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit; echo "exit: $?"
```
Expected: `exit: 0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/PushToCrmModal.tsx
git commit -m "feat(crm): PushToCrmModal component

Modal opens with destination + owner selectors auto-populated from
crm-list-destinations. Auto-matches the current Bravoro user's email
against cached Pipedrive users for the default owner. Filters out
already-pushed leads (per-record idempotency observed via
useCrmPushes). On submit calls crm-push and renders per-row status."
```

---

### Task 11: Wire the Push button into Results

**Files:**
- Modify: `src/pages/Results.tsx`

- [ ] **Step 1: Wire it in**

Open `src/pages/Results.tsx`. Locate the Export Excel button block (~L916-924). Right BEFORE that `<Button>`, add a Push to CRM button + the modal.

Find the existing import block at the top of the file and add:

```typescript
import { Upload } from 'lucide-react';
import { PushToCrmModal } from '@/components/integrations/PushToCrmModal';
import { useCrmPushes } from '@/components/integrations/useCrmPushes';
import { useIntegration } from '@/components/integrations/useIntegration';
```

(If `useIntegration` is already imported elsewhere, skip that import line.)

Inside the `Results` component (after other state declarations), add:

```typescript
const [pushModalSearchId, setPushModalSearchId] = useState<string | null>(null);
const { integration } = useIntegration();
```

Then in the JSX, find the contacts-panel header (around L911):

```tsx
<div className="flex items-center gap-2">
  <Button
    size="sm"
    variant="outline"
    onClick={() => handleExportPeopleEnrichment(search.id)}
```

Change to:

```tsx
<div className="flex items-center gap-2">
  <Button
    size="sm"
    variant="outline"
    onClick={() => setPushModalSearchId(search.id)}
    disabled={!integration || integration.status !== 'connected' || allContacts.length === 0}
    className="hover-lift border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
    title={
      !integration
        ? 'Connect a CRM in Settings → Integrations to enable push'
        : integration.status !== 'connected'
          ? 'Reconnect your CRM to enable push'
          : allContacts.length === 0
            ? 'No contacts to push'
            : `Push ${allContacts.length} contacts to CRM`
    }
  >
    <Upload className="h-4 w-4 mr-2" />
    Push to CRM
  </Button>
  <Button
    size="sm"
    variant="outline"
    onClick={() => handleExportPeopleEnrichment(search.id)}
```

At the bottom of the `Results` component's return (before the closing tag), mount the modal once:

```tsx
{pushModalSearchId && (() => {
  const searchData = searches.find((s) => s.id === pushModalSearchId);
  if (!searchData) return null;
  const allContacts = (searchData.results ?? [])
    .flatMap((r: any) => r.contact_data ?? [])
    .filter((c: any) => c);
  return (
    <PushToCrmModal
      open={!!pushModalSearchId}
      onOpenChange={(o) => { if (!o) setPushModalSearchId(null); }}
      searchId={pushModalSearchId}
      searchName={searchData.search_name ?? ''}
      currentUserEmail={user?.email ?? null}
      leads={allContacts.map((c: any) => ({
        record_id: c.Record_ID ?? `${pushModalSearchId}-${c.Email ?? c.First_Name ?? Math.random()}`,
        first_name: c.First_Name ?? null,
        last_name: c.Last_Name ?? null,
        email: c.Email ?? null,
        domain: c.Domain ?? null,
        organization: c.Organization ?? null,
        title: c.Title ?? null,
        phone_1: c.Phone_Number_1 ?? null,
        phone_2: c.Phone_Number_2 ?? null,
        linkedin: c.LinkedIn ?? null,
      }))}
    />
  );
})()}
```

(Note on `record_id` fallback: if a contact has no `Record_ID`, we synthesise one from `searchId + email/name`. This is enough for in-search idempotency.)

- [ ] **Step 2: TS check**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit; echo "exit: $?"
```
Expected: `exit: 0`. If `user` is not in scope, import `useAuth` from the appropriate hook (`@/hooks/useAuth` or wherever the project gets the auth user).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Results.tsx
git commit -m "feat(crm): Push to CRM button on Results page

Sits next to Export Excel. Disabled with explanatory tooltip when no
integration is connected, integration is in error state, or panel is
empty. Opens PushToCrmModal with the panel's enriched contacts mapped
to the lead shape crm-push expects (Record_ID is the idempotency
key; falls back to search+email for legacy results)."
```

---

## Phase 5 — Final validation

### Task 12: End-to-end smoke test

These steps require the user to have connected Pipedrive in the UI.

- [ ] **Step 1: Verify edge functions are reachable**

```bash
echo "list-destinations 401 (no JWT):"
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-list-destinations
echo "push 401 (no JWT):"
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-push
```
Expected: both `401`.

- [ ] **Step 2: User opens Results, clicks Push to CRM**

(Manual.) The modal should:
- Populate destination dropdown with all 7 Pipedrive pipelines × first stage
- Populate owner dropdown with all active Pipedrive users (Sertac, Elisa, Jan, Jonas)
- Auto-default owner to the matched current user, or "Unassigned"
- Disable "Push N contacts" button when no destination selected

- [ ] **Step 3: User pushes a small batch (≤5 contacts) to "Bravoro Leads Elisa — Unbearbeitet"**

Expected:
- Spinner during push
- Toast on completion
- Per-row results visible in modal
- Re-clicking Push shows leads as "skipped_idempotent" (no duplicate Deals in Pipedrive)

- [ ] **Step 4: Verify in Pipedrive**

Open Pipedrive → Deals → "Bravoro Leads Elisa" pipeline. Each pushed contact should appear as a Deal in the "Unbearbeitet" column with title prefix `[BRAVORO TEST]`. Each Deal should have:
- Linked Person (visible in Deal detail panel)
- Linked Organization (if domain was provided)
- `Quellenherkunft` = "Bravoro" (under "Quelle" panel)
- `ID der Ursprungsquelle` = the Bravoro record_id
- `Quellkanal` = the search name
- Owner = the chosen owner

- [ ] **Step 5: Cleanup helper**

Filter by `Quellenherkunft = "Bravoro"` in the Deals view, select all, delete. (This is the user's cleanup procedure — not run automatically.)

- [ ] **Step 6: Final commit, if any test follow-ups**

```bash
git add -A
git commit -m "fix(crm): push smoke-test follow-ups

<observations from manual smoke test>"
```

---

## Acceptance criteria — verify before merging to main

- [ ] All Plan A acceptance criteria still pass (mirror, sync, dedup-check)
- [ ] `npx tsc --noEmit` shows no NEW errors from this plan
- [ ] All 4 edge functions deployed and respond 401 without auth: `crm-list-destinations`, `crm-push`, plus the existing `crm-sync-contacts`, `crm-dedup-check`
- [ ] User can connect Pipedrive, open Results, click Push to CRM, and successfully push ≥1 contact — Deal visible in Pipedrive with all expected attribution
- [ ] Re-pushing the same contact short-circuits as `skipped_idempotent`; no duplicate Deal in Pipedrive
- [ ] No tokens or secrets leaked into git history: `git log -p | grep -iE 'pipedrive.*token|api_token=[a-z0-9]{20,}|c[0-9a-f]{30,}'` returns empty
- [ ] `.dev-notes/` is gitignored and contains no committed files
- [ ] Pre-existing M1 functionality (connect, disconnect, refresh, health-check) still works

When all boxes ticked: ready for draft PR + merge to main.
