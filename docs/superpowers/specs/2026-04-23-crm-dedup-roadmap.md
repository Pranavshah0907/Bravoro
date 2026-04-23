# CRM Dedup Integration — Roadmap & Shared Context

**Date:** 2026-04-23
**Status:** M1 design approved, M1 plan pending
**Source PRD:** `InputFiles/PRD_bravoro_crm_dedup.md`
**Companion specs:**
- `2026-04-23-crm-dedup-m1-connect-flow-design.md` (implementation-ready)
- `2026-04-23-crm-dedup-m2-dedup-gate-design.md` (spec drafted from PRD, needs brainstorming session before implementation)

---

## Product vision

Bravoro is an enrichment engine. Users connect a CRM once, and then every enrichment run first checks whether a contact already exists in that CRM before spending money on enrichment.

**Business goal:** Prevent wasted enrichment spend on contacts that already exist in the client's CRM, across many clients on many different CRMs.

**User-visible promise:** Pick your CRM from a dropdown, paste an API token, click Connect. Walk away — Bravoro now automatically dedup-checks every lead in your enrichment waterfall.

---

## Milestone sequence

| Milestone | Scope | Spec | Status |
|---|---|---|---|
| **M1** | Connect flow end-to-end (no dedup yet). Schema, Vault, Settings → Integrations tab, 4 edge functions, health check cron, Pipedrive adapter with testConnection / fetchFieldMetadata / autoMapCustomFields. | `m1-connect-flow-design.md` | Design approved 2026-04-23 |
| **M2** | Dedup gate: 3-layer Pipedrive matching, normalization, `crm-dedup-check` edge function, n8n dedup workflow, wiring into `trigger-n8n-webhook`. | `m2-dedup-gate-design.md` | Draft spec from PRD; needs brainstorming before plan |
| **M1.5** (polish between M1 and M2) | Global admin manage-any-workspace-integration from Admin panel. | (not yet written) | Deferred |
| **v1.1** | HubSpot adapter + OAuth. Salesforce adapter + OAuth. Custom field mapping override UI. Post-enrichment email-exact dedup. "Coming soon" labels in CRM dropdown. | (not yet written) | Deferred |
| **v1.2** | Zoho, Close adapters. Dedup analytics dashboard. Bulk dedup API. | (not yet written) | Deferred |
| **Speculative** | AI-powered custom field mapping. Merge.dev fallback. | (not committed) | Deferred |

---

## Architectural anchors (apply across all milestones)

- **Workspace-scoped integrations**, not user-scoped. One Pipedrive per workspace. Any workspace member can manage. Global admins can manage any workspace.
- **Supabase Vault via RPC wrapper** (`encrypt_integration_token` / `decrypt_integration_token` / `delete_integration_cascade`) for encrypted token storage. Edge functions read via the RPC only; tokens never cross HTTP boundaries except the initial user-provided token on connect.
- **Adapter pattern** at `supabase/functions/_shared/adapters/` (types.ts, registry.ts, pipedrive.ts). Interface grows forward between milestones — never refactored.
- **Binary status** in `integrations` table: `connected` or `error`. Disconnect = hard delete, Vault secret removed first, row removed second. No `disconnected` state.
- **Search flow never blocked by CRM state.** Error state skips dedup silently + shows a daily-dismissable toast. No integration row = silent.
- **n8n is a thin orchestration layer.** All CRM-specific logic lives in Supabase edge functions. Adding a CRM = new adapter file + registry line; zero n8n changes.
- **Credits model:** dedup itself is free. Only enrichment costs credits. Workspace credit ledger (existing) is unchanged by this feature.

---

## Security & compliance anchors

1. **API tokens encrypted at rest** in Supabase Vault. Not stored in plaintext anywhere — not in DB, not in env vars, not in n8n.
2. **Row-level security** on `integrations` and `integration_field_metadata` — workspace members see only their own workspace. `integration_secrets` accessible only by service role.
3. **Edge functions use service role** to read tokens from Vault; the decrypted token never leaves the edge function.
4. **n8n → Supabase** (M2) authenticated via service role key stored as n8n credential.
5. **Caller → n8n webhook** (M2) authenticated via header shared secret.
6. **Rotate the Pipedrive token used during development** before go-live. Token lives under `pranavshah0907@gmail.com`'s Pipedrive account during development; production tokens are per-client.
7. **Never log tokens.** Audit logs capture integration_id, timestamps, verdicts — not tokens or field values.
8. **Health check cron** authenticated by header shared secret (`CRM_HEALTH_CHECK_SECRET`), not JWT.

