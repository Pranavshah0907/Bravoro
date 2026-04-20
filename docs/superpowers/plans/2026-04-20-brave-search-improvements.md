# Brave Search Improvements — Recruiting Chat

> **Goal:** Improve search quality for niche/product-specific queries by teaching the agent smarter query strategy and increasing Brave result count.

## Problem

When users search for niche product experts (e.g., "Claude Code experts Germany"):
- The agent rephrases the product name into separate words ("Anthropic Claude", "Claude AI")
- Brave interprets "Claude" as a person's name, returning people named Claudia/Claude
- Google handles the same query correctly because it understands compound product names
- The agent hits 15 max iterations with 0 useful results, wasting ~$0.20

## Changes

### Change 1: System Prompt — Exact Phrase Search Strategy

**File:** n8n workflow `s0O8bOOD5i3cp8PW` (Recruiting Chat), node `Recruiting Agent`
**Field:** `options.systemMessage`

**What to add** to the Search Strategy section (after "ALWAYS start with LinkedIn"):

```
- **EXACT PHRASE FIRST:** When the user mentions a specific product, tool, or technology name 
  (e.g., "Claude Code", "Terraform Cloud", "Power BI"), ALWAYS use it in quotes in your 
  first search: site:linkedin.com/in "Claude Code" expert Germany
  - Search 1: exact quoted phrase + role + location
  - Search 2: exact phrase WITHOUT quotes (broader)
  - Search 3: related/alternative names (e.g., "Anthropic Claude", "Claude AI")
  - Search 4+: synonyms, different platforms (Xing, GitHub)
  Only broaden if earlier searches didn't find enough candidates.
```

**Implementation:** Use `patchNodeField` on the Recruiting Agent node to patch the systemMessage. Find the line:
```
- ALWAYS start with LinkedIn: `site:linkedin.com/in [role] [skills] [location]`
```
And add the exact phrase strategy after it.

### Change 2: Brave Search Count 10 → 20

**File:** n8n workflow `Q1yfG8BwUfLGhRdR` (Brave Search Trimmer), node `Brave API`
**Field:** `parameters.queryParameters.parameters[1].value`

**What to change:** The `count` parameter from `"10"` to `"20"`

Also update the Trim Results code node to slice 20 instead of 10:
- Find: `webResults.slice(0, 10)`
- Replace: `webResults.slice(0, 20)`

**Implementation:**
```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "Q1yfG8BwUfLGhRdR",
  operations: [
    { type: "updateNode", nodeName: "Brave API", 
      updates: { "parameters.queryParameters.parameters.1.value": "20" } },
    { type: "patchNodeField", nodeName: "Trim Results", 
      fieldPath: "parameters.jsCode",
      patches: [{ find: "webResults.slice(0, 10)", replace: "webResults.slice(0, 20)" }] }
  ]
})
```

## Cost Impact

- **Change 1:** Zero cost — same number of API calls, just smarter query ordering
- **Change 2:** ~$0.0015 more per search (extra tokens from 10 more snippets) — negligible

## Verification

After implementing, test with: "3 Claude Code experts from Germany"
- Check n8n execution logs for Brave Search Trimmer — verify query has `"Claude Code"` in quotes
- Verify Brave returns relevant LinkedIn profiles (not people named Claude/Claudia)
- Verify count=20 in Brave API call

## Context: Workflow IDs

| Workflow | ID | Purpose |
|----------|-----|---------|
| Recruiting Chat | `s0O8bOOD5i3cp8PW` | Main agent — system prompt lives here |
| Brave Search Trimmer | `Q1yfG8BwUfLGhRdR` | Sub-workflow — Brave API call + result trimming |
| Orches_PeopleEnrich_Recruit | `OjFXabp1VXizVsri` | Recruiting enrichment orchestrator (not changed) |
| Engine_PeopleEnrich_Recruit | `Yrjv8CVksuGoscxY` | Recruiting enrichment engine (not changed) |
