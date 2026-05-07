# n8n workflow assets for CRM dedup

These JSON exports are the n8n side of Spec A
(`docs/superpowers/specs/2026-05-06-crm-contact-mirror-and-dedup-api-design.md`).

## Setup once

1. Open `.dev-notes/crm-dedup-secret.local.txt` (gitignored) and copy the secret.
2. In each JSON file below, replace `YOUR_CRM_DEDUP_SECRET` with that value
   (or save it as an n8n credential and reference it instead — preferred).

## crm_contact_sync_30min.json

Standalone workflow. Imports a Schedule trigger every 30 min that POSTs
to `crm-sync-contacts`. Activate after import.

**To import:** In n8n, click the workflow menu → "Import from file" →
choose this JSON. After import, edit the Authorization header to your
real secret, then activate.

## crm_dedup_check_node_snippet.json

Two pieces meant to slot *into* an existing enrichment workflow:

- `node_to_paste_before_enrichment`: an HTTP Request node config that
  POSTs to `crm-dedup-check`. Drop it in *before* the enrichment step.
  Expects upstream JSON with `workspace_id` and
  `leads: [{email, first_name, last_name, domain}]`.

- `next_filter_node_javascript`: a Code-node JS that filters the
  upstream leads down to those with `verdict === 'unique'`. Forward
  those to enrichment. Fail-open: if the dedup response is malformed,
  it passes everything through rather than dropping leads.

## Why two flows?

- **Contact mirror sync (cron, 30 min):** keeps the `crm_contacts` table
  in Supabase up to date with Pipedrive. n8n runs the cron because we
  don't have pg_cron in this Supabase project.
- **Dedup check (per-batch, ad hoc):** when a search produces leads,
  this checks them against the mirror before paid enrichment runs.
