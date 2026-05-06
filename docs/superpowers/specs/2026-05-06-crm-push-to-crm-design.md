# CRM Push-Side Sync — Push Bravoro Results to a CRM Pipeline — Design Spec

**Date:** 2026-05-06
**Status:** Approved 2026-05-06 (brainstorming session)
**Branch:** `feat/crm-dedup-m1`
**Companion specs:**
- `2026-04-23-crm-dedup-roadmap.md` (shared context)
- `2026-04-23-crm-dedup-m1-connect-flow-design.md` (M1 — already shipped)
- `2026-05-06-crm-contact-mirror-and-dedup-api-design.md` (Spec A — pairs with this; mirror used for Person dedup on push)
- `2026-04-23-crm-field-mapping-ui-design.md` (M1.5 — provides per-field mapping consumed here)

---

## 1. Milestone scope

Bravoro users see enriched leads on the **Results** page. Today the only outbound action is "Export Excel". This spec adds a **"Push to CRM"** action that creates Pipedrive Deals (with linked Persons + Organizations) directly in a destination chosen by the user.

**What this spec adds:**
- Adapter interface extension: `listDestinations`, `findOrCreatePerson`, `findOrCreateOrganization`, `createDeal`.
- Pipedrive adapter implementations for the four new methods.
- Edge function `crm-list-destinations` — returns flat destination list for the UI dropdown.
- Edge function `crm-push` — orchestrates the per-lead push (org → person → deal) and returns per-lead results.
- UI on Results page: **"Push to CRM"** button next to **Export Excel**, opening a modal with destination picker + per-lead status table.
- Source attribution: every pushed Deal sets `Quellenherkunft='Bravoro'`, `ID der Ursprungsquelle=<bravoro_search_id>`, `Quellkanal=<search_name>`, and prefixes `Titel` with `[BRAVORO TEST]` while we are on `feat/crm-dedup-m1`.
- Owner assignment strategy with workspace-level default + override at push time.
- Idempotency: re-pushing a lead with the same `Record_ID` updates the existing Deal instead of creating a duplicate.
- A bookkeeping table `crm_pushes` so users can see "where did this lead end up?" without re-querying Pipedrive.

**Inputs from M1 (already shipped):**
- `integrations` row with `status='connected'`, valid Vault token via `decrypt_integration_token`.
- Adapter registry, Pipedrive adapter base.

**Inputs from Spec A (pairs with this milestone):**
- `crm_contacts` mirror — used by `findOrCreatePerson` to match by email **before** hitting the Pipedrive API. Cuts a round trip on the common case (re-pushing the same contact).

**Inputs from M1.5 (Spec B — pairs with this milestone):**
- `integrations.custom_field_mappings` JSONB in M1.5's expanded 13-slot shape. Push consults this to populate Person + Deal fields. If M1.5 is not yet shipped, push falls back to M1's narrow JSONB shape plus heuristic defaults (degrades gracefully; nothing crashes).

**NOT in this milestone:**
- Bulk select-all-from-Results push (v1.1 — needs UX work).
- Status sync back from Pipedrive ("this Deal moved to 'Termin gelegt'") — v1.2.
- Per-pipeline owner mapping table (default-owner-per-destination) — v1.1; v1 uses the current Bravoro user's matched Pipedrive user.
- Multi-CRM destination splitting (push half to Pipedrive, half to HubSpot) — speculative.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Results page                                                     │
│  ┌────────────────────────┐  ┌──────────────────────────┐       │
│  │ Export Excel  [Download]│  │ Push to CRM   [Upload]  │       │
│  └────────────────────────┘  └─────┬────────────────────┘       │
│                                    │ click                       │
│                                    ▼                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Push to CRM modal                                           ││
│  │  - Destination picker (dropdown, populated via              ││
│  │    crm-list-destinations on open)                           ││
│  │  - Lead preview list (read-only)                            ││
│  │  - "Owner: <current user matched in Pipedrive>" + override  ││
│  │  - [Push N leads] button                                    ││
│  │  - Per-lead status badges as the push runs                  ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬───────────────────────────────────┘
                               │ invokeEdgeFunction('crm-push', {...})
                               │ (JWT auth — workspace member)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Supabase                                                         │
