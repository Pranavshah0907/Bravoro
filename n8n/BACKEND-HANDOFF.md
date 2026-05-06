# Bravoro CRM Dedup — n8n Backend Handoff

**To:** Whoever owns n8n + the enrichment pipeline
**From:** Pranav
**Last updated:** 2026-05-07
**Branch:** `feat/crm-dedup-m1` (merging soon)

---

## TL;DR

We've built a two-endpoint API in Bravoro that lets n8n dedup raw leads against a client's CRM **before** running paid enrichment. You need to:

1. Import one new n8n cron workflow (every 30 min, single HTTP call)
2. Insert one HTTP node + one Code node into the existing enrichment workflow, before the enrichment provider node
3. Make sure n8n receives `workspace_id` in the enrichment workflow input

That's all. The system is multi-tenant out of the box: same workflow, different `workspace_id`, different client's CRM gets dedup'd. No per-client branching anywhere on the n8n side.

---

## Why this exists

Every paid enrichment (Apollo / Cognism / Lusha / etc.) costs credits. If a lead **already exists in the client's CRM**, we shouldn't re-enrich them — we should mark them as a duplicate and pass on the unique ones to the enrichment provider. Saving credits is the headline benefit; not corrupting the client's CRM with stale duplicates is the secondary one.

Doing the dedup check **before** enrichment is non-negotiable — checking after has already burnt the credits.

---

## Architecture in one diagram

```
                                 BRAVORO (Supabase)                     PIPEDRIVE
                            ┌──────────────────────────┐
                            │  crm_contacts mirror     │   sync every    Pipedrive
                            │  (per-workspace)         │ ◄────30 min──── /v1/recents
                            └──────────────────────────┘
                                       ▲
                                       │ queries
                                       │
n8n cron        ─►  POST /functions/v1/crm-sync-contacts   {}
(every 30 min)      Bearer <CRM_DEDUP_SECRET>
                    Returns: { syncedIntegrations: N, totals: {...} }

n8n enrichment  ─►  POST /functions/v1/crm-dedup-check
                    Bearer <CRM_DEDUP_SECRET>
                    Body: { workspace_id, leads: [{email, first_name, last_name, domain}] }
                    Returns: { results: [{lead_index, verdict, ...}], stats: {...} }

                    Filter to verdict='unique' → enrichment provider
```

**Push to CRM** (lead → Pipedrive Deal) is a separate flow that does **NOT** touch n8n. It's user-triggered in the Bravoro UI. n8n is only on the **pull / dedup** side.

---

## Authentication

One shared secret guards both endpoints: **`CRM_DEDUP_SECRET`**.

- It's already set as a Supabase secret on the linked project (`ggvhwxpaovfvoyvzixqw`).
- Pranav has a copy in `.dev-notes/crm-dedup-secret.local.txt` (gitignored on his machine). Ask him for it via a secure channel (1Password, signal-style — **not** chat in plaintext if avoidable).
- Store it in n8n as a **credential** (Settings → Credentials → New → Header Auth) named e.g. `bravoro-crm-dedup`. Reference it from the HTTP nodes via the credentials picker. Don't paste the secret literally into workflow JSON.

Header format used by both endpoints:
```
Authorization: Bearer <secret>
Content-Type: application/json
```

If a request omits the header or sends a wrong value: **401 unauthorized**. No body, no leak.

---

## Endpoint 1 — `crm-sync-contacts` (the cron)

```
POST https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
```

**Purpose**: refresh the contact mirror for every connected client. We hit it every 30 minutes; that's the freshness window of the dedup data.