---

## Integration with existing Bravoro systems

### Existing internal dedup cache (already shipped)
- `master_contacts` + `user_enriched_contacts` junction + `get_user_enriched_contact` RPC.
- Prevents re-enriching someone **Bravoro itself** has previously enriched for a user.
- **Runs first** in the future M2 waterfall.

### CRM dedup (this feature)
- Prevents enriching someone the **client's own CRM** already has.
- **Runs second** in the M2 waterfall, after internal cache hit/miss, before paid enrichment.

### Waterfall order (M2)
```
Lead input
  └─> Internal cache lookup (get_user_enriched_contact)
        ├─> cached / found  →  return cached contact, no enrichment
        └─> not_found       →  CRM dedup check (this feature, M2)
                                    ├─> skip_duplicate          →  skip enrichment
                                    ├─> enrich_link_to_org      →  enrich, tag org
                                    ├─> enrich_new              →  enrich normally
                                    └─> review                  →  skip enrichment, surface for human review
```

### n8n routing (unchanged in M1, extended in M2)
Existing routes in `trigger-n8n-webhook`:
- `manual_entry` → `enrichment_bulk_manual`
- `bulk_upload` → `bulk_search`
- `bulk_people_enrichment` → `bulk_enrich`

M2 will add an optional `integration_id` field to the payload; n8n routes that include the field insert a dedup sub-step before enrichment.

---

## Deferred items tracker (master list)

### Milestone 1.5 (small polish before M2)
- Global admin management of any workspace's integration from the Admin panel.

### Milestone 2 (next spec → plan → implementation cycle)
- `crm-dedup-check` edge function.
- Pipedrive 3-layer matching algorithm (person by email domain → org by domain → org name fuzzy).
- Normalization functions: domain, punycode, umlauts, title stripping, obfuscated last names.
- n8n dedup workflow.
- Wiring dedup verdict into the existing `trigger-n8n-webhook` flow.
- `CustomFieldMappings.org.practiceType` becomes populated / used by Layer-2 matching.
- External npm packages: `fastest-levenshtein` or `fuzzball` for name similarity.
- Periodic cron extended (or kept as-is from M1 — decide when M2 is brainstormed).

### v1.1 (next product milestone)
- HubSpot adapter + OAuth flow.
- Salesforce adapter + OAuth flow.
- Custom field mapping override UI (manual review of auto-detection).
- Post-enrichment email-exact dedup (second gate after enrichment).
- "Coming soon" labels in CRM dropdown when additional adapters are imminent.
- **Concurrent-first-connect race hardening in `encrypt_integration_token`.** Current implementation can orphan one vault secret if two workspace members click Connect simultaneously for the same workspace+CRM's very first connect. Failure mode is a surfaced PK exception (retriable, not data loss). Fix path: `ON CONFLICT DO NOTHING` on the `integration_secrets` INSERT plus delete of the just-created vault secret in the losing branch. Raised by code review on 2026-04-23 during M1 Task 1.

### v1.2
- Zoho, Close adapters.
- Dedup analytics dashboard (verdict distribution, false-positive rate, cost saved).
- Bulk dedup API (accept array of leads, return array of verdicts).

### Speculative (not committed)
- AI-powered custom field mapping (LLM classifies fields whose labels don't match heuristics).
- Merge.dev fallback for CRMs without a bespoke adapter.

---

## Out of scope permanently

- Writing enrichment results back to CRM (handled by a separate downstream n8n workflow — not this feature's concern).
- Deduping existing CRM records against each other (separate cleanup project).
- Two-way sync between Bravoro and CRM.

---

## Implementation order (for whoever picks this up)

1. Read this roadmap first.
2. Read `m1-connect-flow-design.md` — drives M1 implementation plan.
3. After M1 is implemented and shipped, run a fresh brainstorming session against `m2-dedup-gate-design.md` to resolve its open questions before writing the M2 plan.
4. After M2 ships, write `v1.1-*-design.md` for the next CRM / feature.
