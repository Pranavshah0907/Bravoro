# CRM Contact Mirror + Dedup API — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the workspace-scoped CRM contact mirror plus the n8n-callable dedup-check API end-to-end on Pipedrive — Bravoro mirrors all Pipedrive Persons every 30 minutes, and n8n calls a single edge function before enrichment that returns `unique` / `duplicate` per lead.

**Architecture:** New `crm_contacts` table (workspace-scoped, indexed for email/domain/fuzzy-name lookups) + an extension to the existing CRM adapter (`fetchContacts`) + two new edge functions (`crm-sync-contacts` cron-driven and `crm-dedup-check` user-data-driven), both protected by a shared Bearer secret. Initial backfill is fired immediately after first successful connect; subsequent deltas run via an n8n cron every 30 minutes.

**Tech Stack:** Deno (Supabase edge functions), TypeScript, Postgres + pg_trgm, native `fetch` for Pipedrive API, Supabase Vault via existing RPC wrappers, n8n cron for scheduling.

**Spec this plan implements:** `docs/superpowers/specs/2026-05-06-crm-contact-mirror-and-dedup-api-design.md`

**Branch:** continues on `feat/crm-dedup-m1`. No new branch needed.

---

## Preflight

- [ ] **Preflight 1: Verify Supabase CLI is linked**

```bash
/c/Users/prana/scoop/shims/supabase.exe projects list 2>&1 | grep ggvhwxpaovfvoyvzixqw | head -1
```
Expected: a row with `LINKED |` (the leading column) populated.
If not linked: `/c/Users/prana/scoop/shims/supabase.exe link --project-ref ggvhwxpaovfvoyvzixqw`.

- [ ] **Preflight 2: Verify CRM_DEDUP_SECRET is set on the linked project**

```bash
/c/Users/prana/scoop/shims/supabase.exe secrets list 2>&1 | grep CRM_DEDUP_SECRET
```
Expected: a row showing `CRM_DEDUP_SECRET | <hash>`.
If missing: regenerate per the `.dev-notes/crm-dedup-secret.local.txt` setup steps (see Spec A §10.1).

- [ ] **Preflight 3: Confirm M1 schema is in place**

```bash
/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='integrations' ORDER BY ordinal_position;" 2>&1 | head -20
```
Expected: rows for `id, workspace_id, crm_type, account_identifier, account_display_name, status, last_checked_at, last_error, custom_field_mappings, connected_by_user_id, created_at, updated_at`.

---

## Phase 1 — Database migration

### Task 1: Migration for `crm_contacts` + sync state on `integrations`

**Files:**
- Create: `supabase/migrations/20260506000000_add_crm_contacts_mirror.sql`

- [ ] **Step 1: Create the migration file**

File content (copy exactly):

```sql
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
```

- [ ] **Step 2: Apply the migration against the linked Supabase project**

```bash
/c/Users/prana/scoop/shims/supabase.exe db push --linked --include-all 2>&1 | tail -20
```
Expected: `Applying migration 20260506000000_add_crm_contacts_mirror.sql...` followed by `Finished supabase db push.`

- [ ] **Step 3: Verify the table and indexes exist**

```bash
/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT tablename, indexname FROM pg_indexes WHERE tablename = 'crm_contacts' ORDER BY indexname;" 2>&1
```
Expected: 6 rows (1 PK + 5 explicit indexes).

