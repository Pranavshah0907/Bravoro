# CRM Pull-Side Sync — Contact Mirror + Dedup API — Design Spec

**Date:** 2026-05-06
**Status:** Approved 2026-05-06 (brainstorming session). Supersedes the mechanism (not the goal) of `2026-04-23-crm-dedup-m2-dedup-gate-design.md`.
**Branch:** `feat/crm-dedup-m1` (continues on same branch)
**Companion specs:**
- `2026-04-23-crm-dedup-roadmap.md` (shared context — still applies)
- `2026-04-23-crm-dedup-m1-connect-flow-design.md` (M1 — already shipped)
- `2026-05-06-crm-push-to-crm-design.md` (Spec C — pairs with this one; reuses the mirror)

---

## 0. What changed vs the original M2 draft (2026-04-23)

The original M2 spec assumed **live CRM API calls per dedup check** with a 3-layer matcher and a 4-state verdict (`skip_duplicate / enrich_link_to_org / enrich_new / review`).

This spec replaces that mechanism with a **synced contact mirror** in Supabase + a 2-layer matcher + a binary verdict (`unique / duplicate`). The goal — preventing wasted enrichment spend on contacts that already exist in the client's CRM — is unchanged.

**Why the change:**
- Per-lead CRM API calls don't scale: Pipedrive's ~10 req/s rate limit means batches of 200–500 leads take a minute or more on dedup alone, and that quota is shared with everything else the client does in Pipedrive.
- A mirror + Postgres index serves dedup-check in <100 ms regardless of batch size, with zero CRM-side rate-limit consumption.
- The mirror is also load-bearing for Spec C (push-to-CRM uses it to dedup the Person before creating a Deal). Building it once serves both flows.
- Generic across CRMs: any CRM adapter exposing `fetchContacts` produces the same normalized mirror shape; the dedup query is identical.

The richer 4-state verdict (`enrich_link_to_org`, `review`) is **deferred to v1.1**. Today's binary `unique / duplicate` matches the user's stated rule: "if duplicate, don't enrich; otherwise enrich." The response shape is forward-compatible so we can introduce richer verdicts without breaking n8n consumers.

---

## 1. Milestone scope

**What this milestone adds:**
- Postgres mirror table `public.crm_contacts` (workspace-scoped, indexed for dedup queries).
- Adapter interface extension: `fetchContacts(token, opts?: { sinceISO?: string })` returning a normalized async stream.
- Pipedrive adapter implementation of `fetchContacts` (paginated `/v1/persons` and incremental via `update_time` filter).
- Edge function `crm-sync-contacts`: invoked by n8n cron every 30 min; performs delta sync per workspace.
- Edge function `crm-dedup-check`: invoked by the n8n enrichment workflow; binary verdict per input lead.
- Initial backfill on connect: when an integration first reaches `status='connected'`, kick off a one-shot full sync.
- n8n cron workflow `crm_contact_sync_30min` (configured by user; spec provides paste-ready JSON).
- Test matrix with sample lead inputs.

**Inputs from M1 (already shipped):**
- `integrations` row with `status='connected'`, valid Vault token via `decrypt_integration_token` RPC.
- Adapter registry at `supabase/functions/_shared/adapters/registry.ts`.
- Health check pattern (cron-protected via `CRM_HEALTH_CHECK_SECRET`) — Spec A copies this pattern with its own secret `CRM_DEDUP_SECRET` (already provisioned).

