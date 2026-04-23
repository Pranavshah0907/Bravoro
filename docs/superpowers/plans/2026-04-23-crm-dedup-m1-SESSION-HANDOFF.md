# CRM Dedup M1 — Session Handoff

**Date written:** 2026-04-23
**Purpose:** Enable a fresh Claude Code session to resume M1 implementation from Task 2 without re-reading the entire brainstorming/planning conversation.

---

## Current state (top-level)

- **Feature:** CRM Dedup Integration — Milestone 1 (connect flow, Pipedrive only). User connects their CRM from Settings → Integrations; Bravoro verifies the token, caches field metadata, runs auto-mapping, stores the token in Supabase Vault. Dedup check itself is M2.
- **Branch:** `feat/crm-dedup-m1` (pushed to origin). Do NOT merge to main yet.
- **Plan file:** `docs/superpowers/plans/2026-04-23-crm-dedup-m1-connect-flow.md`
- **Spec file:** `docs/superpowers/specs/2026-04-23-crm-dedup-m1-connect-flow-design.md`
- **Roadmap:** `docs/superpowers/specs/2026-04-23-crm-dedup-roadmap.md`
- **M2 draft spec (do NOT implement now):** `docs/superpowers/specs/2026-04-23-crm-dedup-m2-dedup-gate-design.md`

## Tasks progress

| Task | Status | Notes |
|---|---|---|
| Preflight 1 (Vault check) | ✅ done | `supabase_vault` extension confirmed enabled on project `ggvhwxpaovfvoyvzixqw`. |
| Preflight 2 (branch setup) | ✅ done | Branched from `main` (local main was ahead of origin by 2 light-theme doc commits — those came along for the ride; harmless). Cherry-picked specs + plan commits. |
| Task 1: Migration | ✅ done | See "Task 1 deviations" below. |
| Task 2: Regenerate Supabase types | ⏭️ **next up** | First task the new session should execute. |
| Tasks 3–19 | ⏭️ pending | Each has full spec + code in the plan. |

## Commits made so far on this branch

From oldest to newest:
1. `a07f304` — cherry-picked: "docs(crm-dedup): M1 + M2 design specs + roadmap"
2. `6967a06` — cherry-picked: "docs(crm-dedup): M1 implementation plan"
3. `ec20ab7` — **Task 1 (initial):** "feat(crm): add integrations schema + Vault RPCs" — created migration `20260423000000_add_crm_integrations.sql` (242 lines).
4. `18296b6` — **Task 1 (fix):** "fix(crm): prevent orphan vault secrets on CRM reconnect" — created migration `20260423000002_fix_crm_vault_reconnect.sql`. Fixes Critical + 2 Important findings from code review on `ec20ab7`.
5. `6b861f7` — "docs(crm-dedup): defer concurrent-first-connect race hardening to v1.1" — added v1.1 deferred item to roadmap.
6. (This handoff doc commit will follow)

## Task 1 deviations (things the new session should know)

1. **Two migration files, not one.** The plan called for a single `20260423000000_add_crm_integrations.sql`. After code review found an orphan-Vault-secret bug on reconnect (and two less-important issues), a follow-up migration `20260423000002_fix_crm_vault_reconnect.sql` was added instead of amending the original (which was already applied to the remote DB). The `000001` slot is intentionally skipped to leave room for a light-theme branch migration.
2. **Supabase CLI `db query` subcommand doesn't exist.** The plan's Preflight 1 and Task 1 Step 3 used `supabase.exe db query --linked` for smoke-testing. On CLI v2.75.0 this subcommand isn't present. **Replacement pattern:** use the Supabase Management API SQL endpoint:
   ```bash
   curl -s -X POST "https://api.supabase.com/v1/projects/ggvhwxpaovfvoyvzixqw/database/query" \
     -H "Authorization: Bearer sbp_14503d14f5cd0838d085c670859378241652857e" \
     -H "Content-Type: application/json" \
     -d '{"query":"YOUR SQL HERE"}'
   ```
   This works for any ad-hoc query. Apply it anywhere the plan says `supabase.exe db query`.
3. **Management token rotated.** Previous tokens in memory (`sbp_4803...` and `sbp_29df...`) expired. Current working token is `sbp_14503d14f5cd0838d085c670859378241652857e` — already updated in MEMORY.md.
4. **Vault `update_secret` 2-arg shorthand.** The fixed `encrypt_integration_token` calls `vault.update_secret(id, text)` with 2 positional args. Supabase's vault.update_secret signature has 4 params but the latter two default. Verified working in the dev project.

## Deferred from M1 (raised during implementation, deferred per user OK)