**Body**: just `{}`. (Optional: `{ "integration_id": "uuid" }` to narrow to one client — used internally on connect, you don't need it.)

**Response** (success):
```json
{
  "ok": true,
  "syncedIntegrations": 2,
  "totals": { "synced": 2, "errored": 0, "contactsUpserted": 47 }
}
```

`contactsUpserted` is just the number of Person rows we wrote in this run (new + updated). For a healthy CRM with low daily churn, expect tens of upserts per cron tick.

**Behavior**:
- Iterates every workspace's connected integration
- For each: decrypts the client's Pipedrive token from Vault, fetches Persons updated since the last sync (5-min safety overlap to absorb clock skew), upserts into `crm_contacts`
- One client erroring doesn't break others — failures are captured per-row in `integrations.contacts_sync_error`
- Idempotent. Re-running the same window is a no-op (upserts).

**Cadence**: every 30 minutes is the sweet spot. Going lower wastes Pipedrive API quota; going higher means the dedup mirror lags more.

---

## Endpoint 2 — `crm-dedup-check` (the per-batch call)

```
POST https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```

**Purpose**: tell us which of these leads are already in the client's CRM. Called once per enrichment batch.

**Request body**:
```json
{
  "workspace_id": "AAA-aaa-uuid",
  "leads": [
    { "email": "max@example.de", "first_name": "Max", "last_name": "Mustermann", "domain": "example.de" },
    { "email": "anna@klinik.de", "first_name": "Anna", "last_name": "Schmidt" },
    { "first_name": "Hans", "last_name": "Müller", "domain": "praxis.de" }
  ]
}
```

- `workspace_id` is **required** — it's how we route to the right client's mirror.
- `leads[]` is an array. Each entry can have `email`, `first_name`, `last_name`, `domain`. All optional individually, but we need *some* signal to match on.
- No hard cap on batch size, but keep it under ~500 per call for predictable latency. Larger batches: chunk client-side.

**Response**:
```json
{
  "ok": true,
  "results": [
    { "lead_index": 0, "verdict": "duplicate", "matched_external_id": "1234", "matched_via": "email_exact" },
    { "lead_index": 1, "verdict": "unique" },
    { "lead_index": 2, "verdict": "duplicate", "matched_external_id": "5678", "matched_via": "name_domain_fuzzy" }
  ],
  "stats": { "checked": 3, "duplicates": 2, "unique": 1 }
}
```

`results[i].lead_index` matches `leads[i]` from the request. Always pair them by index.

**Match strategy** (first hit wins, evaluated in order):

| Layer | Predicate | When it fires |
|---|---|---|
| 1. Email exact | `email_normalized == lower(trim(input.email))` | Always preferred when input has email |
| 2. Email in array | `input.email ∈ contact.emails_all` | Pipedrive Persons can have multiple emails; covers when the primary is different from what we received |
| 3. Fuzzy name + domain | `domain == input.domain AND trigram_similarity(name, input.name) > 0.6` | Only when input lacks email but has both name + domain |

`matched_via` tells you which layer fired. If you want to log dedup analytics, this is the field to bucket on.

**Failure modes — all fail OPEN** (treat lead as `unique`, don't block enrichment):

| Condition | Response |
|---|---|
| Workspace has no connected integration | All `unique`, `stats.skipped_reason = "no_integration"` |
| Integration is in error state (token revoked, etc.) | All `unique`, `stats.skipped_reason = "integration_error"` |
| Initial backfill not yet finished | All `unique`, `stats.skipped_reason = "backfill_in_progress"` |
| Bearer secret missing/wrong | 401 unauthorized |
| Malformed JSON | 400 invalid_json |

**Why fail-open**: a missed dedup costs us one enrichment credit. A false-positive dedup (incorrectly marking a real lead as duplicate) loses the client a real opportunity. The economics favor erring toward enrich.

---

## n8n workflow files

The repo has a `n8n/` folder with paste-ready JSON:

### `crm_contact_sync_30min.json` — standalone cron workflow

**To install:**
1. n8n → workflows menu → **Import from file** → choose `crm_contact_sync_30min.json`
2. Open the **POST crm-sync-contacts** node → Headers → replace the literal `Bearer YOUR_CRM_DEDUP_SECRET` with a reference to the n8n credential you created
3. **Activate** the workflow

That's it. It runs every 30 min, hits the endpoint, no per-client wiring needed.

### `crm_dedup_check_node_snippet.json` — drop into existing enrichment workflow

This file has two pieces:

**Piece 1 — `node_to_paste_before_enrichment`**: an HTTP Request node config. Drop it into your enrichment workflow *between* "leads come in" and "enrichment provider call". It expects upstream JSON to have `workspace_id` and `leads`. Replace the secret reference with your n8n credential.

**Piece 2 — `next_filter_node_javascript`**: a JS snippet for a Code node placed *after* the HTTP node. It joins the dedup response back to the original leads array and emits only the `verdict === 'unique'` ones. Forward that output to your enrichment node. Duplicates are dropped silently — log them upstream if you want them for analytics.

**The Code node is fail-open**: if the dedup response is malformed, it passes everything through to enrichment rather than dropping leads on the floor. Same philosophy as the edge function.

---

## How multi-tenancy works

You'll probably want to verify this rather than take my word for it.

Bravoro has multiple `workspaces` rows. Each Bravoro user (`profiles.workspace_id`) belongs to exactly one. When a client connects their CRM, we create one row in `integrations` keyed by `workspace_id`. All downstream tables (`crm_contacts`, `crm_pushes`, field metadata) cascade-FK to that integration.

So:

```
Client A (workspace_id=AAA) connects Pipedrive → 1 row in `integrations` for AAA
Client B (workspace_id=BBB) connects Pipedrive → 1 row in `integrations` for BBB
```

When the cron fires:
- It iterates BOTH integrations
- For each, decrypts ITS token, fetches ITS Pipedrive Persons, upserts to ITS scoped `crm_contacts` rows

When n8n's enrichment workflow runs for Client A:
- Workflow gets `workspace_id=AAA` in its payload
- Calls `crm-dedup-check` with `workspace_id=AAA`
- Edge function does: `SELECT * FROM integrations WHERE workspace_id='AAA'` → resolves to A's integration → queries `crm_contacts WHERE integration_id=<A>`
- B's data is invisible. Same code path, same workflow, different SQL parameter.

Adding a new client:
1. Client signs into Bravoro
2. Settings → Integrations → connects their Pipedrive token
3. Done. n8n sees them automatically on the next cron tick. No workflow change.

---

## What you need to verify on your side

These are not bugs in our code — they're integration points to confirm:

### 1. Does n8n receive `workspace_id` already?

The dedup-check node needs `workspace_id` in its incoming JSON. Two paths:

- **Preferred**: Bravoro's existing `trigger-n8n-webhook` edge function should include `workspace_id` in the n8n webhook payload. **Pranav hasn't audited this — please check whether the existing payload already has it.** If not, it's a one-line addition to that edge function (resolving `workspace_id` from `auth.uid() → profiles.workspace_id`).
- **Fallback**: have n8n look it up via a Postgres node: `SELECT workspace_id FROM profiles WHERE id = $user_id`.

The first path is cleaner — every downstream node gets it for free.

### 2. n8n cron monitoring

If the 30-min cron stops firing for >24h, mirrors go stale and dedup quality degrades silently. Two ways to defend against this:

- Add an n8n failure alert (Slack, email, whatever you use)
- Query `integrations.contacts_last_synced_at` weekly — anything >2h old is a red flag

### 3. Pipedrive API quota awareness

Per-client per-cron run: 1 paginated `/v1/recents` call. Cheap. With ~10 connected clients, ~10 calls per 30 min, well under any plan limit.

The push flow (Bravoro UI → Pipedrive) is heavier — up to 4 calls per pushed lead. Soft-capped at 100 leads per push request. Doesn't affect you, but worth knowing if you ever see Pipedrive 429s in logs.

---

## Smoke tests you can run

Before activating the cron, sanity-check both endpoints from a terminal. Replace `<SECRET>` with the actual value.

**Test 1 — auth gate (should return 401)**:
```bash
curl -i https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
curl -i https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: HTTP 401 on both.

**Test 2 — sync-contacts happy path**:
```bash
curl -X POST \
  -H "Authorization: Bearer <SECRET>" \
  -H "Content-Type: application/json" \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-sync-contacts
```
Expected: `{"ok":true,"syncedIntegrations":<N>,"totals":{...}}`. If `<N>` is 0, no clients have connected Pipedrive yet. If `<N>` ≥ 1 and `errored=0`, all good.

**Test 3 — dedup-check with no body (validation)**:
```bash
curl -X POST \
  -H "Authorization: Bearer <SECRET>" \
  -H "Content-Type: application/json" \
  --data '{}' \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: `{"error":"missing_workspace_id"}`.

**Test 4 — dedup-check with a real workspace**:
Pranav can give you a valid `workspace_id` from the project (or just use the dev workspace).
```bash
curl -X POST \
  -H "Authorization: Bearer <SECRET>" \
  -H "Content-Type: application/json" \
  --data '{"workspace_id":"<WS>","leads":[{"email":"obviously-not-real@nonexistent.example"}]}' \
  https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check
```
Expected: `verdict: "unique"` for a novel email; `verdict: "duplicate"` if you happen to use one that exists in the workspace's CRM.

---

## What I need from you

When you're done, the deliverables are:

- [ ] `crm_contact_sync_30min` workflow imported, secret wired via credential, **activated**
- [ ] Existing enrichment workflow has the dedup HTTP node + filter Code node inserted before the enrichment provider call
- [ ] `workspace_id` confirmed flowing into n8n (either via `trigger-n8n-webhook` payload or a Postgres lookup node — doesn't matter which)
- [ ] Smoke tests passed
- [ ] Dedup analytics decided (where do we log "X leads dedup'd this week"? n8n execution logs are fine for now; we can add a proper dashboard later)

Ping Pranav if anything's unclear or if Bravoro returns an error you don't recognize.

---

## Open questions / future work

Not blockers, but worth knowing about:

1. **Reconciliation for Pipedrive deletes**: today, if a client deletes a Person in Pipedrive, our mirror still has the row. They'll register as duplicates until the next full re-sync. Low impact; we'll add a daily reconciliation cron when the first ghost-match complaint comes in.
2. **Phone-based dedup**: not enabled in v1. If a client keys their CRM on phone numbers instead of emails, layer 4 (E.164 match) is a small follow-up.
3. **Per-organization dedup**: today's match is Person-level only. If two leads at the same domain hit the same `Pipedrive Org`, we don't currently surface "this org already has 3 deals". v1.1.
4. **HubSpot, Salesforce, Zoho**: same architecture, different adapter. Each needs ~6 hours of work (one new file: `supabase/functions/_shared/adapters/<crm>.ts`). n8n side stays identical.
5. **Status-sync back from Pipedrive into Bravoro** ("this Deal moved to 'Termin gelegt'"): not built. v1.2.

---

## Reference: full file list

In the repo, the files relevant to this handoff:

- `n8n/crm_contact_sync_30min.json` — cron workflow
- `n8n/crm_dedup_check_node_snippet.json` — drop-in HTTP + filter
- `n8n/README.md` — short version of this doc
- `docs/superpowers/specs/2026-05-06-crm-contact-mirror-and-dedup-api-design.md` — full design spec (architecture, schema, decisions)
- `docs/superpowers/plans/2026-05-06-crm-contact-mirror-and-dedup-api.md` — implementation plan
- `supabase/functions/crm-sync-contacts/index.ts` — sync endpoint source
- `supabase/functions/crm-dedup-check/index.ts` — dedup endpoint source
- `supabase/migrations/20260506000000_add_crm_contacts_mirror.sql` — mirror table
- `supabase/migrations/20260506000001_add_crm_dedup_rpc.sql` — fuzzy-match RPC

If you'd rather read TypeScript than docs, the two `index.ts` files are short (~150 lines each) and tell the whole story.
