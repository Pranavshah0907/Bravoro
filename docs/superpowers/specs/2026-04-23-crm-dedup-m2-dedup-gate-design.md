# CRM Dedup — Milestone 2: Dedup Gate — Design Spec

> **⚠️ DEPRECATED 2026-05-06.** The mechanism described here (live CRM API calls per dedup, 4-state verdict) is superseded by **`2026-05-06-crm-contact-mirror-and-dedup-api-design.md`** (Supabase mirror, binary verdict). The product goal is unchanged. This file is kept for history and rationale of the change. New work follows the 2026-05-06 spec.

**Date:** 2026-04-23 (draft from PRD; needs brainstorming session before M2 implementation plan)
**Status:** Deprecated 2026-05-06. See banner above.
**Source PRD:** `InputFiles/PRD_bravoro_crm_dedup.md`
**Depends on:** `2026-04-23-crm-dedup-m1-connect-flow-design.md` (M1 must ship first)
**Companion:** `2026-04-23-crm-dedup-roadmap.md`

---

## 1. Milestone scope

**What M2 adds on top of M1:** the actual dedup verdict. Before Bravoro enriches a lead, the system asks the connected CRM whether that person already exists. Based on the answer, the lead is either skipped (duplicate), enriched and tagged to an existing org, enriched normally, or routed to human review.

**Inputs to M2 from M1:**
- `integrations` row with `status='connected'`, valid Vault token, populated `custom_field_mappings`.
- `integration_field_metadata` rows for person + org, kept fresh by the daily health check.
- `PipedriveAdapter` class with `testConnection` / `fetchFieldMetadata` / `autoMapCustomFields` already implemented.

**New in M2:**
- `PipedriveAdapter.dedupCheck(token, integration, input)` — implements the 3-layer matching algorithm.
- Normalization utility module (`supabase/functions/_shared/normalize.ts`).
- `crm-dedup-check` edge function.
- New n8n dedup workflow that calls `crm-dedup-check`.
- Wiring in `trigger-n8n-webhook`: pass `integration_id` when the workspace has a connected integration.
- UI surfacing of verdicts (open question — see §10).
- External npm deps: `fastest-levenshtein` or `fuzzball` for name similarity (via Deno `npm:` import).

**NOT in M2:**
- HubSpot / Salesforce / Zoho adapters (v1.1+).
- Custom field mapping override UI (v1.1).
- Post-enrichment email-exact dedup (v1.1).
- Bulk dedup API (v1.2).
- Dedup analytics dashboard (v1.2).

---

## 2. Architecture — how M2 plugs into M1 and existing systems

### Waterfall order (end-to-end)

```
User triggers a search in Bravoro
  └─> trigger-n8n-webhook (existing edge function)
        ├─> Credit gate check (existing)
        ├─> Load workspace integration (NEW in M2)
        │     └─> if status='connected' → payload includes integration_id
        │         else                  → payload omits integration_id
        └─> POST to n8n webhook (existing)

n8n workflow (enrichment_bulk_manual / bulk_search / bulk_enrich)
  └─> For each lead:
        ├─> [existing] Internal cache lookup (get_user_enriched_contact RPC)
        │     ├─> cached / found → return existing data, no enrichment
        │     └─> not_found → proceed
        ├─> [NEW M2] if payload.integration_id present:
        │     └─> POST to crm-dedup-check edge function
        │           ├─> skip_duplicate       → mark, don't enrich
        │           ├─> enrich_link_to_org   → enrich, attach matched_org_id
        │           ├─> enrich_new           → enrich normally
        │           └─> review               → mark for review, don't enrich
        └─> [existing] Enrichment providers (Apollo / Cognism / etc.)
```

### Why the internal cache runs before the CRM check

- Internal cache is cheaper (single DB RPC vs. 3–5 CRM API calls).
- Internal cache covers a superset of cases: if Bravoro enriched someone before, they're covered regardless of whether the client's CRM has them.
- Running CRM check first would cost API quota on leads the internal cache would have handled for free.

### Why CRM check is server-side, not n8n-side

- All CRM-specific logic lives in the adapter (TypeScript, tested). n8n stays thin.
- Adding HubSpot later = zero n8n changes. New adapter file + registry line.
- Rate limit / retry logic is easier to own in a single edge function.

### Why `trigger-n8n-webhook` decides whether dedup runs

- Single source of truth: Supabase already owns integration state.
- n8n has no logic about integration health — it just reads the payload.
- Workspace with broken integration? Backend omits `integration_id` → dedup skipped seamlessly.