```bash
/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='integrations' AND column_name LIKE 'contacts_%' ORDER BY column_name;" 2>&1
```
Expected: 3 rows (`contacts_initial_synced, contacts_last_synced_at, contacts_sync_error`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506000000_add_crm_contacts_mirror.sql
git commit -m "feat(crm): crm_contacts mirror table + sync state on integrations

Adds the workspace-scoped Pipedrive Person mirror that backs Spec A's
dedup-check. Indexes cover the three match layers: email exact, email-
in-emails-array (GIN), domain + fuzzy name (pg_trgm GIN). RLS is enabled
with no authenticated-role policies (service role only)."
```

---

### Task 2: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Regenerate types**

```bash
/c/Users/prana/scoop/shims/supabase.exe gen types typescript --linked > src/integrations/supabase/types.ts 2>&1
```
Expected: file rewritten, no error output.

- [ ] **Step 2: Verify the new table appears in the generated types**

```bash
grep -c "crm_contacts" src/integrations/supabase/types.ts
```
Expected: ≥ 3 occurrences.

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit 2>&1 | tail -5
```
Expected: no errors. (If errors are unrelated to crm_contacts, document them and proceed; do not "fix" pre-existing breakage in this task.)

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate Supabase types for crm_contacts mirror"
```

---

## Phase 2 — Shared utilities

### Task 3: Normalization helpers

**Files:**
- Create: `supabase/functions/_shared/normalize.ts`
- Create: `supabase/functions/_shared/normalize.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `supabase/functions/_shared/normalize.test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeEmail, extractDomain, normalizePhone } from './normalize.ts';

Deno.test('normalizeEmail lowercases and trims', () => {
  assertEquals(normalizeEmail('  Max@Example.DE  '), 'max@example.de');
});

Deno.test('normalizeEmail returns null for empty', () => {
  assertEquals(normalizeEmail(''), null);
  assertEquals(normalizeEmail('   '), null);
  assertEquals(normalizeEmail(null), null);
  assertEquals(normalizeEmail(undefined), null);
});

Deno.test('extractDomain pulls and lowercases', () => {
  assertEquals(extractDomain('Max@Example.DE'), 'example.de');
});

Deno.test('extractDomain returns null when no @', () => {
  assertEquals(extractDomain('not-an-email'), null);
  assertEquals(extractDomain(null), null);
});

Deno.test('normalizePhone strips spaces and punctuation, keeps leading +', () => {
  assertEquals(normalizePhone('+49 (30) 12-345 678'), '+493012345678');
});

Deno.test('normalizePhone preserves leading + only', () => {
  assertEquals(normalizePhone('0049 30 12345678'), '00493012345678');
});

Deno.test('normalizePhone returns null for empty/no digits', () => {
  assertEquals(normalizePhone(''), null);
  assertEquals(normalizePhone('---'), null);
  assertEquals(normalizePhone(null), null);
});
```

- [ ] **Step 2: Run tests to verify they fail (module not found)**

```bash
cd supabase/functions/_shared && deno test --allow-net normalize.test.ts 2>&1 | tail -10
```
Expected: errors like `Module not found "./normalize.ts"`.

- [ ] **Step 3: Implement normalize.ts**

Create `supabase/functions/_shared/normalize.ts`:

```typescript
// Normalization helpers used by the contact mirror, dedup-check,
// and push edge functions. Pure functions, no side effects.

export function normalizeEmail(input: string | null | undefined): string | null {
  if (input == null) return null;
  const v = input.trim().toLowerCase();
  if (v.length === 0) return null;
  return v;
}

export function extractDomain(input: string | null | undefined): string | null {
  if (input == null) return null;
  const at = input.indexOf('@');
  if (at < 0) return null;
  const dom = input.slice(at + 1).trim().toLowerCase();
  return dom.length === 0 ? null : dom;
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const leadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 0) return null;
  return (leadingPlus ? '+' : '') + digitsOnly;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd supabase/functions/_shared && deno test --allow-net normalize.test.ts 2>&1 | tail -10
```
Expected: `ok | 7 passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/normalize.ts supabase/functions/_shared/normalize.test.ts
git commit -m "feat(crm): normalize.ts shared helpers (email/domain/phone)

Pure functions used by the contact mirror upserts, dedup-check matching,
and push payload construction. Covered by 7 unit tests."
```

---

## Phase 3 — Adapter interface + Pipedrive implementation

### Task 4: Extend the adapter interface

**Files:**
- Modify: `supabase/functions/_shared/adapters/types.ts`

- [ ] **Step 1: Add the new interface members**

Open `supabase/functions/_shared/adapters/types.ts` and append (do NOT modify existing exports):

```typescript
// ─── Spec A: contact mirror + dedup ────────────────────────────────────────

export interface FetchContactsOpts {
  /** ISO-8601; if provided, fetch only contacts updated >= this time. */
  sinceISO?: string;
  /** Page size. Default 500. */
  pageSize?: number;
}

export interface NormalizedContact {
  externalId: string;
  name: string | null;
  emails: string[];
  primaryEmail: string | null;
  phones: string[];
  raw: unknown;
  /** ISO-8601 timestamp from the source CRM's update_time. */
  updatedAtISO: string;
}
```

Then update the `CrmAdapter` interface to add the new method (do NOT remove existing methods):

```typescript
export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
  // NEW (Spec A):
  fetchContacts(token: string, opts?: FetchContactsOpts): AsyncGenerator<NormalizedContact, void, void>;
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit 2>&1 | tail -5
```
Expected: errors only for `PipedriveAdapter` not implementing the new method (these are fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/adapters/types.ts
git commit -m "feat(crm): adapter interface gains fetchContacts (Spec A)

Adds NormalizedContact, FetchContactsOpts, and the fetchContacts async
generator method to the CrmAdapter interface. Pipedrive implementation
follows in the next commit."
```

---

### Task 5: Pipedrive `fetchContacts` — full backfill path

**Files:**
- Modify: `supabase/functions/_shared/adapters/pipedrive.ts`

- [ ] **Step 1: Add the implementation**

Open `supabase/functions/_shared/adapters/pipedrive.ts`. At the top, ensure the import line includes the new types (modify existing import block):

```typescript
import type {
  CrmAdapter, ConnectionResult, FieldMetadata, FieldDef, CustomFieldMappings,
  FetchContactsOpts, NormalizedContact,
} from './types.ts';
import { InvalidTokenError } from './types.ts';
import { normalizeEmail, extractDomain, normalizePhone } from '../normalize.ts';
```

Inside the `PipedriveAdapter` class, after `autoMapCustomFields`, add:

```typescript
async *fetchContacts(
  token: string,
  opts: FetchContactsOpts = {},
): AsyncGenerator<NormalizedContact, void, void> {
  const pageSize = opts.pageSize ?? 500;

  if (opts.sinceISO) {
    yield* this.fetchContactsDelta(token, opts.sinceISO, pageSize);
  } else {
    yield* this.fetchContactsBackfill(token, pageSize);
  }
}

private async *fetchContactsBackfill(
  token: string,
  pageSize: number,
): AsyncGenerator<NormalizedContact, void, void> {
  let start = 0;
  while (true) {
    const url = new URL('https://api.pipedrive.com/v1/persons');
    url.searchParams.set('api_token', token);
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('sort', 'update_time ASC');
    const res = await fetchJson(url.toString());
    const items = res.data ?? [];
    if (items.length === 0) return;
    for (const p of items) yield normalizePerson(p);
    if (!res.additional_data?.pagination?.more_items_in_collection) return;
    start = res.additional_data.pagination.next_start;
  }
}

private async *fetchContactsDelta(
  token: string,
  sinceISO: string,
  pageSize: number,
): AsyncGenerator<NormalizedContact, void, void> {
  // /v1/recents accepts a since_timestamp in 'YYYY-MM-DD HH:MM:SS' form (UTC).
  const ts = isoToPipedriveStamp(sinceISO);
  let start = 0;
  while (true) {
    const url = new URL('https://api.pipedrive.com/v1/recents');
    url.searchParams.set('api_token', token);
    url.searchParams.set('since_timestamp', ts);
    url.searchParams.set('items', 'person');
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(pageSize));
    const res = await fetchJson(url.toString());
    const items = res.data ?? [];
    if (items.length === 0) return;
    for (const wrapper of items) {
      // /v1/recents wraps each item: { item: 'person', id, data: {...} }
      const p = wrapper.data ?? wrapper;
      yield normalizePerson(p);
    }
    if (!res.additional_data?.pagination?.more_items_in_collection) return;
    start = res.additional_data.pagination.next_start;
  }
}
```

At the bottom of the file (after the existing helper functions), add:

```typescript
function normalizePerson(p: any): NormalizedContact {
  const emails: string[] = ((p.email ?? []) as Array<{ value?: string }>)
    .map((e) => normalizeEmail(e?.value))
    .filter((s): s is string => s != null);
  const phones: string[] = ((p.phone ?? []) as Array<{ value?: string }>)
    .map((t) => normalizePhone(t?.value))
    .filter((s): s is string => s != null);
  const updatedAtISO = pipedriveStampToISO(p.update_time)
    ?? new Date().toISOString();
  return {
    externalId: String(p.id),
    name: p.name ?? null,
    emails,
    primaryEmail: emails[0] ?? null,
    phones,
    raw: p,
    updatedAtISO,
  };
}

function isoToPipedriveStamp(iso: string): string {
  // 'YYYY-MM-DDTHH:MM:SS.sssZ' → 'YYYY-MM-DD HH:MM:SS' (UTC, drop ms)
  return iso.replace('T', ' ').replace(/\..*$/, '').replace('Z', '');
}

function pipedriveStampToISO(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  // 'YYYY-MM-DD HH:MM:SS' (UTC) → ISO with Z
  return stamp.replace(' ', 'T') + 'Z';
}
```

Note: `fetchJson` is already defined earlier in the file (used by testConnection). Reuse as-is.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit 2>&1 | grep -E "pipedrive|adapter" | head -5
```
Expected: no errors related to pipedrive.ts or adapter interface.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/adapters/pipedrive.ts
git commit -m "feat(crm): Pipedrive fetchContacts (backfill + delta paths)

Backfill paginates /v1/persons sorted by update_time ASC. Delta uses
/v1/recents with since_timestamp + items=person, which is purpose-built
for incremental sync. Both return the same NormalizedContact shape via
the shared normalizePerson helper."
```

---

## Phase 4 — Edge functions

### Task 6: `crm-sync-contacts` edge function

**Files:**
- Create: `supabase/functions/crm-sync-contacts/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/crm-sync-contacts/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adapterFor } from '../_shared/adapters/registry.ts';
import { extractDomain } from '../_shared/normalize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const SAFETY_OVERLAP_MS = 5 * 60 * 1000; // re-fetch 5 min behind on every delta
const PAGE = 200;                         // upsert batch size

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get('CRM_DEDUP_SECRET');
  if (!expectedSecret) {
    return json({ error: 'secret_not_configured' }, 500);
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expectedSecret}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const totals: Record<string, number> = { synced: 0, errored: 0 };
  let syncedIntegrations = 0;
  let from = 0;
  const limit = 50;

  while (true) {
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('id, workspace_id, crm_type, contacts_last_synced_at, contacts_initial_synced')
      .eq('status', 'connected')
      .range(from, from + limit - 1);

    if (error) {
      console.error('integrations query failed', error.message);
      return json({ error: 'db_error', message: error.message }, 500);
    }
    if (!integrations || integrations.length === 0) break;

    for (const integ of integrations) {
      try {
        await syncOne(supabase, integ);
        syncedIntegrations++;
        totals.synced++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`sync failed for integration ${integ.id}: ${msg}`);
        totals.errored++;
        await supabase.from('integrations').update({
          contacts_sync_error: msg.slice(0, 500),
        }).eq('id', integ.id);
      }
    }

    if (integrations.length < limit) break;
    from += limit;
  }

  return json({ ok: true, syncedIntegrations, totals });
});

