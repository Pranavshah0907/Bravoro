# CRM Field Mapping UI — M1.5 Design

**Date:** 2026-04-23
**Status:** Design drafted, plan pending
**Companion specs:**
- `2026-04-23-crm-dedup-roadmap.md` — overall CRM integration roadmap
- `2026-04-23-crm-dedup-m1-connect-flow-design.md` — M1 baseline this builds on
- `2026-04-23-crm-dedup-m2-dedup-gate-design.md` — M2 consumer of the expanded schema
- `2026-04-23-crm-dedup-m1-connect-flow.md` (plans/) — M1 implementation plan

---

## 1. Milestone scope

M1 (in-flight) ships a Pipedrive connect flow with **invisible, keyword-based auto-mapping** of four custom-field slots:
- `person.websiteField[]`, `person.linkedinField[]`, `org.websiteField[]`, `org.practiceType[]`

That coverage is enough for M2 dedup's narrow search paths (Pipedrive's native email / native website / native org name + auto-detected custom website fields), **but two gaps matter once M3 push-back lands:**

1. **CRMs are used messily.** Real customers repurpose columns — a "Telephone" custom field might hold emails; a "Personal Notes" field might hold LinkedIn URLs. Label-keyword auto-detection silently misses these, and the user never sees what was mapped.
2. **Push-back writes need every data type mapped.** When Bravoro writes enriched `email`, `mobile_phone`, `direct_phone`, `linkedin_url`, `first_name`, `last_name`, `job_title`, org `domain`, org `industry` back to the user's CRM (M3), we need to know *which column* each of those goes into — per-workspace, user-owned. Auto-guessing here is dangerous: we can write authoritative data to the wrong column and create a split-brain CRM that's hard to undo.

**M1.5 adds three things:**

1. **Expanded mapping schema** — covers every field type Bravoro reads (M2) or writes (M3+). JSONB-additive, no breaking DB migration.
2. **User-facing mapping UI** — "Field mapping" panel on the `ConnectedCard` with an "Edit" button. Auto-detected values pre-fill; user reviews and overrides. One-shot setup per workspace, editable anytime.
3. **Backend plumbing** — new `crm-update-mapping` edge function + new `update_crm_field_mappings` RPC to persist user-driven changes atomically.