- **Concurrent first-connect race in `encrypt_integration_token`.** If two workspace members simultaneously click "Connect" for the same workspace+CRM for the very first time, the losing transaction raises a PK exception and orphans one vault secret. Extreme edge case. Fix is ~5 lines (ON CONFLICT DO NOTHING on the INSERT + delete the just-created secret in the losing branch). Deferred to v1.1 — see roadmap.

## User's stated preferences for the next session

Per `memory/feedback_review_pattern.md`:

- **Implementers stay as subagents.** The one-task-per-fresh-subagent pattern is working — keep it.
- **Reviewers become controller self-review.** Skip the reviewer subagent dispatch. The controller (main session) reads the diff directly, does spec-compliance and code-quality review inline. Saves context budget and cost per task.
- **Codex as second opinion on high-risk tasks.** The user mentioned installing "the codex plugin" for dual-model review. The exact integration (OpenAI Codex CLI? Codex-wrapping MCP server? other?) is unresolved. Ask them at the top of the next session to clarify which flavor they meant, then install and validate before relying on it. Use for: migrations, security-sensitive edge functions, auth changes. Don't over-apply.

## Pipedrive test token — not yet provided

Task 5 and Task 8 include smoke tests that require a real Pipedrive API token. The user has confirmed they have one on `pranavshah0907@gmail.com`'s Pipedrive. At the start of Task 5, ask them to paste the token or confirm they'll enter it via the UI after Task 16 is live (the latter delays backend-only verification of `testConnection` / `fetchFieldMetadata`).

## Environment (copy-paste ready)

```
Project ref:       ggvhwxpaovfvoyvzixqw
Supabase URL:      https://ggvhwxpaovfvoyvzixqw.supabase.co
Management token:  sbp_14503d14f5cd0838d085c670859378241652857e
CLI:               /c/Users/prana/scoop/shims/supabase.exe
Working dir:       C:\Pranav\SiddhaAI\02_Bravoro\01_WebsiteRepo\leapleadsai
Branch:            feat/crm-dedup-m1
Shell:             Git Bash (use Unix paths, forward slashes)
Node:              export PATH="/c/Program Files/nodejs:$PATH"
Dev server:        npm run dev → http://localhost:8080
```

## How to resume (new session checklist)

1. **Load context:** read the four docs in this order:
   - `docs/superpowers/plans/2026-04-23-crm-dedup-m1-SESSION-HANDOFF.md` (this file, first)
   - `docs/superpowers/plans/2026-04-23-crm-dedup-m1-connect-flow.md` (the plan)
   - `docs/superpowers/specs/2026-04-23-crm-dedup-m1-connect-flow-design.md` (spec, for reference)
   - `docs/superpowers/specs/2026-04-23-crm-dedup-roadmap.md` (shared context)
2. **Verify branch:** `git branch --show-current` should print `feat/crm-dedup-m1`. If not, `git checkout feat/crm-dedup-m1`.
3. **Sync with remote:** `git pull` to pick up any additional commits made while you were away.
4. **Resolve the Codex question** at the top — ask the user which Codex they meant, install, validate.
5. **Pick up at Task 2** (regenerate types) and proceed through Tasks 3–19 using the review pattern in `memory/feedback_review_pattern.md`:
   - Dispatch a fresh implementer subagent per task (Haiku for mechanical tasks, Sonnet for integration/judgment).
   - On DONE: read the diff yourself, do spec + quality review inline.
   - For DB migrations or security-sensitive code: also run Codex review.
   - If issues found: re-dispatch the same implementer (or a fresh one with explicit fix instructions) until clean.
   - Mark task complete, move to next.
6. **After Task 19:** open a PR to `main` titled "M1: CRM dedup — Pipedrive connect flow", linking to the spec. Do NOT merge before the full acceptance criteria in plan §"Acceptance criteria" pass.

## Open items that aren't part of M1 but should get noted to the user in the next session

- **Local `main` is ahead of `origin/main` by 2 commits** (light-theme docs: `0174322` + `b877476`). They should be pushed or moved to `feat/light-theme` — user's call, not ours to decide.
- **Stashed light-theme WIP** exists on this branch: `git stash list` should show "On light-theme: light-theme WIP before CRM M1 branch". When the user returns to finish light-theme, they run `git checkout feat/light-theme && git stash pop`.
- **A handful of untracked files/folders** in the working tree (`.playwright-mcp/`, `.superpowers/`, `AydinAudit/`, duplicates like `CLAUDE (1).md`, etc.). Not our problem, but noted so the next session doesn't accidentally commit them.