async function syncOne(supabase: any, integ: any) {
  const adapter = adapterFor(integ.crm_type);
  if (!adapter || typeof adapter.fetchContacts !== 'function') {
    throw new Error(`adapter does not support fetchContacts: ${integ.crm_type}`);
  }

  const { data: token, error: tokErr } = await supabase.rpc('decrypt_integration_token', {
    p_integration_id: integ.id,
  });
  if (tokErr || !token) throw new Error('token_missing');

  const sinceISO = !integ.contacts_initial_synced || !integ.contacts_last_synced_at
    ? undefined
    : new Date(new Date(integ.contacts_last_synced_at).getTime() - SAFETY_OVERLAP_MS).toISOString();

  let buffer: any[] = [];
  for await (const c of adapter.fetchContacts(token, { sinceISO })) {
    buffer.push({
      integration_id: integ.id,
      external_id: c.externalId,
      name: c.name,
      email_normalized: c.primaryEmail,
      emails_all: c.emails,
      domain: c.primaryEmail ? extractDomain(c.primaryEmail) : null,
      phone_normalized: c.phones[0] ?? null,
      raw: c.raw,
      last_synced_at: new Date().toISOString(),
    });
    if (buffer.length >= PAGE) {
      await flush(supabase, buffer);
      buffer = [];
    }
  }
  if (buffer.length > 0) await flush(supabase, buffer);

  await supabase.from('integrations').update({
    contacts_last_synced_at: new Date().toISOString(),
    contacts_initial_synced: true,
    contacts_sync_error: null,
  }).eq('id', integ.id);
}