---

## 3. Adapter interface extension

### 3.1 Additions to `supabase/functions/_shared/adapters/types.ts`

```typescript
export interface DedupInput {
  firstName: string;
  lastName: string;        // may be obfuscated: "M***ig"
  domain: string;
  companyName?: string;    // optional context
}

export interface DedupVerdict {
  verdict: 'skip_duplicate' | 'enrich_link_to_org' | 'enrich_new' | 'review';
  matchedPersonId?: string | number;
  matchedOrgId?: string | number;
  matchReason: string;
  confidence: number;      // 0.0 – 1.0
  metadata?: Record<string, unknown>;
}

export interface Integration {
  id: string;
  crmType: string;
  accountIdentifier: string;
  customFieldMappings: CustomFieldMappings;
}

// Extend the existing CrmAdapter interface:
export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
  dedupCheck(token: string, integration: Integration, input: DedupInput): Promise<DedupVerdict>;  // NEW
}
```

No existing methods change. No refactor. Pure extension.

### 3.2 `PipedriveAdapter.dedupCheck` — 3-layer matching algorithm

Verbatim from PRD §6.4 with project-specific wrapping:

**Preflight normalization** (uses `normalize.ts` utility):
- `normalizedDomain = normalizeDomain(input.domain)`
- `punycodeDomain = toPunycode(normalizedDomain)` (if contains non-ASCII)
- `normalizedFirstName = stripTitlesAndLowercase(input.firstName)`
- `lastNameInfo = parseLastName(input.lastName)` → `{isObfuscated, visibleStart, visibleEnd, normalized}`

#### Layer 1 — Person search by email domain

```
GET https://{accountIdentifier}.pipedrive.com/v1/persons/search
  ?term={domain}
  &fields=email
  &exact_match=false
  &limit=50
  &api_token={token}
```

Run also for `punycodeDomain` if domain contains non-ASCII.

For each returned person, compute `combinedSimilarity` via `nameSimilarity(inputFirst, inputLast, person.first_name, person.last_name)`.

- **≥ 0.90** → `skip_duplicate`, confidence = similarity, reason = `person_email_domain_strong_name`.
- **0.75–0.90** → `review`, reason = `person_email_domain_weak_name`.
- **All < 0.75** → capture candidate `org_id.value` as hint for Layer 2 (if ≥2 persons share the same org, use that org); proceed to Layer 2.
- **No results** → proceed to Layer 2.

**Obfuscated last name rule:** if `lastNameInfo.isObfuscated`, cap combined confidence at 0.85 regardless of match. Never auto-skip on obfuscated input — always `review` or lower.

#### Layer 2 — Organization search by domain

Parallel calls:
```
GET /v1/organizations/search?term={domain}&fields=website&exact_match=false&limit=20
GET /v1/organizations/search?term={domain}&fields={customWebsiteFieldKeys.join(',')}&exact_match=false&limit=20
```

Where `customWebsiteFieldKeys` comes from `integration.customFieldMappings.org.websiteField`.

Also run both with `punycodeDomain` if applicable.

Union results, dedupe by org `id`. For each candidate org:

```
GET /v1/organizations/{id}/persons?limit=500
```

For each person at that org, compute `combinedSimilarity`.

- **≥ 0.90** → `skip_duplicate`, reason = `org_domain_person_strong_name`.
- **0.75–0.90** → `review`, reason = `org_domain_person_weak_name`.
- **All < 0.75** → `enrich_link_to_org`, `matchedOrgId = candidate.id`, reason = `org_domain_match_no_person`.

If Layer 2 returns zero org candidates → proceed to Layer 3.

#### Layer 3 — Organization name fuzzy (safety net)

Derive `derivedOrgName`:
- If `companyName` provided: use it.
- Else: extract core tokens from domain (`bleibtreu-zahnaerzte.de` → `bleibtreu zahnaerzte`).

```
GET /v1/organizations/search?term={derivedOrgName}&fields=name&exact_match=false&limit=10
```

For each candidate, compute `orgNameSimilarity` using token set ratio after `normalizeOrgName`.

- **≥ 0.85** → `review`, reason = `org_name_fuzzy_match`. **Never auto-skip on Layer 3 alone.**
- **< 0.85** → proceed.

If nothing matches → `enrich_new`.

### 3.3 Pipedrive API specifics (carried from M1 helpers + PRD §6.5)