│                                                                  │
│  crm-list-destinations                  crm-push                │
│   • verify JWT, resolve ws_id            • verify JWT, ws_id    │
│   • load integration                     • load integration     │
│   • adapter.listDestinations(token)      • for each lead:       │
│   • return flat list                     │   - findOrCreateOrg  │
│                                          │   - findOrCreatePerson│
│                                          │   - createDeal       │
│                                          │   - upsert crm_pushes│
│                                          │   - update mirror    │
│                                          • return per-lead results│
└────────────────────────────────────────────┬─────────────────────┘
                                             │
                                             ▼  Pipedrive API
┌──────────────────────────────────────────────────────────────────┐
│ Pipedrive                                                        │
│  POST /v1/organizations  (find by domain → POST if missing)     │
│  POST /v1/persons        (find by email in mirror → POST else)  │
│  POST /v1/deals          (always new; idempotent via Record_ID) │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Data model

### 3.1 New table: `public.crm_pushes`

```sql
CREATE TABLE public.crm_pushes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id    uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  search_id         uuid REFERENCES public.searches(id) ON DELETE SET NULL,
  bravoro_record_id text,                 -- Contact.Record_ID — the idempotency key
  bravoro_email     text,                 -- denormalized for human-readable lookups
  destination_id    text NOT NULL,        -- 'pipeline:1|stage:1' format
  destination_label text NOT NULL,        -- 'Bravoro Leads Elisa — Unbearbeitet' (snapshot)
  external_deal_id  text,                 -- Pipedrive deal.id (string)
  external_person_id text,                -- Pipedrive person.id (string)
  external_org_id   text,                 -- Pipedrive org.id (string), nullable
  status            text NOT NULL CHECK (status IN ('success', 'failed')),
  error_message     text,
  pushed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pushed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, bravoro_record_id, destination_id)
);

CREATE INDEX idx_crm_pushes_workspace ON public.crm_pushes(workspace_id);
CREATE INDEX idx_crm_pushes_search    ON public.crm_pushes(search_id);
CREATE INDEX idx_crm_pushes_status    ON public.crm_pushes(status) WHERE status = 'failed';
```

**Why this table:**
- Idempotency key: `(integration_id, bravoro_record_id, destination_id)` UNIQUE prevents pushing the same lead to the same destination twice. Re-clicking "Push" updates the existing row and the existing Deal.
- UI feedback: Results page can read `crm_pushes` to show "✓ Pushed to Bravoro Leads Elisa" badges next to leads the user already pushed.
- Auditability: who pushed what, when, where.

**RLS:**
```sql
ALTER TABLE public.crm_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read own pushes"
  ON public.crm_pushes FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "service role only writes"
  ON public.crm_pushes FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service role only updates"
  ON public.crm_pushes FOR UPDATE TO service_role USING (true) WITH CHECK (true);
```

(Updates happen only inside the `crm-push` edge function via service role.)

### 3.2 Add to `integrations`

```sql
ALTER TABLE public.integrations
  ADD COLUMN default_owner_external_id text;  -- Pipedrive user.id; NULL = use pushing user's match
```

v1: stays NULL. Hook for v1.1 when we add per-destination owner mapping UI.

---

## 4. Adapter interface additions

```typescript
export interface CrmAdapter {
  // ... existing
  listDestinations(token: string): Promise<Destination[]>;
  findOrCreateOrganization(token: string, input: OrgInput): Promise<{ externalId: string; created: boolean }>;
  findOrCreatePerson(token: string, integrationId: string, input: PersonInput): Promise<{ externalId: string; created: boolean }>;
  createDeal(token: string, input: DealInput): Promise<{ externalId: string }>;
}

export interface Destination {
  id: string;          // 'pipeline:1|stage:1' — opaque to UI
  label: string;       // 'Bravoro Leads Elisa — Unbearbeitet'
  group?: string;      // 'Bravoro Leads Elisa' — optional grouping for grouped dropdowns
  pipelineId?: string; // pipeline:1
  stageId?: string;    // stage:1
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
  organizationExternalId: string | null;
  customFields: Record<string, unknown>; // Pipedrive custom field keys → values
}

export interface DealInput {
  title: string;                // 'Max Mustermann — example.de' or '[BRAVORO TEST] ...'
  pipelineId: string;
  stageId: string;
  ownerExternalId: string | null;
  personExternalId: string;
  organizationExternalId: string | null;
  sourceLabel: string;          // 'Bravoro' for Quellenherkunft
  sourceId: string | null;      // Bravoro search_id or record_id
  channelLabel: string | null;  // search name for Quellkanal
  customFields: Record<string, unknown>;
}
```