async function flush(supabase: any, batch: any[]) {
  const { error } = await supabase
    .from('crm_contacts')
    .upsert(batch, { onConflict: 'integration_id,external_id' });
  if (error) throw new Error(`upsert_failed: ${error.message}`);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Pin verify_jwt=false in config.toml**

Open `supabase/config.toml`. Add at the bottom (alphabetical with the rest, but bottom is fine):

```toml
[functions.crm-sync-contacts]
verify_jwt = false
```

- [ ] **Step 3: Deploy**

```bash
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-sync-contacts --no-verify-jwt 2>&1 | tail -10
```
Expected: `Deployed Function: crm-sync-contacts`.

- [ ] **Step 4: Smoke test — auth gate**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
```
Expected: `401`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer wrong" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
```
Expected: `401`.

- [ ] **Step 5: Smoke test — happy path with the real secret**

```bash
SECRET=$(grep CRM_DEDUP_SECRET= .dev-notes/crm-dedup-secret.local.txt | cut -d= -f2)
curl -s -X POST \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
```
Expected: `{"ok":true,"syncedIntegrations":<N>,"totals":{"synced":<N>,"errored":0}}`. If the user has connected Pipedrive via the UI, N≥1; otherwise N=0 and the function returns successfully with no integrations processed.

- [ ] **Step 6: If a real integration was synced — verify the mirror has rows**

```bash
/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT count(*) AS contacts, count(distinct integration_id) AS integrations FROM public.crm_contacts;" 2>&1
```
Expected (if user connected): `contacts ≥ 1, integrations ≥ 1`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/crm-sync-contacts/index.ts supabase/config.toml
git commit -m "feat(crm): crm-sync-contacts edge function

Iterates connected integrations, decrypts the Vault token, calls the
adapter's fetchContacts (backfill or delta based on
contacts_last_synced_at), and upserts into crm_contacts in batches of
200. On per-integration failure, the error is captured in
contacts_sync_error and other integrations continue. Bearer-secret
auth (CRM_DEDUP_SECRET)."
```

---

### Task 7: `crm-dedup-check` edge function

**Files:**
- Create: `supabase/functions/crm-dedup-check/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/crm-dedup-check/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeEmail, extractDomain } from '../_shared/normalize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const NAME_SIMILARITY_THRESHOLD = 0.6;