- **Base URL for M2 calls:** `https://{accountIdentifier}.pipedrive.com/v1` (M1 used global `api.pipedrive.com` only for `testConnection`; M2 uses the account-specific domain).
- **Auth:** `?api_token={token}` query param.
- **Rate limits:** 100 req/2s burst most endpoints; search endpoints ~10 req/2s. Respect `Retry-After`, exponential backoff starting 250ms. (M1 `fetchJson` helper already implements this.)
- **Parallelization:** all Layer 2 calls (two orgs/search endpoints + punycode variants) via `Promise.all`. Per-layer calls are sequential. Budget: ≤ 5 API calls per dedup check in the common case.
- **Circuit breaker:** if cumulative API errors exceed N in a rolling window, fail-closed to `verdict='review'` with `match_reason='api_rate_limited'` or `api_error`.

---

## 4. Normalization module — `supabase/functions/_shared/normalize.ts`

All functions per PRD §8.

```typescript
// 8.1
export function normalizeDomain(input: string): string {
  // lowercase, trim
  // strip https?:// prefix
  // strip leading www.
  // strip path, query, fragment
  // strip port
}

// 8.2
export function toPunycode(domain: string): string | null {
  // use Deno's built-in URL parser or the `punycode` npm package via npm: import
  // returns ASCII form if input contains non-ASCII, else unchanged
}

// 8.3
export function stripTitlesAndLowercase(firstName: string): string {
  // regex: /^(prof\.?\s+)?((dr\.?\s+)+)(med\.\s+)?(dent\.\s+)?/i → ''
  // then lowercase + umlaut-normalize
}

// 8.4
export function normalizeUmlauts(s: string): string {
  // ä→ae, ö→oe, ü→ue, ß→ss (uppercase equivalents too)
}

// 8.5
export function normalizeOrgName(s: string): string {
  // lowercase, umlaut-normalize
  // strip German practice prefixes/suffixes:
  //   zahnarztpraxis|praxis|kieferorthop[aä]dische praxis|mkg praxis|
  //   zentrum f[uü]r zahnheilkunde|zahn[aä]rzte|
  //   dr\.?( dr\.?)?( med\.?)?( dent\.?)?
  // strip legal forms: gmbh|mvz|mbh|kg|partg|co\.?
  // strip punctuation, collapse whitespace
}

// 8.6
export interface LastNameInfo {
  isObfuscated: boolean;
  visibleStart?: string;
  visibleEnd?: string;
  normalized?: string;
  raw: string;
}
export function parseLastName(s: string): LastNameInfo {
  // detect /\*{2,}/
  // if obfuscated: extract visible prefix + suffix
  // else: normalize fully
}

// 8.7
export function nameSimilarity(
  inputFirst: string, inputLast: string,
  crmFirst: string, crmLast: string
): number {
  // normalize both sides (strip titles on first, umlauts on both)
  // firstScore = levenshteinRatio(normalizedInputFirst, normalizedCrmFirst)
  // if obfuscated:
  //   lastScore = 1.0 if startsWith(visibleStart) AND endsWith(visibleEnd) AND length diff ≤ 1; else 0.0
  //   cap combined at 0.85
  // else:
  //   lastScore = levenshteinRatio(normalizedInputLast, normalizedCrmLast)
  // return 0.4 * firstScore + 0.6 * lastScore
}
```

### External dependency

- `fastest-levenshtein` or `fuzzball` via Deno `npm:` import. Pick one after spiking both on PRD §13 test scenarios.

---

## 5. `crm-dedup-check` edge function

**Called by:** n8n (via service role key).

**Auth:** Supabase service role JWT via `Authorization: Bearer <service_role_key>`. Header shared secret also accepted for defense-in-depth (same env var pattern as M1 `CRM_HEALTH_CHECK_SECRET`).

**Request:**
```json
POST /functions/v1/crm-dedup-check
Authorization: Bearer <service_key>
{
  "integration_id": "uuid-abc",
  "first_name": "Maria",
  "last_name": "Schm***dt",
  "domain": "example-praxis.de",
  "company_name": "Zahnarztpraxis Example"
}
```