### 4.1 Pipedrive implementation outlines

`listDestinations` — fetch pipelines + stages, return one destination per `(pipeline, first_stage)`:

```typescript
async listDestinations(token: string) {
  const [p, s] = await Promise.all([
    fetchJson(`https://api.pipedrive.com/v1/pipelines?api_token=${token}`),
    fetchJson(`https://api.pipedrive.com/v1/stages?api_token=${token}`),
  ]);
  const stagesByPipeline = new Map<number, any[]>();
  for (const st of s.data ?? []) {
    if (!stagesByPipeline.has(st.pipeline_id)) stagesByPipeline.set(st.pipeline_id, []);
    stagesByPipeline.get(st.pipeline_id)!.push(st);
  }
  return (p.data ?? []).map((pipeline: any) => {
    const stages = (stagesByPipeline.get(pipeline.id) ?? [])
      .sort((a, b) => a.order_nr - b.order_nr);
    const firstStage = stages[0];
    return {
      id: `pipeline:${pipeline.id}|stage:${firstStage.id}`,
      label: `${pipeline.name} — ${firstStage.name}`,
      group: pipeline.name,
      pipelineId: String(pipeline.id),
      stageId: String(firstStage.id),
    };
  });
}
```

(For v1 we present only first-stage destinations. If a workspace later wants to push to specific later stages, we expand the dropdown to flatten all stages — non-breaking change.)

`findOrCreateOrganization` — search by domain (Pipedrive's `/v1/organizations/search?term=<domain>&fields=address,name`); if no match, POST. Returns `created: true|false`.

`findOrCreatePerson` —
1. Check `crm_contacts` mirror by `(integration_id, email_normalized)`. If hit → return its `external_id`, `created: false`.
2. Else hit Pipedrive `/v1/persons/search?term=<email>&fields=email`. If hit → return; also write into mirror so the next call hits the cache.
3. Else POST `/v1/persons` with name, email, phone, org_id, custom fields. Return `created: true`.

`createDeal` — POST `/v1/deals` with all fields. Return `external_id`.

### 4.2 Idempotency on the Pipedrive side

We do **not** rely on Pipedrive idempotency (their POST endpoints don't support an idempotency key). Idempotency is enforced **in `crm-push` itself** via the `crm_pushes` UNIQUE constraint:

- On push, the function first SELECTs from `crm_pushes` for `(integration_id, bravoro_record_id, destination_id)`.
- If the row exists with `status='success'` and `external_deal_id`: short-circuit. Return "already pushed" with the existing IDs. No Pipedrive call.
- Else: do the push. UPSERT the row.

This means re-clicking "Push to CRM" for already-pushed leads is a no-op (no duplicate Deals in Pipedrive). Failed-push rows are retried on next attempt (we UPDATE the row instead of skipping).

---

## 5. Edge functions

### 5.1 `crm-list-destinations`

**Trigger:** Bravoro UI, on opening the Push modal.
**Auth:** JWT (workspace member). Unlike Spec A's functions, this is user-facing — it uses the standard Bravoro JWT pattern from M1.
**Behavior:**
1. Resolve user → workspace from JWT.
2. Load the workspace's integration. If none or `status='error'` → 404 `{ error: 'no_connected_integration' }`.
3. Decrypt token via RPC.
4. `adapter.listDestinations(token)`.
5. Return `{ destinations: [...] }`.
6. Cache headers: `Cache-Control: private, max-age=300` (5 min) — destinations rarely change.

### 5.2 `crm-push`

**Trigger:** Bravoro UI, "Push N leads" button.
**Auth:** JWT.
**Request body:**
```json
{
  "destination_id": "pipeline:1|stage:1",
  "owner_external_id": "12345",
  "search_id": "<uuid>",
  "search_name": "Q2 Dental Practices DE",
  "leads": [
    {
      "record_id": "<bravoro Record_ID>",
      "first_name": "Max",
      "last_name": "Mustermann",
      "email": "max@example.de",
      "domain": "example.de",
      "organization": "Example Praxis",
      "title": "Praxisinhaber",
      "phone_1": "+49 30 12345678",
      "phone_2": null,
      "linkedin": "https://linkedin.com/in/max"
    }
  ]
}
```

**Behavior per lead:**
1. Idempotency check on `crm_pushes` — short-circuit on prior success.
2. `findOrCreateOrganization(token, { name: organization, domain })`.
3. `findOrCreatePerson(token, integration_id, { name, email, phone, linkedIn, organizationExternalId, customFields })`.
4. `createDeal(token, { title, pipelineId, stageId, ownerExternalId, personExternalId, organizationExternalId, sourceLabel: 'Bravoro', sourceId: record_id, channelLabel: search_name, customFields })`.
5. UPSERT `crm_pushes` row with `status='success'`, all three external IDs, snapshot of destination_label.
6. Update mirror: insert/update `crm_contacts` row from the just-created/looked-up Person (so next Spec A dedup-check picks it up immediately, without waiting for the 30-min cron).
7. On any error: UPSERT `crm_pushes` with `status='failed'`, `error_message=<truncated>`. Do not abort the rest of the batch.

**Response body:**
```json
{
  "ok": true,
  "results": [
    {
      "lead_index": 0,
      "record_id": "abc123",
      "status": "success",
      "external_deal_id": "456",
      "destination_label": "Bravoro Leads Elisa — Unbearbeitet"
    },
    {
      "lead_index": 1,
      "record_id": "def456",
      "status": "failed",
      "error_message": "Pipedrive API rate limit exceeded; please retry in a moment"
    }
  ],
  "stats": { "succeeded": 1, "failed": 1, "skipped_idempotent": 0 }
}
```

**Concurrency / rate limits:**
- Process leads serially (not parallel) to stay under Pipedrive's ~10 req/s ceiling. Each lead is up to 4 API calls (org search, org create, person check, deal create) ≈ 400 ms. A batch of 50 leads ≈ 20 s.
- For batches >100 leads: chunk client-side and call `crm-push` multiple times. v1 caps the request at 100 leads with a 400 if exceeded; UI surfaces the cap.

**Title format:**
- Production: `"<First> <Last> — <Domain>"` (e.g., `"Max Mustermann — example.de"`).
- During development on this branch: prefix `"[BRAVORO TEST] "` so cleanup is trivial. The prefix toggle lives in a new env var `CRM_PUSH_TITLE_PREFIX` (defaults to empty in production).

**Source attribution defaults:**
- `Quellenherkunft` (single-option custom): `"Bravoro"` — created on first push if not present in the workspace's Pipedrive (one-time `POST /v1/dealFields/{id}/options` if needed).
- `ID der Ursprungsquelle` (text): the Bravoro `record_id`.
- `Quellkanal` (single-option custom): `<search_name>` — same on-first-use creation pattern.

If those source fields don't exist in the workspace's Pipedrive, push **does not crash** — it just skips them and logs a warning. Source attribution is best-effort.

---

## 6. UI design

### 6.1 Results page — new button

Right next to the Export Excel button in the enriched-contacts panel header (Results.tsx ~L924):

```tsx
<Button
  size="sm"
  variant="outline"
  onClick={() => setPushModalOpen(true)}
  disabled={!hasConnectedIntegration || allContacts.length === 0}
  className="hover-lift border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