interface InputLead {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  domain?: string | null;
}

interface OutputResult {
  lead_index: number;
  verdict: 'unique' | 'duplicate';
  matched_external_id?: string;
  matched_via?: 'email_exact' | 'email_in_emails_all' | 'name_domain_fuzzy';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get('CRM_DEDUP_SECRET');
  if (!expectedSecret) return json({ error: 'secret_not_configured' }, 500);

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expectedSecret}`) return json({ error: 'unauthorized' }, 401);

  let body: { workspace_id?: string; leads?: InputLead[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { workspace_id, leads } = body;
  if (!workspace_id) return json({ error: 'missing_workspace_id' }, 400);
  if (!Array.isArray(leads)) return json({ error: 'missing_leads' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: integ, error: integErr } = await supabase
    .from('integrations')
    .select('id, status, contacts_initial_synced')
    .eq('workspace_id', workspace_id)
    .maybeSingle();

  if (integErr) return json({ error: 'db_error', message: integErr.message }, 500);

  const allUnique = (reason?: string) => json({
    ok: true,
    results: leads.map((_, i) => ({ lead_index: i, verdict: 'unique' as const })),
    stats: {
      checked: leads.length, duplicates: 0, unique: leads.length,
      ...(reason ? { skipped_reason: reason } : {}),
    },
  });

  if (!integ) return allUnique('no_integration');
  if (integ.status === 'error') return allUnique('integration_error');
  if (!integ.contacts_initial_synced) return allUnique('backfill_in_progress');

  const results: OutputResult[] = [];
  let dupes = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const email = normalizeEmail(lead.email ?? null);
    const domain = lead.domain ? lead.domain.trim().toLowerCase() : (email ? extractDomain(email) : null);
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || null;

    let match: OutputResult | null = null;

    // Layer 1: exact primary email
    if (email && !match) {
      const { data } = await supabase
        .from('crm_contacts')
        .select('external_id')
        .eq('integration_id', integ.id)
        .eq('email_normalized', email)
        .limit(1)
        .maybeSingle();
      if (data) match = { lead_index: i, verdict: 'duplicate', matched_external_id: data.external_id, matched_via: 'email_exact' };
    }

    // Layer 2: email in emails_all
    if (email && !match) {
      const { data } = await supabase
        .from('crm_contacts')
        .select('external_id')
        .eq('integration_id', integ.id)
        .contains('emails_all', [email])
        .limit(1)
        .maybeSingle();
      if (data) match = { lead_index: i, verdict: 'duplicate', matched_external_id: data.external_id, matched_via: 'email_in_emails_all' };
    }

    // Layer 3: fuzzy name + same domain
    if (domain && name && !match) {
      const { data } = await supabase.rpc('crm_contact_fuzzy_name_match', {
        p_integration_id: integ.id,
        p_domain: domain,
        p_name: name,
        p_threshold: NAME_SIMILARITY_THRESHOLD,
      });
      if (data && Array.isArray(data) && data.length > 0) {
        match = { lead_index: i, verdict: 'duplicate', matched_external_id: data[0].external_id, matched_via: 'name_domain_fuzzy' };
      }
    }

    if (match) { results.push(match); dupes++; }
    else { results.push({ lead_index: i, verdict: 'unique' }); }
  }

  return json({
    ok: true,
    results,
    stats: { checked: leads.length, duplicates: dupes, unique: leads.length - dupes },
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Add the fuzzy match RPC**

Create a follow-up migration `supabase/migrations/20260506000001_add_crm_dedup_rpc.sql`:

```sql
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
```

Apply it:

```bash
/c/Users/prana/scoop/shims/supabase.exe db push --linked --include-all 2>&1 | tail -5
```
Expected: `Applying migration 20260506000001_add_crm_dedup_rpc.sql...` then `Finished`.

- [ ] **Step 3: Pin verify_jwt=false**

Append to `supabase/config.toml`:

```toml
[functions.crm-dedup-check]
verify_jwt = false
```

- [ ] **Step 4: Deploy**

```bash
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-dedup-check --no-verify-jwt 2>&1 | tail -5
```
Expected: `Deployed Function: crm-dedup-check`.

- [ ] **Step 5: Smoke test — auth gate**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: `401`.

- [ ] **Step 6: Smoke test — request validation**

```bash
SECRET=$(grep CRM_DEDUP_SECRET= .dev-notes/crm-dedup-secret.local.txt | cut -d= -f2)
curl -s -X POST \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  --data '{}' \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: `{"error":"missing_workspace_id"}`.