**Explicitly out of scope for M1.5:**
- Write-back behavior semantics (which field wins on conflict, append vs overwrite, label subtypes on Pipedrive's native multi-value email/phone arrays) — **deferred to M3**.
- Adapters beyond Pipedrive — same as M1, keep it one-CRM.
- Admin-panel cross-workspace mapping management — deferred to M1.6 (see roadmap).
- Fuzzy / AI-assisted field classification for labels that don't keyword-match — deferred to v1.1 speculative list.
- History of mapping changes — out of scope; `integrations.updated_at` is enough.

**Shape of delivery:** one new edge function, one new RPC, one data migration, one new adapter helper, one frontend modal + one expanded `ConnectedCard` panel. Back-compat with existing M1 rows.

---

## 2. Architecture overview

```
user connects CRM (M1 flow unchanged)
  └─> trigger-n8n-webhook etc: `autoMapCustomFields` runs → narrow-shape mapping saved
  └─> ConnectedCard shown
       └─> NEW (M1.5): "Field mapping" accordion section
            ├─> collapsed: shows current mapping at a glance (e.g., "Email → native email; LinkedIn → custom 'LI URL'")
            ├─> "Edit" button → opens modal
            │    ├─> Modal fetches fresh field metadata (uses cached data; optional "Refresh from CRM" that calls crm-refresh-metadata)
            │    ├─> Renders editable rows per Bravoro field slot
            │    ├─> User adjusts dropdowns / chip-selects
            │    ├─> "Reset to auto-detect" button: re-runs the adapter's auto-map client-side against cached metadata, replaces current values
            │    ├─> "Save" button: POST to crm-update-mapping
            │    │    └─> edge function: validate each key exists in cached metadata, call update_crm_field_mappings RPC
            │    │          └─> RPC: UPDATE integrations SET custom_field_mappings = $new, updated_at = now() WHERE id = $integration_id
            │    └─> On success: close modal, refresh ConnectedCard
            └─> No changes to M1 connect / disconnect / refresh / health check paths.
```

**What M1.5 does NOT touch:**
- Migration `20260423000000_add_crm_integrations.sql` or `20260423000002_fix_crm_vault_reconnect.sql` — unchanged.
- `finalize_crm_connection` RPC signature — unchanged.
- Existing edge functions (`crm-test-connection`, `crm-refresh-metadata`, `crm-disconnect`, `crm-health-check`) — unchanged.
- The adapter's `testConnection` and `fetchFieldMetadata` methods — unchanged.
- `ConnectForm` UI — unchanged.

**What M1.5 changes:**
- The **shape** of `integrations.custom_field_mappings` JSONB — expanded and renamed keys (data migration included).
- The adapter's `autoMapCustomFields` method — returns the expanded shape.
- `ConnectedCard` — gains a "Field mapping" accordion.

---

## 3. Database schema changes

### 3.1 New migration: `20260423000003_expand_field_mappings.sql`

Two jobs:

**A. Reshape existing `custom_field_mappings` rows from M1-shape to M1.5-shape.** Deterministic, no user input required. Any row written under M1 gets rewritten in-place.

```sql
UPDATE public.integrations
SET custom_field_mappings = jsonb_build_object(
  'person', jsonb_build_object(
    'firstName',    '["first_name"]'::jsonb,
    'lastName',     '["last_name"]'::jsonb,
    'email',        '["email"]'::jsonb,
    'mobilePhone',  '[]'::jsonb,
    'directPhone',  '[]'::jsonb,
    'jobTitle',     '["job_title"]'::jsonb,
    'linkedin',     COALESCE(custom_field_mappings->'person'->'linkedinField', '[]'::jsonb),
    'website',      COALESCE(custom_field_mappings->'person'->'websiteField', '[]'::jsonb)
  ),
  'org', jsonb_build_object(
    'name',         '["name"]'::jsonb,
    'domain',       '[]'::jsonb,
    'website',      (COALESCE('["website"]'::jsonb, '[]'::jsonb) ||
                     COALESCE(custom_field_mappings->'org'->'websiteField', '[]'::jsonb)),
    'linkedin',     '[]'::jsonb,
    'industry',     COALESCE(custom_field_mappings->'org'->'practiceType', '[]'::jsonb)
  )
)
WHERE crm_type = 'pipedrive';
```

**B. Add a new RPC `update_crm_field_mappings`** for user-driven updates (separate from `refresh_crm_metadata`, which handles the whole refresh path).

```sql
CREATE OR REPLACE FUNCTION public.update_crm_field_mappings(
  p_integration_id uuid,
  p_mappings jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.integrations
  SET custom_field_mappings = p_mappings,
      updated_at = now()
  WHERE id = p_integration_id
    AND status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration % not found or not connected', p_integration_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_crm_field_mappings(uuid, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_crm_field_mappings(uuid, jsonb) FROM anon, authenticated;
```

**No index changes, no RLS changes, no new columns.** JSONB gets a new shape; everything else in the schema is identical.

### 3.2 New JSONB shape (canonical)

```json
{
  "person": {
    "firstName":   ["first_name"],
    "lastName":    ["last_name"],
    "email":       ["email"],
    "mobilePhone": [],
    "directPhone": [],
    "jobTitle":    ["job_title"],
    "linkedin":    ["<custom-field-hash>"],
    "website":     ["<custom-field-hash>"]
  },
  "org": {
    "name":     ["name"],
    "domain":   [],
    "website":  ["website", "<custom-field-hash>"],
    "linkedin": [],
    "industry": []
  }
}
```

Every slot is an **array of CRM field keys** — even single-value-by-convention slots like `firstName`. Rationale: uniform shape simplifies the UI (always render as chip-input), uniform shape simplifies M2/M3 read logic (always iterate the array), and multi-mapping was already needed for `org.website` (native + custom union).

Native Pipedrive keys: unprefixed strings (`"first_name"`, `"email"`, `"name"`, `"website"`, etc.).
Custom Pipedrive keys: 40-char lowercase hex hashes (`"1a19f770dec08e0419c57ef005ea13fe97d6f636"`).

### 3.3 M2 spec amendment

M2 spec (`2026-04-23-crm-dedup-m2-dedup-gate-design.md`) currently references `integration.customFieldMappings.org.websiteField[]` on line 164. M2 implementation (not yet started) must read from `integration.customFieldMappings.org.website[]` in the expanded shape. **Action item for the M2 brainstorming session:** update the spec's field-key references when M1.5 ships.

---

## 4. Adapter interface changes

### 4.1 `CustomFieldMappings` type (in `supabase/functions/_shared/adapters/types.ts`)

Current M1 shape (to be replaced):

```typescript
export interface CustomFieldMappings {
  person: { websiteField: string[]; linkedinField: string[] };
  org: { websiteField: string[]; practiceType: string[] };
}
```

New M1.5 shape:

```typescript
export interface CustomFieldMappings {
  person: {
    firstName:   string[];
    lastName:    string[];
    email:       string[];
    mobilePhone: string[];
    directPhone: string[];
    jobTitle:    string[];
    linkedin:    string[];
    website:     string[];
  };
  org: {
    name:     string[];
    domain:   string[];
    website:  string[];
    linkedin: string[];
    industry: string[];
  };
}
```

All 13 slots are `string[]`. No optional fields — they can be empty arrays, never missing keys.

### 4.2 `PipedriveAdapter.autoMapCustomFields` — rewrite

Current M1 implementation (4 slots, keyword-match on custom fields only) becomes:

```typescript
autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings {
  // Seed with Pipedrive native field keys for slots that have native equivalents.
  const mapping: CustomFieldMappings = {
    person: {
      firstName:   ['first_name'],
      lastName:    ['last_name'],
      email:       ['email'],
      mobilePhone: [],
      directPhone: [],
      jobTitle:    ['job_title'],
      linkedin:    [],
      website:     [],
    },
    org: {
      name:     ['name'],
      domain:   [],
      website:  ['website'],
      linkedin: [],
      industry: [],
    },
  };

  // Layer custom-field auto-detection on top of the seeds.
  for (const f of metadata.person) {
    if (!f.isCustom) continue;
    if (labelMatches(f.label, WEBSITE_KEYWORDS))  mapping.person.website.push(f.key);
    if (labelMatches(f.label, LINKEDIN_KEYWORDS)) mapping.person.linkedin.push(f.key);
    if (labelMatches(f.label, MOBILE_KEYWORDS))   mapping.person.mobilePhone.push(f.key);
    if (labelMatches(f.label, DIRECT_PHONE_KEYWORDS)) mapping.person.directPhone.push(f.key);
  }
  for (const f of metadata.org) {
    if (!f.isCustom) continue;
    if (labelMatches(f.label, WEBSITE_KEYWORDS))  mapping.org.website.push(f.key);
    if (labelMatches(f.label, DOMAIN_KEYWORDS))   mapping.org.domain.push(f.key);
    if (labelMatches(f.label, LINKEDIN_KEYWORDS)) mapping.org.linkedin.push(f.key);
    if (labelMatches(f.label, INDUSTRY_KEYWORDS)) mapping.org.industry.push(f.key);
  }

  return mapping;
}
```

### 4.3 New keyword constants

```typescript
// Existing (M1):
const WEBSITE_KEYWORDS  = ['website', 'webseite', 'homepage', 'url', 'web', 'domain'];
const LINKEDIN_KEYWORDS = ['linkedin'];

// New in M1.5:
const MOBILE_KEYWORDS       = ['mobile', 'cell', 'handy']; // 'handy' = German for mobile
const DIRECT_PHONE_KEYWORDS = ['direct', 'dial', 'office', 'work phone'];
const DOMAIN_KEYWORDS       = ['domain']; // Split from WEBSITE; some customers have both.
const INDUSTRY_KEYWORDS     = ['industry', 'branche', 'sector', 'category', 'practice', 'specialization'];
```

Note: `WEBSITE_KEYWORDS` no longer includes `'domain'` — moved to `DOMAIN_KEYWORDS`. If a field matches both (e.g., label "Website / Domain"), it gets mapped to both buckets — acceptable multi-slot union.

### 4.4 New adapter tests (`pipedrive.test.ts`)

Extend existing test file with:
- Auto-map seeds native keys even when metadata is empty (no custom fields).
- Auto-map preserves native seed when a custom field also matches the keyword (both in the array).
- Mobile / direct-phone / industry keyword detection works per language variants.
- Migration test: apply the migration SQL to a row with M1-shape JSON, assert resulting shape matches M1.5 canonical.

---

## 5. New edge function: `crm-update-mapping`

### 5.1 Purpose

Persist user-driven changes to `integrations.custom_field_mappings`. Validates structure (every key in the arrays must exist in the integration's cached `integration_field_metadata`), scopes by workspace membership (JWT), writes via `update_crm_field_mappings` RPC.

### 5.2 File: `supabase/functions/crm-update-mapping/index.ts`

**Auth pattern:** identical to M1's `crm-test-connection` — jose JWKS JWT verification, workspace membership check, 401/403 on failure. Deploy with `--no-verify-jwt`.

### 5.3 Request shape

```typescript
interface UpdateMappingRequest {
  integrationId: string;     // uuid
  mappings: CustomFieldMappings;  // full expanded shape, no partial updates
}
```

### 5.4 Response shape

```typescript
type UpdateMappingResponse =
  | { ok: true }
  | { ok: false; error: 'INVALID_STRUCTURE'; detail: string }
  | { ok: false; error: 'UNKNOWN_FIELD_KEY'; keys: string[] }
  | { ok: false; error: 'FORBIDDEN' }
  | { ok: false; error: 'NOT_CONNECTED' };
```

### 5.5 Validation steps (in order)

1. **JWT auth** — extract user_id.
2. **Load integration** — `SELECT id, workspace_id, status FROM integrations WHERE id = $integrationId`. 404 if missing.
3. **Workspace membership** — verify user_id belongs to integration.workspace_id. 403 otherwise.
4. **Status check** — must be `'connected'`. Otherwise `NOT_CONNECTED`.
5. **Shape validation** — assert `mappings.person` and `mappings.org` have exactly the expected 13 keys total, all arrays of strings. Otherwise `INVALID_STRUCTURE`.
6. **Key existence validation** — load `integration_field_metadata` for this integration, build a `Set` of known `person.*` and `org.*` field keys. For each value in every array, assert it's a known key. Any unknowns → `UNKNOWN_FIELD_KEY` with the offending keys listed.
7. **Write** — call `update_crm_field_mappings(integrationId, mappings)` RPC via service role.
8. **Return** `{ ok: true }`.

### 5.6 Why validation matters

Without it, a malicious or buggy client could write garbage keys into the mapping; M2 dedup or M3 push-back would then fail at runtime with confusing errors. Validating at save-time turns runtime surprises into immediate rejections.

---

## 6. Frontend UI

### 6.1 `ConnectedCard` — new "Field mapping" accordion

Added to the existing `ConnectedCard` component (built in M1 Task 14). New section below the status line, above the "Disconnect" button:

```
┌── Pipedrive ───────────────────────────── Connected ──┐
│ acme.pipedrive.com · Connected 2 days ago             │
│ Last checked: 5 minutes ago                           │
│                                                        │
│ ▼ Field mapping                                [Edit] │
│   Email      → email (native)                         │
│   Phone      → phone (native) · +1 more               │
│   LinkedIn   → "LI Profile URL" (custom)              │
│   Org domain → "Website" (native) · +1 more           │
│   · 9 more mapped                                     │
│                                                        │
│                                        [Disconnect]   │
└────────────────────────────────────────────────────────┘
```

**Rendering rules:**
- Always expanded by default (accordion open). Collapsible with chevron for users who don't need to see it.
- Show up to 4 "headline" rows (email, phone, linkedin, org domain/website). Remaining 9 rendered as "· N more mapped" link that expands the full list inline (no modal for just viewing).
- Multi-value slots show the first label + "+N more" count.
- Field labels come from the cached `integration_field_metadata.fields_json` — look up by key.
- If a key in the mapping doesn't resolve to a label (e.g., the custom field was deleted in the CRM since last refresh), render the key itself with a `⚠ unknown field` badge.

### 6.2 "Edit field mapping" modal

Opens when the user clicks "Edit". Built as a shadcn `Dialog` for consistency.

**Structure:**

```
┌── Edit field mapping — Pipedrive ─────────────────────┐
│                                                        │
│  Tell us where each data type lives in your CRM.       │
│  Bravoro uses this to find existing contacts and       │
│  write enriched data back to the right columns.        │
│                                                        │
│  [Refresh fields from Pipedrive]                       │
│                                                        │
│  ━━━ Person ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                        │
│  First name    [ first_name (native) × ]    [+ Add]   │
│  Last name     [ last_name (native) × ]     [+ Add]   │
│  Email         [ email (native) × ] [+ Add]           │
│  Mobile phone  [ (none) ]                    [+ Add]  │
│  Direct phone  [ (none) ]                    [+ Add]  │
│  Job title     [ job_title (native) × ]     [+ Add]   │
│  LinkedIn      [ "LI URL" (custom) × ]      [+ Add]   │
│  Website       [ (none) ]                    [+ Add]  │
│                                                        │
│  ━━━ Organization ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                        │
│  Name        [ name (native) × ]            [+ Add]   │
│  Domain      [ (none) ]                      [+ Add]  │
│  Website     [ website (native) × ]          [+ Add]  │
│              [ "Web URL" (custom) × ]                 │
│  LinkedIn    [ (none) ]                      [+ Add]  │
│  Industry    [ "Branche" (custom) × ]       [+ Add]   │
│                                                        │
│  [ Reset to auto-detect ]          [Cancel] [Save]    │
└────────────────────────────────────────────────────────┘
```

**Row component behavior:**
- Each row is a chip-input: current mappings shown as removable chips.
- "+ Add" button opens a **searchable dropdown** (shadcn `Combobox`). Dropdown options are all CRM fields for the correct object (`person` or `org`), labeled `"<human label> (<native|custom>)"`, keyed by `field.key`. Filter by typed text.
- Already-selected chips don't appear in the dropdown options for their row (de-dup).
- Native fields shown before custom fields in the dropdown.
- "No matching fields" empty state in the dropdown if the user's CRM has no matching type.

**"Reset to auto-detect" button:**
- Re-runs `PipedriveAdapter.autoMapCustomFields` client-side against the current cached `FieldMetadata`.
- Replaces the entire modal state with the auto-detected mapping.
- Does not save until the user clicks "Save".
- Confirmation dialog before reset ("This will replace all current mappings with our auto-detected defaults. Continue?").

**"Refresh fields from Pipedrive" button:**
- Calls existing M1 `crm-refresh-metadata` edge function.
- On success, re-renders the modal with the fresh metadata.
- Shows a loading spinner during the call.
- Useful when the user has added new custom fields in Pipedrive and wants them to appear in the dropdowns.

**Save behavior:**
- Validates locally (every array has ≥1 entry for required slots? — see open questions below).
- POSTs to `crm-update-mapping` edge function.
- On success: closes modal, calls `useIntegration` hook to refresh the ConnectedCard.
- On error: inline error message at the bottom of the modal, no close, user can retry.

### 6.3 New component files

- `src/components/integrations/FieldMappingPanel.tsx` — the accordion section in ConnectedCard.
- `src/components/integrations/EditFieldMappingDialog.tsx` — the modal.
- `src/components/integrations/FieldMappingRow.tsx` — single-row chip-input + combobox subcomponent.

### 6.4 Hook addition

`useIntegration` (M1 Task 12) already exposes `integration` and `refetch`. Add one method:

```typescript
useIntegration() → {
  integration, refetch,
  updateMapping: (newMapping: CustomFieldMappings) => Promise<{ok: boolean; error?: string}>
}
```

Implementation calls `invokeEdgeFunction('crm-update-mapping', { integrationId, mappings })`.

---

## 7. Error handling contract

Consistent with M1:
- Never surface raw API errors. Map every error code to a friendly message:
  - `INVALID_STRUCTURE` → "Something's wrong with the mapping data. Please refresh and try again."
  - `UNKNOWN_FIELD_KEY` → "One or more fields no longer exist in your CRM. Click 'Refresh fields from Pipedrive' and retry."
  - `FORBIDDEN` → "You don't have permission to edit this workspace's CRM integration."
  - `NOT_CONNECTED` → "The CRM connection is not active. Reconnect and try again."
- No toast bar for these — render inline in the modal.

---

## 8. Testing plan

### 8.1 Unit tests (deno)

- **`pipedrive.test.ts` extensions** — 6 new tests covering the expanded `autoMapCustomFields` output (native seeds, multi-keyword rows, mobile/direct/industry detection).
- **Migration SQL test** — apply migration to a known-M1-shape row in a test database, assert resulting JSONB matches canonical M1.5 shape.

### 8.2 Edge function tests

- **`crm-update-mapping` contract tests** — send malformed bodies, expect each error code correctly.
- **Key existence validation** — send a mapping with a fake hex hash, expect `UNKNOWN_FIELD_KEY`.

### 8.3 Manual acceptance tests

1. Fresh Pipedrive account with 3 custom fields ("Domain", "LinkedIn URL", "Branche"). Connect → open ConnectedCard → see all 13 slots, 8 seeded with native keys, 3 auto-detected. All values correct.
2. Click Edit → modify `person.email` to include a second custom field. Save. Close & reopen → changes persisted.
3. Delete a mapped custom field in Pipedrive (via their UI). Return to Bravoro → ConnectedCard shows `⚠ unknown field` badge. Click Edit → Refresh fields → unknown-key entries still show (can be removed). Remove + Save → warning gone.
4. Reset to auto-detect → all user overrides disappear, back to defaults.

---

## 9. Open questions — resolve during M1.5 brainstorming session

1. **Required vs optional slots** — should save be blocked if `person.email` is empty? `org.website` empty? Current leaning: only `person.firstName`, `person.lastName`, and `org.name` are required (used for display everywhere); everything else is optional but warned.
2. **Label subtypes on Pipedrive native multi-value fields** — `person.email` in Pipedrive is actually an array of `{value, primary, label}` where label is "Work" / "Home" / etc. Do we need to capture label preference in the mapping, or treat all subtypes as a single source? (Defer full answer to M3 since it's a push-back concern.)
3. **Write-back intent disclosure** — the modal says "Bravoro uses this to find existing contacts and write enriched data back." Is this the right framing at M1.5 when M3 push-back isn't live yet? Alternatives: only mention dedup, or add a "push-back coming soon" note.
4. **Admin-panel parity** — should a global admin be able to edit a workspace's mapping from the Admin panel? Yes, eventually — deferred to M1.6 to stay focused.
5. **Auto-detect sensitivity** — keyword list coverage. Do we add more languages (French, Spanish)? English + German covers today's customer base.

---

## 10. Acceptance criteria

- [ ] Migration runs cleanly against existing dev DB, no data loss.
- [ ] Adapter tests: 5 existing + 6 new = 11 tests pass.
- [ ] New `crm-update-mapping` edge function deploys with `--no-verify-jwt`, returns each error code correctly on malformed input.
- [ ] `update_crm_field_mappings` RPC enforces status check (`connected` only).
- [ ] `ConnectedCard` renders the 13-slot mapping summary.
- [ ] "Edit field mapping" modal loads, allows editing, saves correctly.
- [ ] "Reset to auto-detect" replaces current mappings with fresh auto-detection.
- [ ] "Refresh fields from Pipedrive" refetches metadata + updates dropdown options.
- [ ] Unknown-field-key rendering: deleted CRM fields show warning in ConnectedCard and modal.
- [ ] No raw API errors exposed to users.
- [ ] No secrets in committed files (pre-commit hook continues to pass).
- [ ] M2 spec amendment landed — field-key references updated.

---

## 11. Implementation order (drives the M1.5 plan)

1. Write DB migration `20260423000003_expand_field_mappings.sql`.
2. Update `CustomFieldMappings` type in `types.ts`.
3. Update `PipedriveAdapter.autoMapCustomFields` implementation.
4. Extend `pipedrive.test.ts` — verify auto-map returns expanded shape.
5. Create new RPC `update_crm_field_mappings` (in same migration file or separate).
6. Build `crm-update-mapping` edge function.
7. Build `FieldMappingRow` subcomponent (chip input + combobox).
8. Build `EditFieldMappingDialog`.
9. Build `FieldMappingPanel` (accordion inside ConnectedCard).
10. Extend `useIntegration` hook with `updateMapping`.
11. Wire everything up in `ConnectedCard`.
12. Manual acceptance tests.
13. M2 spec amendment.

Actual task-by-task plan written via `superpowers:writing-plans` in a fresh session after M1 ships.

---

## 12. Environment variables & secrets

No new ones. Reuses M1 secrets (`SUPABASE_SERVICE_ROLE_KEY`, etc.). No new n8n integration.

---

## 13. References

- M1 connect-flow design: `2026-04-23-crm-dedup-m1-connect-flow-design.md`
- M2 dedup-gate design: `2026-04-23-crm-dedup-m2-dedup-gate-design.md`
- Roadmap: `2026-04-23-crm-dedup-roadmap.md`
- PRD: `InputFiles/PRD_bravoro_crm_dedup.md` (pre-brainstorm doc, superseded by specs)
- Pipedrive API docs: https://developers.pipedrive.com/docs/api/v1
- Zapier field mapping UX (reference): https://help.zapier.com/hc/en-us/articles/8495937005069