>
  <Upload className="h-4 w-4 mr-2" />
  Push to CRM
</Button>
```

Disabled when:
- No connected integration in this workspace, OR
- The Results panel has zero contacts.

Tooltip on disabled state: "Connect a CRM in Settings → Integrations to enable push." (or "No contacts to push.")

### 6.2 Push modal

Dialog component (shadcn `Dialog`):

```
┌────────────────────────────────────────────────────────────────┐
│  Push 50 contacts to CRM                                       │
│  ────────────────────────────────────────────────────────────  │
│  Destination                                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Bravoro Leads Elisa — Unbearbeitet            ▼          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Owner: Pranav Shah (pranavshah0907@…)                  Edit  │
│                                                                │
│  Lead preview (50 contacts):                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Max Mustermann · max@example.de       Already pushed ✓   │ │
│  │ Anna Schmidt   · anna@klinik-de.de    Ready              │ │
│  │ ...                                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────┐  ┌──────────────────────────────────┐       │
│  │  Cancel     │  │ Push 49 new contacts             │       │
│  └─────────────┘  └──────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────┘
```

Behavior:
- On open: call `crm-list-destinations`. Show loading skeleton.
- On open: call `crm_pushes` SELECT for the visible `record_id`s to mark "Already pushed ✓".
- "Owner" defaults to the current user's matched Pipedrive user (look up by email match in `users` API response cached on the integration). If no match: show "Unassigned" with a hint to fix in Pipedrive.
- "Edit owner" opens an inline dropdown of all Pipedrive users (cached from `crm-refresh-metadata`).
- "Push N new contacts" excludes already-pushed leads (idempotent server-side, but UX clearer if we filter client-side).
- During push: per-row spinner → ✓ or ✗ as `crm-push` streams results back. (v1: single response with `results[]`; UI updates all rows on completion. Streaming via SSE is v1.1.)
- After: toast `"Pushed 49 contacts to Bravoro Leads Elisa"` or `"48 succeeded, 1 failed — see modal for details"`.

### 6.3 Per-lead push status indicator on the table

In the existing contacts table, add a small badge column (or stack inside an existing cell):

```
| Name           | Email             | … | Status                     |
|----------------|-------------------|---|----------------------------|
| Max Mustermann | max@example.de    |   | ✓ Pushed to Elisa (2d ago) |
| Anna Schmidt   | anna@klinik-de.de |   | —                          |
```

Tooltip on the badge shows full destination + push timestamp. Click → opens the Pipedrive Deal in a new tab (`https://<account_identifier>.pipedrive.com/deal/<external_deal_id>`).