- [ ] **Step 7: Smoke test — no integration / fail-open**

Get a workspace_id (any valid one):

```bash
WS=$(/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT id FROM public.workspaces LIMIT 1;" 2>&1 | tail -1 | tr -d ' ')
echo "Workspace: $WS"
SECRET=$(grep CRM_DEDUP_SECRET= .dev-notes/crm-dedup-secret.local.txt | cut -d= -f2)
curl -s -X POST \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  --data "{\"workspace_id\":\"$WS\",\"leads\":[{\"email\":\"test@example.com\"}]}" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```

Expected:
- If no integration: `{"ok":true,"results":[{"lead_index":0,"verdict":"unique"}],"stats":{...,"skipped_reason":"no_integration"}}`
- If integration backfilling: `..."skipped_reason":"backfill_in_progress"`
- If integration ready and lead novel: `..."verdict":"unique"`
- If integration ready and lead matches: `..."verdict":"duplicate","matched_via":"email_exact"`

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/crm-dedup-check/index.ts supabase/migrations/20260506000001_add_crm_dedup_rpc.sql supabase/config.toml
git commit -m "feat(crm): crm-dedup-check edge function + fuzzy match RPC

Three-layer match: email exact (indexed), email-in-emails_all (GIN),
fuzzy name + same domain (pg_trgm via crm_contact_fuzzy_name_match RPC).
Fail-open in every degraded state (no integration / status=error /
backfill not yet complete) — per Spec A §9.

Bearer-secret auth (CRM_DEDUP_SECRET)."
```

---

## Phase 5 — Initial backfill trigger

### Task 8: Trigger immediate backfill after first successful connect

**Files:**
- Modify: `supabase/functions/crm-test-connection/index.ts` — this is where `finalize_crm_connection` RPC is called.

- [ ] **Step 1: Locate the success path in `crm-test-connection/index.ts`**

The connect-finalization happens immediately after the `finalize_crm_connection` RPC returns successfully. Add the backfill kick-off in that branch, before returning the success response.

- [ ] **Step 2: After the integration is created, fire-and-forget invoke `crm-sync-contacts`**

In `supabase/functions/crm-test-connection/index.ts`, immediately after `finalize_crm_connection` succeeds at `status='connected'`, add (paste before the success response):

```typescript
// Spec A: kick off initial contact backfill (fire-and-forget; do NOT await)
const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const dedupSecret = Deno.env.get('CRM_DEDUP_SECRET');
if (dedupSecret) {
  // Fire-and-forget: don't block the connect response on the sync.
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/crm-sync-contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dedupSecret}`,
      'Content-Type': 'application/json',
    },
  }).catch((e) => console.warn('initial backfill kick-off failed:', e));
}
```