**NOT in this milestone (deferred):**
- Organization (Org) mirror — Spec C looks up orgs live during push instead. Add to mirror in v1.1 if needed.
- 4-state verdict (link-to-org, review).
- HubSpot / Salesforce / Zoho adapters — interface stays generic so they slot in via v1.1.
- UI surfacing of dedup verdicts — n8n logs verdicts; no UI for this in v1.
- Bulk dedup analytics dashboard — v1.2.

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  n8n                                                              │
│                                                                   │
│  [Cron: every 30 min] ──► HTTP POST                              │
│                            │ Authorization: Bearer <secret>      │
│                            │ → /functions/v1/crm-sync-contacts  │
│                            ▼                                     │
│                                                                  │
│  [Enrichment workflow]                                           │
│   For each batch of raw leads:                                   │
│     HTTP POST                                                    │
│       Authorization: Bearer <secret>                             │
│       → /functions/v1/crm-dedup-check                           │
│       Body: { workspace_id, leads:[...] }                       │
│     Response: { results:[{lead_index, verdict, matched_id?}]}  │
│     Filter to verdict='unique', pass to enrichment              │
└───────────────────────────────────────────────────────────────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  Supabase                                                         │
│                                                                   │
│  crm-sync-contacts edge fn        crm-dedup-check edge fn        │
│   • verify Bearer == DEDUP_SECRET  • verify Bearer == DEDUP_SECRET│
│   • for each connected integration:• load integration by ws_id   │
│     - decrypt token                • for each lead:              │
│     - adapter.fetchContacts(since) │   - normalize email/domain  │
│     - upsert into crm_contacts     │   - SELECT match           │
│     - update last_synced_at        │ • return {results}         │
│         │                                  │                     │
│         ▼                                  ▼                     │
│   ┌──────────────────────────────────────────────┐              │
│   │  public.crm_contacts                         │              │
│   │  (integration_id, external_id) UNIQUE        │              │
│   │  index on (integration_id, email_normalized) │              │
│   │  index on (integration_id, domain)           │              │
│   └──────────────────────────────────────────────┘              │
└───────────────────────────────────────────────────────────────────┘
            │
            ▼ (via decrypted token)
┌───────────────────────────────────────────────────────────────────┐
│  Pipedrive API                                                    │
│   GET /v1/persons?start=X&limit=500&sort=update_time%20asc       │
│   GET /v1/persons?...&filter_id=<since-filter>  (delta path)     │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Data model

### 3.1 New table: `public.crm_contacts`

Workspace-scoped mirror keyed by `(integration_id, external_id)`. One row per Pipedrive Person; `raw` JSONB carries the full Pipedrive payload for forward-compatibility with future fields the adapter may expose.

```sql
CREATE TABLE public.crm_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id    uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  external_id       text NOT NULL,
  name              text,
  email_normalized  text,                  -- lowercased + trimmed; one row per Person, primary email only
  emails_all        text[] NOT NULL DEFAULT '{}',   -- all normalized emails (for multi-email lookups)
  domain            text,                  -- derived from primary email (after @, lowercased)
  phone_normalized  text,                  -- E.164 best-effort; may be NULL
  raw               jsonb NOT NULL,
  last_synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_id)
);

CREATE INDEX idx_crm_contacts_integration         ON public.crm_contacts(integration_id);
CREATE INDEX idx_crm_contacts_email               ON public.crm_contacts(integration_id, email_normalized);
CREATE INDEX idx_crm_contacts_domain              ON public.crm_contacts(integration_id, domain);
CREATE INDEX idx_crm_contacts_emails_all_gin      ON public.crm_contacts USING GIN (emails_all);
CREATE INDEX idx_crm_contacts_name_trgm           ON public.crm_contacts USING GIN (name gin_trgm_ops);

-- pg_trgm enables fuzzy name matching (Levenshtein-equivalent via similarity())
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3.2 RLS

Service-role only — n8n calls via Bearer (not JWT), and the Bravoro UI does not need to read this table directly. Future UI exposing dedup activity gets its own carefully-scoped policies.

```sql
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

-- No authenticated-role policies. Edge functions read/write as service role.
-- (Service role bypasses RLS by design.)
```

### 3.3 Sync state tracking

Add to existing `integrations` table:

```sql
ALTER TABLE public.integrations
  ADD COLUMN contacts_last_synced_at  timestamptz,
  ADD COLUMN contacts_initial_synced  boolean NOT NULL DEFAULT false,
  ADD COLUMN contacts_sync_error      text;
```

- `contacts_last_synced_at`: passed as `since` filter in next delta sync. NULL ⇒ run full sync.
- `contacts_initial_synced`: gates whether a connect-time backfill has completed; UI uses this to show "Building contact mirror…" state.
- `contacts_sync_error`: surfaced in IntegrationsPanel if the last sync errored; doesn't change the binary `status` (the integration is still 'connected' even if a sync failed).

---

## 4. Adapter interface additions

### 4.1 New methods in `supabase/functions/_shared/adapters/types.ts`

```typescript
export interface CrmAdapter {
  // ... existing M1 methods unchanged
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;