**Logic:**
1. Verify auth.
2. Validate body. If invalid → 400 `{error: "invalid_input"}`.
3. Load `integration` by id. If missing → 404 `{error: "integration_not_found"}`.
4. If `integration.status !== 'connected'` → return `{verdict: "enrich_new", match_reason: "integration_not_connected", confidence: 0}`. (Fail-open; we don't block enrichment on our own health issues.)
5. `token = await decrypt_integration_token(integration_id)`.
6. `adapter = getAdapter(integration.crm_type)`.
7. `verdict = await adapter.dedupCheck(token, integration, input)`.
8. Fire-and-forget log to `dedup_logs` table (open question #4 — decide if we add this in M2 or defer).
9. Return verdict JSON.

**Response:**
```json
{
  "verdict": "enrich_link_to_org",
  "matched_person_id": null,
  "matched_org_id": 16,
  "match_reason": "org_domain_match_no_person",
  "confidence": 1.0,
  "metadata": {
    "normalized_domain": "example-praxis.de",
    "layers_tried": ["person_email_domain", "org_domain"]
  }
}
```

**Error handling (per PRD §7.3):**
- Token invalid (401 from CRM) → update `integrations.status='error'`, return `{verdict: "review", match_reason: "integration_token_invalid"}` HTTP 200 (n8n shouldn't fail the whole search because of this).
- CRM rate-limited after retries → return `{verdict: "review", match_reason: "api_rate_limited"}`.
- Unexpected error → return `{verdict: "review", match_reason: "api_error", error: <msg>}` HTTP 200.
- **Never silently succeed or silently fail.** Ambiguous outcomes route to review.

---

## 6. n8n workflow — dedup sub-workflow

### 6.1 Structure (per PRD §10.1)

```
[Webhook Trigger]
     ↓
[Set: extract lead data]
     ↓
[HTTP Request: POST to crm-dedup-check]
     ↓
[Code: shape response for caller]
     ↓
[Respond to Webhook]
```

Five nodes. Same workflow serves every CRM — all CRM-specific logic lives in the Supabase adapter.

### 6.2 Webhook input schema

```json
{
  "integration_id": "uuid-abc-123",
  "first_name": "Maria",
  "last_name": "Schm***dt",
  "domain": "example-praxis.de",
  "company_name": "Zahnarztpraxis Example",
  "lead_id": "lead-xyz-456",
  "source": "apollo"
}
```

Required: `integration_id`, `first_name`, `last_name`, `domain`.
Optional: `company_name`, `lead_id`, `source` (pass-through for caller tracking).

### 6.3 Webhook response schema

```json
{
  "lead_id": "lead-xyz-456",
  "source": "apollo",
  "verdict": "enrich_link_to_org",
  "should_enrich": true,
  "matched_person_id": null,
  "matched_org_id": 16,
  "match_reason": "org_domain_match_no_person",
  "confidence": 1.0,
  "checked_at": "2026-04-23T10:30:00Z"
}
```

`should_enrich` derived map:
- `skip_duplicate` → `false`
- `enrich_link_to_org` → `true`
- `enrich_new` → `true`
- `review` → `false`

### 6.4 Node-by-node spec

Per PRD §10.4. Key points:
- **Node 1 (Webhook):** POST, path `/crm-dedup-check`, header-auth with shared secret credential, Response mode "Using 'Respond to Webhook' node".
- **Node 2 (Set):** pull fields from `$json.body`; validate required fields; short-circuit to Respond with 400 if invalid.
- **Node 3 (HTTP Request):** POST to `https://ggvhwxpaovfvoyvzixqw.supabase.co/functions/v1/crm-dedup-check`, Header Auth credential with `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`, JSON body, retry on fail (3 attempts, exponential backoff), 30s timeout, "continue on error" enabled.
- **Node 4 (Code):** shape response; if Node 3 failed entirely, return `{verdict: "review", should_enrich: false, match_reason: "dedup_service_unavailable", confidence: 0}` so the caller always gets a structured response.
- **Node 5 (Respond to Webhook):** 200 + `{{$json}}`.

### 6.5 Why this workflow is thin

All matching logic lives server-side in the Supabase adapter. n8n is pure orchestration. Adding HubSpot support requires zero changes to this workflow — only a new adapter file in Supabase.

---

## 7. Wiring dedup into existing Bravoro flows

### 7.1 Change to `trigger-n8n-webhook` edge function

Before POSTing to the destination n8n webhook, add:

```typescript
// Look up the workspace's integration
const { data: integration } = await supabase
  .from('integrations')
  .select('id, status')
  .eq('workspace_id', workspaceId)
  .maybeSingle();

if (integration?.status === 'connected') {
  payload.integration_id = integration.id;
}
```

**Net effect:** payload includes `integration_id` for workspaces with a healthy connection, omits it otherwise. n8n workflows read the field — if present, insert a dedup step; if absent, proceed to enrichment directly.

### 7.2 Changes to existing n8n workflows

Each of the three enrichment workflows (`enrichment_bulk_manual`, `bulk_search`, `bulk_enrich`) needs a branch that checks for `integration_id` and, if present, invokes the dedup sub-workflow (§6) per-lead before calling enrichment.

**Concretely (per workflow):**
- Add an IF node: `{{$json.integration_id}} is not empty`.
- True branch: call dedup sub-workflow; based on `should_enrich`, either skip to the next lead or proceed to enrichment.
- False branch: existing enrichment path, no change.

### 7.3 Surfacing verdicts in Bravoro UI

**Open question #1** — see §10. Possible answers:
- Per-contact badge in Results page ("Skipped: already in Pipedrive as org X").
- Summary card on search completion ("12 of 50 skipped due to Pipedrive dedup, saving 42 credits").
- Dedicated review queue UI for `verdict='review'` cases.
- All of the above.

---

## 8. Normalization test scenarios (PRD §13)

These MUST pass before M2 ships:

| # | Input | Expected verdict | Expected match_reason |
|---|---|---|---|
| 1 | `Lennard, Krüger, bleibtreu-zahnaerzte.de` | `skip_duplicate` | `person_email_domain_strong_name` |
| 2 | `Julia, Neumann, bleibtreu-zahnaerzte.de` | `enrich_link_to_org` | `org_domain_match_no_person` |
| 3 | `Hans, Mustermann, unknown-praxis-xyz.de` | `enrich_new` | (no match) |
| 4 | `Thomas, Schuster, dr-dr-schuster.de` | `skip_duplicate` | `person_email_domain_strong_name` (tests title stripping) |
| 5 | `Maria, Schm***dt, unknown-praxis-xyz.de` | `enrich_new` or `review` | (no CRM match; obfuscation irrelevant) |
| 6 | `Uwe, Sch***ann, kfo-schumann-mohr.de` | `review` | `person_email_domain_weak_name` (obfuscated caps at 0.85) |
| 7 | Umlaut domain `kieferorthopäde-essen.de` | correct match to Punycode-stored CRM record | — |

Reference CRM: the Dental Initiative Deutschland GmbH 2 Pipedrive account (test data). For M2 dev, development will use `pranavshah0907@gmail.com`'s Pipedrive account — we'll seed equivalent test data there.

---

## 9. Security additions in M2

All M1 security anchors carry forward. M2 adds:

1. **n8n → Supabase authentication** — n8n credential storing `SUPABASE_SERVICE_ROLE_KEY`, referenced via credential (never inlined in workflow JSON).
2. **Caller → n8n webhook authentication** — shared secret header, stored as n8n credential.
3. **Dedup log privacy** — if we add `dedup_logs`, log only `integration_id`, `verdict`, `match_reason`, `confidence`, `duration_ms`. NEVER field values (names, emails, domains).
4. **Circuit-breaker on CRM API** — protect Bravoro from being throttled by a single misbehaving CRM.

---

## 10. Open questions — resolve in M2 brainstorming session

These must be answered before writing the M2 implementation plan. The session will follow the same pattern as the M1 brainstorming.

### 10.1 UI surfacing of verdicts
Options:
- **(a)** Per-contact badge in Results page. "Skipped — already in Pipedrive" / "Linked to existing org" / "For review".
- **(b)** Search-level summary card. "N of M skipped due to CRM dedup, X credits saved."
- **(c)** Dedicated review queue page for `verdict='review'` leads.
- **(d)** All three.

Trade-offs: (d) is most informative but largest scope. (a+b) minimum viable. (c) might be v1.2.

### 10.2 Handling `verdict='review'` — do we actually build a review queue in M2?
Options:
- **(a)** Build a review queue UI. Users triage review-flagged leads manually.
- **(b)** Just skip enrichment and tag the lead in Results. No dedicated queue. User filters Results page by "For review" status.
- **(c)** Defer to v1.2. M2 simply skips these leads silently (like skip_duplicate) and logs internally.

### 10.3 Replace vs extend existing n8n enrichment workflows
Options:
- **(a)** Modify each of the three workflows in place to add an `integration_id` check + dedup branch.
- **(b)** Fork new v2 workflows (`bulk_search_v2`, etc.) that include dedup; keep v1 around for rollback; `trigger-n8n-webhook` routes to v2 when `integration_id` is present.
- **(c)** Wrap dedup in a pre-processor step: `trigger-n8n-webhook` calls dedup directly for each lead before routing to existing n8n webhooks, attaches verdict to payload, n8n reads verdict.

Trade-offs: (a) is simplest but risky if something breaks; (b) is safest but duplicates code; (c) keeps n8n workflows simple but adds latency to every search.

### 10.4 Add `dedup_logs` audit table in M2?
Options:
- **(a)** Yes. Append every dedup call: `integration_id`, `verdict`, `match_reason`, `confidence`, `duration_ms`, `created_at`. Powers future analytics + debugging.
- **(b)** No. Logs go to `console.log` only. Add a table in v1.2 when analytics dashboard ships.
- **(c)** Yes but minimal: only log `verdict='review'` cases so we can debug false positives.

### 10.5 Does dedup consume credits?
Existing credit model: only enrichment deducts credits. Dedup itself would logically be free (preventing waste is the whole point). BUT we might want to show "credits saved by dedup" somewhere — does that mean tracking hypothetical-credits-saved per verdict?

### 10.6 Health check cron — extend or separate in M2?
M1's `crm-health-check` runs daily. In M2, does it also run after every dedup call (opportunistic health check), or stay daily-only?

### 10.7 Backfill vs on-demand for existing workspaces
When M2 ships, existing workspaces with no integration get default behavior (no dedup). Workspaces that connected during M1 will have integrations that suddenly start doing real work. Should we notify existing M1-connected users ("CRM dedup is now live") or let them discover passively?

---

## 11. Acceptance criteria (draft — refine during M2 brainstorming)

**Backend**
- [ ] All 7 PRD §13 test scenarios return the expected verdict + reason.
- [ ] `crm-dedup-check` handles token-invalid, rate-limit, and unreachable-CRM cases per §5 spec.
- [ ] Response time < 5s for typical lead (budget of ≤5 Pipedrive API calls).
- [ ] Umlaut-domain scenario (#7) matches correctly via Punycode.
- [ ] Obfuscated last name NEVER produces `skip_duplicate` verdict.

**Frontend**
- [ ] Verdict surfaced per chosen option from §10.1.
- [ ] Review queue (if chosen per §10.2) allows triage actions.

**n8n**
- [ ] Dedup sub-workflow handles all four verdicts correctly.
- [ ] Graceful fallback when Supabase is unreachable (returns `verdict: review`).
- [ ] Existing workflows updated per chosen option from §10.3 without regression in non-dedup searches.

**Security**
- [ ] No field values (names, emails) logged anywhere.
- [ ] Service-role key used only in n8n credential, never inlined.

**Business**
- [ ] Test run on your Pipedrive account with 50 known-duplicate leads: at least 80% correctly skipped.

---

## 12. Implementation order (draft — for M2 plan)

1. Resolve §10 open questions in brainstorming session.
2. Write `normalize.ts` with unit-test-level confidence via a small Deno test file (this is the one part of M2 where automated tests are cheap and worthwhile).
3. Extend `CrmAdapter` interface; implement `PipedriveAdapter.dedupCheck` against §2.2 spec.
4. Run §8 test scenarios directly against the adapter (unit-level, calling the real CRM API with a test token).
5. Write `crm-dedup-check` edge function; re-run scenarios end-to-end.
6. Build n8n dedup sub-workflow; test via direct webhook calls.
7. Modify `trigger-n8n-webhook` to pass `integration_id`.
8. Modify existing n8n enrichment workflows per §10.3 chosen option.
9. Build UI per §10.1 chosen option.
10. End-to-end test on a real enrichment run with the CRM-connected workspace.

---

## 13. References

- Source PRD: `InputFiles/PRD_bravoro_crm_dedup.md`
- M1 design spec: `2026-04-23-crm-dedup-m1-connect-flow-design.md`
- Roadmap: `2026-04-23-crm-dedup-roadmap.md`
- PRD appendix A: sample `crm-dedup-check/index.ts` skeleton — useful starting point for §5.
- PRD §14: Pipedrive field reference (person + org standard fields, example custom field keys).

---

## 14. Explicitly deferred from M2

- HubSpot / Salesforce / Zoho adapters — v1.1+.
- Custom field mapping review UI — v1.1.
- Post-enrichment email-exact dedup — v1.1.
- OAuth flows — v1.1 (needed for HubSpot/Salesforce).
- Bulk dedup API — v1.2.
- AI-powered field classification — speculative.
- Merge.dev fallback — speculative.

---

**This document is a draft.** Before writing an M2 implementation plan, a brainstorming session must resolve the open questions in §10. Everything else is derived from the PRD and validated against M1's architecture.