(If the edge function already imports `createClient` and has a Supabase client, reuse it instead.)

- [ ] **Step 3: Redeploy the modified function**

```bash
/c/Users/prana/scoop/shims/supabase.exe functions deploy crm-test-connection --no-verify-jwt 2>&1 | tail -5
```

- [ ] **Step 4: Manual test — connect via UI, watch the mirror populate**

Open `http://localhost:8080`, sign in, Settings → Integrations → connect/reconnect Pipedrive. Within ~10 seconds, query:

```bash
/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT i.id, i.account_display_name, i.contacts_initial_synced, count(c.id) FROM public.integrations i LEFT JOIN public.crm_contacts c ON c.integration_id = i.id GROUP BY i.id;" 2>&1
```
Expected: a row with `contacts_initial_synced=true` and `count > 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/crm-test-connection/index.ts
git commit -m "feat(crm): kick off initial contact backfill on connect

After the integration is finalized at status='connected', the connect
function fires a fire-and-forget POST to crm-sync-contacts so the
contact mirror is populated within seconds instead of waiting up to
30 minutes for the next n8n cron tick."
```

---

## Phase 6 — n8n workflow assets

### Task 9: Commit the cron workflow JSON for n8n

**Files:**
- Create: `n8n/crm_contact_sync_30min.json`
- Create: `n8n/crm_dedup_check_node_snippet.json`
- Create: `n8n/README.md`

- [ ] **Step 1: Create `n8n/crm_contact_sync_30min.json`**

```json
{
  "name": "crm_contact_sync_30min",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            { "field": "minutes", "minutesInterval": 30 }
          ]
        }
      },
      "name": "Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer YOUR_CRM_DEDUP_SECRET" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{}",
        "options": {}
      },
      "name": "POST crm-sync-contacts",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [480, 300]
    }
  ],
  "connections": {
    "Schedule": {
      "main": [[{ "node": "POST crm-sync-contacts", "type": "main", "index": 0 }]]
    }
  }
}
```

- [ ] **Step 2: Create `n8n/crm_dedup_check_node_snippet.json`**

```json
{
  "node_to_paste_before_enrichment": {
    "parameters": {
      "method": "POST",
      "url": "https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check",
      "authentication": "none",
      "sendHeaders": true,
      "headerParameters": {
        "parameters": [
          { "name": "Authorization", "value": "Bearer YOUR_CRM_DEDUP_SECRET" },
          { "name": "Content-Type", "value": "application/json" }
        ]
      },
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ JSON.stringify({ workspace_id: $json.workspace_id, leads: $json.leads }) }}",
      "options": {}
    },
    "name": "Dedup check (Bravoro)",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2
  },
  "next_filter_node_javascript": "// In a Code node after the dedup-check call:\n// Pass through only leads where verdict === 'unique'.\nconst dedup = $input.first().json;\nconst leads = $('previous-node').first().json.leads;\nreturn dedup.results\n  .filter(r => r.verdict === 'unique')\n  .map(r => ({ json: leads[r.lead_index] }));"
}
```

- [ ] **Step 3: Create `n8n/README.md`**

```markdown
# n8n workflow assets for CRM dedup

These JSON exports are the n8n side of Spec A
(`docs/superpowers/specs/2026-05-06-crm-contact-mirror-and-dedup-api-design.md`).

## Setup once

1. Open `.dev-notes/crm-dedup-secret.local.txt` and copy the secret.
2. In each JSON file below, replace `YOUR_CRM_DEDUP_SECRET` with that value
   (or set it as an n8n credential and reference it).

## crm_contact_sync_30min.json

Standalone workflow. Imports a Schedule trigger every 30 min that POSTs
to `crm-sync-contacts`. Activate after import.

## crm_dedup_check_node_snippet.json

Two pieces:

- `node_to_paste_before_enrichment`: drop into your existing enrichment
  workflow *before* the enrichment step. Expects upstream JSON with
  `workspace_id` and `leads: [{email,first_name,last_name,domain}]`.
- `next_filter_node_javascript`: a Code-node JS that filters the upstream
  leads to only those with `verdict === 'unique'`. Forward those to
  enrichment.
```