  // NEW in this spec:
  fetchContacts(token: string, opts?: FetchContactsOpts): AsyncGenerator<NormalizedContact, void, void>;
}

export interface FetchContactsOpts {
  sinceISO?: string;   // ISO-8601 timestamp; if provided, fetch only contacts updated >= this time
  pageSize?: number;   // default 500
}

export interface NormalizedContact {
  externalId: string;          // Pipedrive person.id (stringified)
  name: string | null;         // person.name
  emails: string[];            // all addresses, normalized (lowercased + trimmed); may be empty
  primaryEmail: string | null; // first label='work' or first labeled item, normalized
  phones: string[];            // E.164 best-effort; may be empty
  raw: unknown;                // raw Pipedrive payload, for downstream consumers
  updatedAtISO: string;        // person.update_time
}
```

`fetchContacts` is a `AsyncGenerator` so the caller can stream-upsert without holding 1903 contacts in memory at once. For Pipedrive, each yield corresponds to one page of normalized persons.

### 4.2 Pipedrive implementation outline (`supabase/functions/_shared/adapters/pipedrive.ts`)

```typescript
async *fetchContacts(token, opts = {}) {
  const pageSize = opts.pageSize ?? 500;
  let start = 0;
  while (true) {
    const url = new URL('https://api.pipedrive.com/v1/persons');
    url.searchParams.set('api_token', token);
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('sort', 'update_time ASC');
    // Pipedrive note: /v1/persons doesn't support a built-in `since` filter.
    // We sort by update_time and short-circuit when we pass `sinceISO`.
    const res = await fetchJson(url.toString());
    const items = res.data ?? [];
    if (items.length === 0) break;
    for (const p of items) {
      const updatedAtISO = p.update_time?.replace(' ', 'T') + 'Z';
      if (opts.sinceISO && updatedAtISO < opts.sinceISO) {
        return; // sorted ascending; everything past here is older
      }
      yield normalize(p);
    }
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start = res.additional_data.pagination.next_start;
  }
}