### 6.4 Hook: `useCrmPushes(searchId)`

```typescript
export function useCrmPushes(searchId: string) {
  // SELECT * FROM crm_pushes WHERE search_id = $1
  // Realtime subscription so the badge updates immediately when push completes
  // Returns Map<record_id, CrmPush>
}
```

Realtime: subscribe via `supabase_realtime` publication (already set up for `integrations`; extend to `crm_pushes` in this milestone's migration).

---

## 7. Field mapping consumption

Push reads `integrations.custom_field_mappings` JSONB (M1.5's expanded 13-slot shape). For each mapped slot:
- Bravoro `email` → Pipedrive person field referenced by `mappings.person.email`
- Bravoro `first_name` → `mappings.person.firstName`
- Etc. (13 slots covered by the M1.5 spec.)

**Future per-destination overrides:** push *first* looks for a key under `mappings.destinationOverrides[<destination_id>].<slot>`, falling back to the global `mappings.<entity>.<slot>` if no override exists. The M1.5 spec does not yet write `destinationOverrides`, so for v1 this lookup is a no-op and push always uses globals — no behavior change. When a future milestone (M1.7) adds the per-destination override UI, push picks it up automatically without code changes.

If M1.5 is not yet shipped (or no mappings configured): fall back to M1's narrow `custom_field_mappings` JSONB shape, plus these defaults (matched by label heuristic on first push):

| Bravoro | Pipedrive Person | Pipedrive Deal |
|---|---|---|
| Email | `email` (standard) | "E-Mail Adresse" (custom) if present |
| First_Name + Last_Name | `name` (standard) | "Vor- und Nachname" (custom) if present |
| Phone_Number_1 | `phone` (standard, label='work') | "Telefonnummer" (custom) if present |
| Phone_Number_2 | `phone` (standard, label='other') | — |
| LinkedIn | (custom, websiteField if mapped) | — |
| Title | `job_title` (standard) | "Zu besetzende Stelle" (custom) if present |
| Domain | (org domain) | "Website" (custom) if present |

Standard fields are always populated. Custom fields only if a mapping exists or label heuristic finds a match.

---

## 8. Security

Same anchors as M1 + Spec A:
- JWT auth at the function boundary (workspace membership check).
- Token decryption only inside the edge function via service-role RPC.
- Pipedrive responses logged only at aggregate level — no email/name/phone in logs.
- `crm_pushes` workspace-scoped via RLS; service-role-only writes.
- Rate-limiting: lead processing is serial; soft cap at 100 leads per request.

---

## 9. Failure modes

| Failure | Behavior |
|---|---|
| No connected integration | UI button disabled; modal not openable. |
| Destination list call fails | Modal shows "Couldn't load destinations — retry"; no push possible. |
| Token revoked mid-push | First failure → mark integration `status='error'` (uses M1's existing flow); remaining leads short-circuit with `error_message='integration_disconnected'`. UI surfaces the daily error toast (from M1). |
| Pipedrive rate-limit (429) | Exponential backoff (3 attempts, 1s/2s/4s); on final fail → that lead's row marked failed; rest of batch continues. |
| Pipedrive 5xx | Same as 429. |
| Org/Person/Deal validation error | Lead-level failure, captured `error_message`; rest continues. |
| Already-pushed (idempotent) | Short-circuit; status='skipped_idempotent' in stats. |
| Mid-push crash (function timeout) | Up to 100-lead batches keep us under Supabase's 60s edge-function timeout for typical sizes. If timeout: leads already written to `crm_pushes` are durable; user can retry the rest. |

---

## 10. Test scenarios

| # | Setup | Action | Expected |
|---|---|---|---|
| 1 | No integration | Open Results | "Push to CRM" button disabled; tooltip explains why |
| 2 | Connected integration, 0 contacts | Open Results | Button disabled; tooltip "no contacts" |
| 3 | Connected; click Push | Modal opens | Destinations populate; current user matched as owner |
| 4 | Modal open; submit with 5 leads | Push | 5 rows in Pipedrive, 5 rows in `crm_pushes`, all `success` |
| 5 | Same 5 leads pushed twice | Re-submit | All 5 short-circuit `skipped_idempotent`; no duplicate Deals in Pipedrive |
| 6 | Lead with email matching existing Kontakt | Push | findOrCreatePerson hits mirror; `created: false`; new Deal links to existing Person |
| 7 | Lead with new domain | Push | New Org created; subsequent same-domain push reuses it |
| 8 | Pipedrive token revoked | Push | First lead fails with 401; integration → status='error'; remaining leads fail fast |
| 9 | Lead with no email but valid name+domain | Push | Person created with name+phone only; Deal links |
| 10 | 100-lead batch | Push | All 100 process serially in <60s; UI shows progress |
| 11 | Push lead, then check Results page | Reload | Status badge shows "✓ Pushed to Elisa" |
| 12 | Push, then click status badge | New tab | Opens correct Pipedrive deal URL |
| 13 | Two users in same workspace | Both push same lead | One succeeds, second short-circuits idempotent |
| 14 | Push during active dedup-sync | Concurrent | Both complete; mirror updates from push reflect in next dedup-check |

---

## 11. Open questions

None blocking. Park for v1.1+:

1. **Selecting a subset of leads to push** — v1 pushes everything visible; v1.1 adds checkboxes.
2. **Streaming progress** — v1 returns a single `results[]`; v1.1 adds SSE for big batches.
3. **Per-destination owner/field overrides** — v1 uses one default; v1.1 adds the override UI.
4. **Status sync back from Pipedrive** — when a Deal moves to "Termin gelegt", reflect it in Bravoro. v1.2.
5. **Post-push n8n hook** — should pushed leads trigger any n8n side effect? For this client, no. Speculative.