- [ ] **Step 4: Commit**

```bash
git add n8n/
git commit -m "chore(n8n): cron + dedup-check workflow assets for Spec A

Two JSON files for the n8n side of the contact mirror + dedup flow:
- crm_contact_sync_30min: standalone every-30-min cron that POSTs to
  crm-sync-contacts
- crm_dedup_check_node_snippet: paste-before-enrichment HTTP node + a
  Code-node JS to filter on verdict='unique'

README walks through the one-time secret-pasting setup."
```

---

## Phase 7 — Final validation

### Task 10: Run the manual test matrix

Walk through Spec A §11 manually after the user connects Pipedrive in the UI. For each row, check off when verified and note any unexpected behavior in a follow-up commit message.

- [ ] **Scenario 1: No integration → all unique with skipped_reason='no_integration'**

```bash
SECRET=$(grep CRM_DEDUP_SECRET= .dev-notes/crm-dedup-secret.local.txt | cut -d= -f2)
WS=$(/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT w.id FROM public.workspaces w LEFT JOIN public.integrations i ON i.workspace_id = w.id WHERE i.id IS NULL LIMIT 1;" 2>&1 | tail -1 | tr -d ' ')
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  --data "{\"workspace_id\":\"$WS\",\"leads\":[{\"email\":\"a@b.com\"}]}" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```

- [ ] **Scenario 3: Backfill done + email matches existing Kontakt → duplicate via email_exact**

Pick an email known to exist in your Pipedrive (use any from the screenshots in the spec, e.g. `martin_schoch@yahoo.de`):

```bash
SECRET=$(grep CRM_DEDUP_SECRET= .dev-notes/crm-dedup-secret.local.txt | cut -d= -f2)
WS=$(/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT workspace_id FROM public.integrations WHERE status='connected' LIMIT 1;" 2>&1 | tail -1 | tr -d ' ')
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  --data "{\"workspace_id\":\"$WS\",\"leads\":[{\"email\":\"martin_schoch@yahoo.de\",\"first_name\":\"Dr. Martin\",\"last_name\":\"Schoch\"}]}" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: `verdict: 'duplicate', matched_via: 'email_exact'`.

- [ ] **Scenario 5: Backfill done + novel email/domain/name → unique**

```bash
curl -s -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  --data "{\"workspace_id\":\"$WS\",\"leads\":[{\"email\":\"definitely-not-a-real-lead@brand-new-domain.example\",\"first_name\":\"Foo\",\"last_name\":\"Bar\"}]}" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: `verdict: 'unique'`.

- [ ] **Scenario 9: Disconnect cascades the mirror**

In the UI, disconnect the Pipedrive integration. Then:

```bash
/c/Users/prana/scoop/shims/supabase.exe db query --linked "SELECT count(*) FROM public.crm_contacts;" 2>&1
```
Expected: `count = 0` (or only contacts from other still-connected workspaces). Reconnect and re-run the post-connect backfill to restore.

- [ ] **Scenarios 2/4/6/7/8/10/11/12 (light verification)**

Skim the responses; if any are non-trivially wrong, file follow-up commits. Most of these are exercised implicitly by Scenarios 1/3/5/9.

- [ ] **Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(crm): dedup-check matrix follow-ups

Notes from manual test matrix run on <date>:
- <observation 1>
- <observation 2>"
```

If no fixes needed: skip this step.

---

## Acceptance criteria — verify before merging to main

- [ ] All 7 normalize.test.ts unit tests pass
- [ ] `supabase db push --linked` is clean (no pending migrations)
- [ ] `npx tsc --noEmit` shows no NEW errors introduced by this plan
- [ ] `crm-sync-contacts` and `crm-dedup-check` both deployed and respond 401 without auth
- [ ] An integration that just finished connecting has `contacts_initial_synced=true` within 30 seconds
- [ ] Scenarios 1, 3, 5, 9 from the manual matrix all match expectations
- [ ] No Pipedrive token leaked into git log: `git log -p | grep -i 'api_token\|c[0-9a-f]\{30,\}' | head -5` returns empty
- [ ] `.dev-notes/crm-dedup-secret.local.txt` is gitignored (`git check-ignore` returns the path)

When all boxes ticked: this plan is shippable. Move on to Plan C.