function normalize(p: any): NormalizedContact {
  const emails = (p.email ?? [])
    .map((e: any) => e.value?.trim().toLowerCase())
    .filter((s: string | undefined): s is string => Boolean(s));
  const phones = (p.phone ?? [])
    .map((t: any) => normalizePhone(t.value))
    .filter(Boolean);
  return {
    externalId: String(p.id),
    name: p.name ?? null,
    emails,
    primaryEmail: emails[0] ?? null,
    phones,
    raw: p,
    updatedAtISO: p.update_time?.replace(' ', 'T') + 'Z',
  };
}
```

`normalizePhone` lives in the new shared util `supabase/functions/_shared/normalize.ts` — best-effort E.164 (strip spaces/dashes/parens, keep leading `+`). Failures return null.

---

## 5. Edge functions

### 5.1 `crm-sync-contacts`

**Trigger:** n8n cron, POST every 30 minutes.
**Auth:** `Authorization: Bearer <CRM_DEDUP_SECRET>` (same secret as dedup-check; one shared secret per concern).
**Behavior:**
1. Verify the Bearer matches `Deno.env.get('CRM_DEDUP_SECRET')`. Mismatch → 401.
2. Iterate every `integrations` row with `status='connected'` (paginated; reuse the M1 health-check pagination pattern).
3. For each integration:
   - Decrypt token via `decrypt_integration_token` RPC.
   - Get adapter from registry; if no `fetchContacts`, skip.
   - Determine `sinceISO`: if `contacts_initial_synced=false`, leave undefined (full sync); else use `contacts_last_synced_at` minus a 5-minute safety overlap.
   - Stream contacts via `adapter.fetchContacts(token, { sinceISO })`.
   - Upsert each in batches of 200 via `INSERT ... ON CONFLICT (integration_id, external_id) DO UPDATE`.
   - On success: update `contacts_last_synced_at = now()`, set `contacts_initial_synced=true`, clear `contacts_sync_error`.
   - On error: set `contacts_sync_error = <truncated msg>`. Do NOT change `status` (sync failures are separate from connection health).
4. Return `{ ok: true, syncedIntegrations: N, totals: {...} }`.

**Why a 5-minute safety overlap on the `since` filter:** Pipedrive's `update_time` granularity is a second, and clock skew can drop edge cases. Re-fetching 5 minutes of overlap is cheap (deterministic upserts) and prevents missed updates.

**Why this isn't called by Supabase pg_cron:** Edge function pg_cron requires a self-hosted scheduler not present here. n8n's cron is what M1 uses for `crm-health-check` — same pattern.

**Concurrency:** Two concurrent runs are safe — upserts are idempotent. We do not add a workflow lock for v1; if syncs ever overlap (e.g., n8n delivery retry), the second run is a slightly more expensive no-op.

### 5.2 `crm-dedup-check`

**Trigger:** n8n enrichment workflow, POST per batch.
**Auth:** `Authorization: Bearer <CRM_DEDUP_SECRET>`.
**Request body:**
```json
{
  "workspace_id": "uuid",
  "leads": [
    { "email": "max@example.de", "first_name": "Max", "last_name": "Mustermann", "domain": "example.de" }
  ]
}
```
- `workspace_id` is required. The function looks up the workspace's connected integration; if no connected integration exists, every lead returns `verdict='unique'` (fail-open: never block enrichment because of dedup).
- `leads[].email` is the primary signal. If absent, dedup falls back to name+domain. If `domain` is absent, the function derives it from the email.
- Inputs are not stored — this function is read-only.

**Response body:**
```json
{
  "ok": true,
  "results": [
    {
      "lead_index": 0,
      "verdict": "duplicate",
      "matched_external_id": "1234",
      "matched_via": "email_exact"
    },
    {
      "lead_index": 1,
      "verdict": "unique"
    }
  ],
  "stats": { "checked": 2, "duplicates": 1, "unique": 1 }
}
```

`matched_via` ∈ `'email_exact' | 'email_in_emails_all' | 'name_domain_fuzzy'`. Forward-compatible: future verdicts (`enrich_link_to_org`, `review`) can be added without breaking consumers that only branch on `verdict !== 'unique'`.

**Behavior:**
1. Verify Bearer secret. Mismatch → 401.
2. Look up integration by `workspace_id` with `status='connected'` and `contacts_initial_synced=true`.
   - If no row: every lead → `unique`. Return.
   - If `status='error'`: every lead → `unique` with `stats.skipped_reason='integration_error'`.
   - If initial backfill not done yet: every lead → `unique` with `stats.skipped_reason='backfill_in_progress'`.
3. For each lead, perform the match (see §6). Return verdict.

**No write side effects.** The function does not log per-lead checks (high volume; not useful). Aggregate counts are returned to n8n for its run logs.

---

## 6. Match strategy

Three layers, evaluated in order. First match wins; later layers don't run.

| Layer | Predicate | SQL | Rationale |
|---|---|---|---|
| 1. Exact primary email | `email_normalized = lower(trim(input.email))` | indexed; ≤1 ms | Strongest signal. Email is the de facto unique key for B2B contacts. |
| 2. Email in any-email array | `lower(trim(input.email)) = ANY(emails_all)` | GIN index; ≤5 ms | Pipedrive Persons can have multiple emails; the primary may differ from what we received. |
| 3. Fuzzy name + domain match | `domain = input.domain AND similarity(name, input.name) > 0.6` | GIN trigram; ≤20 ms | Catches typos and missing-email cases. `0.6` chosen empirically; tunable. Combined with same-domain to prevent false positives. |

**Failure mode for layer 3:** if `input.domain` is empty (e.g., enrichment gave us a personal Gmail), layer 3 is skipped — not a duplicate by name alone. False negative is acceptable; false positive (skipping a real lead by name collision across companies) is not.

**Normalization rules** (`supabase/functions/_shared/normalize.ts`):
- Email: `.trim().toLowerCase()`. No punycode. Empty → null.
- Domain: derived from email (`split('@')[1]`); also normalized.
- Name: passed through `pg_trgm.similarity()` directly; no pre-processing. (Trigram handles diacritics, case, partial matches.)
- Phone: best-effort E.164. Stored but not used for v1 dedup; reserved for v1.1.

---

## 7. Sync strategy

### 7.1 Initial backfill

Triggered automatically when an integration transitions to `status='connected'`. Two implementations considered:

| Option | Trade-off | Choice |
|---|---|---|
| **Inline at connect** (block the connect flow until backfill done) | Simpler control flow; user sees the spinner for ~5–30s for typical accounts. | ❌ Blocks UI; bad UX for large accounts. |
| **Async after connect** (mark `contacts_initial_synced=false`; first cron run does the backfill) | Connect returns instantly; mirror is "warming up" for up to 30 min. | ✅ Chosen. UI shows "Building contact mirror…" pill on ConnectedCard. |

**To accelerate first-time UX:** when `crm-test-connection` succeeds and the integration row is created, queue an immediate `crm-sync-contacts` invocation for that integration alone. This shortens the warm-up from ~30 min to seconds.

### 7.2 Delta sync

Every 30 minutes via n8n cron. Reads `contacts_last_synced_at` and passes as `sinceISO` minus 5-minute overlap. If a sync errors mid-stream, `contacts_last_synced_at` is NOT advanced — the next run retries the same window. Idempotent due to upserts.

### 7.3 Deletes

Pipedrive deletes are not detected via `update_time` ASC streaming. **For v1 we accept this** — deleted persons remain in the mirror and may register as duplicates. Risk window: a contact was deleted in Pipedrive less than 24h ago. Mitigation: a daily full reconciliation run that diffs the mirror against a fresh full fetch and removes ghosts. Punted to v1.1; stub the cron entry as `crm_contact_reconcile_daily` for future build-out.

### 7.4 Volume sanity check

Per the brainstorming: medium batches, daily-ish (option B). For 1903 contacts:
- Initial backfill: ~5 pages × 500 contacts × 200ms request time ≈ 1 s of API calls + ~50 ms of upserts. <2 s total.
- Delta sync: typically <50 changed contacts/30min for a healthy CRM. ~200 ms total.
- Even 10× larger accounts (~20k) backfill in <20 s.

---

## 8. Security model

| Control | Mechanism |
|---|---|
| Edge function auth | `Authorization: Bearer ${CRM_DEDUP_SECRET}` header verified at the top of every handler. Mismatch → 401, no body. Reuses the M1 pattern (see `crm-health-check` with `CRM_HEALTH_CHECK_SECRET`). |
| Pipedrive token storage | Already encrypted in Vault per M1 (`encrypt_integration_token` / `decrypt_integration_token`). Decryption only happens inside the edge function; tokens never leave that boundary. |
| Mirror access | Service role only. RLS enabled with no authenticated policies. Future UI gets carefully-scoped read policies when needed. |
| n8n → Supabase transport | HTTPS, Bearer in header. No cookies, no JWT. |
| PII in mirror | Names + emails are PII. The mirror is workspace-scoped; cascade-deleted on disconnect (FK ON DELETE CASCADE). On disconnect we drop everything for that integration. |
| Audit logs | Sync function logs aggregate counts. Dedup-check logs aggregate counts. Per-row email content is never logged. |

---

## 9. Failure modes

| Failure | Behavior |
|---|---|
| `CRM_DEDUP_SECRET` not set | Both functions return 500 with `secret_not_configured`. |
| Bearer mismatch | 401, no body, log only `auth_fail`. |
| Workspace has no integration | dedup-check returns all `unique` (fail-open). |
| Integration in `status='error'` | dedup-check returns all `unique` with `stats.skipped_reason='integration_error'`. |
| Backfill not yet completed | dedup-check returns all `unique` with `stats.skipped_reason='backfill_in_progress'`. |
| Pipedrive API timeout during sync | Sync run fails for that integration only; `contacts_sync_error` set; next cron retries. |
| Pipedrive returns invalid data | Sync logs the error; does not abort the run for other integrations. |
| Mirror query timeout (Postgres) | dedup-check returns 503; n8n retries. (Should never happen at expected scale.) |

**Fail-open vs fail-closed:** all failure modes that affect dedup-check **fail open** (treat lead as unique → enrich it). Rationale: a missed dedup costs one enrichment credit; a false-positive dedup (incorrectly marking a real lead as duplicate) loses real revenue and trust. The economics favor fail-open.

---

## 10. n8n workflow changes

### 10.1 New cron workflow `crm_contact_sync_30min`

Single Schedule Trigger node → HTTP Request node:

```
Method: POST
URL:    https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
Headers:
  Authorization: Bearer <paste from .dev-notes/crm-dedup-secret.local.txt>
  Content-Type: application/json
Body: {}
```

Schedule: every 30 minutes. Activate after Spec A is deployed.

### 10.2 Modify enrichment workflow

Insert one HTTP Request node before the enrichment provider call:

```
Method: POST
URL:    https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
Headers:
  Authorization: Bearer <same secret>
  Content-Type: application/json
Body:
  {
    "workspace_id": "{{ $json.workspace_id }}",
    "leads": "{{ $json.leads }}"
  }
```

Then a Filter/Set node: pass through only items where the response's matching `results[i].verdict === 'unique'`. Forward to enrichment.

(Paste-ready JSON exports for both workflows are committed alongside this spec at `n8n/crm_contact_sync_30min.json` and `n8n/crm_dedup_check_node_snippet.json`.)

---

## 11. Test scenarios

Manual matrix the user runs after deployment. Each row should pass before merging to main.

| # | Setup | Action | Expected |
|---|---|---|---|
| 1 | No integration connected | Call dedup-check with 3 leads | All 3 `unique`; stats.skipped_reason='no_integration' |
| 2 | Integration connected; backfill running | Call dedup-check immediately | All `unique`; skipped_reason='backfill_in_progress' |
| 3 | Backfill done | Call dedup-check with email matching an existing Kontakt | `verdict='duplicate'`, `matched_via='email_exact'` |
| 4 | Backfill done | Call dedup-check with new email + same domain + similar name to an existing Kontakt | `verdict='duplicate'`, `matched_via='name_domain_fuzzy'` |
| 5 | Backfill done | Call dedup-check with totally novel email + domain + name | `verdict='unique'` |
| 6 | Backfill done | Run cron sync; modify a Kontakt in Pipedrive; run sync again; query dedup with new email | Match found |
| 7 | Bearer header missing | Call dedup-check | 401 |
| 8 | Bearer header wrong | Call dedup-check | 401 |
| 9 | Disconnect integration | Query crm_contacts | Rows for that integration cascade-deleted |
| 10 | Connect, then immediately disconnect, then reconnect | After reconnect | Backfill kicks off again; old mirror rows gone |
| 11 | Sync fails mid-run (kill Pipedrive temporarily) | After failure | `contacts_sync_error` set; `contacts_last_synced_at` not advanced; next run retries |
| 12 | Two simultaneous sync runs | Trigger both | Both succeed without duplicate keys (idempotent upserts) |

---

## 12. Migration / deprecation notes

- The original M2 spec (`2026-04-23-crm-dedup-m2-dedup-gate-design.md`) is **deprecated**. Add a banner at its top redirecting readers here. Do not delete (history value).
- The roadmap (`2026-04-23-crm-dedup-roadmap.md`) needs the M2 row updated: scope changes from "live dedup gate" to "mirror + dedup API"; verdict changes from 4-state to binary; references updated to point here.
- M3 (push-back enrichment writes) is unaffected by this spec change. M3 was always going to consume the M1.5 expanded mapping; that pairing still holds.

---

## 13. Open questions

None blocking. The following can be revisited after launch:

1. **Verdict richness** — when do we add `enrich_link_to_org`? Wait until a client asks. Adding is non-breaking (n8n only checks `verdict !== 'unique'`).
2. **Phone-based dedup** — when do we enable layer 4 (E.164 phone match)? When we have a client whose CRM keys on phone instead of email.
3. **Reconciliation cron for deletes** — schedule when the first ghost-match complaint arrives.
4. **Per-organization dedup** — Spec C handles org lookup live during push, so this isn't needed for v1. Add to mirror in v1.1 if push performance suffers.
