# Save Chat Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically save enriched contacts from recruiting chat to `master_contacts` + `user_enriched_contacts` with proper workspace credit deduction, every time enrichment data is returned.

**Architecture:** New `save-chat-contacts` Supabase edge function handles master DB writes + credit tracking (RLS requires service_role). Frontend (`ChatInterface.tsx`) detects enriched contacts with phone numbers, creates/reuses a search record, calls the edge function, and appends to `search_results`. The existing bare `credit_usage` insert is replaced by the edge function handling it with proper `search_id` linkage and dedup safety.

**Tech Stack:** Deno (edge function), React/TypeScript (frontend), Supabase (DB + RPC), jose (JWT auth)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/ai-chat/types.ts` | Modify | Add raw enrichment fields to `ContactData` |
| `src/components/ai-chat/parseMessage.ts` | Modify | Preserve raw enrichment fields in `normalizeEnrichedContacts()` |
| `supabase/functions/save-chat-contacts/index.ts` | Create | Edge function: upsert master_contacts, junction table, credit_usage, workspace deduction |
| `src/components/ai-chat/saveChatContacts.ts` | Create | Frontend helper: format contacts, call edge function, append search_results |
| `src/components/chat/ChatInterface.tsx` | Modify | Auto-trigger save on enriched contacts, remove bare credit_usage insert |

---

### Task 1: Extend ContactData Interface

**Files:**
- Modify: `src/components/ai-chat/types.ts:20-39`

- [ ] **Step 1: Add raw enrichment fields to ContactData**

Add these optional fields after the existing `departments` field at line 38:

```typescript
export interface ContactData {
  fullName: string;
  jobTitle: string;
  companyName: string;
  companyDomain: string;
  linkedinUrl: string;
  email: string;
  phone: string;
  mobilePhone?: string;
  directPhone?: string;
  city: string;
  country: string;
  source: string;
  previewOnly: boolean;
  skills?: string[];
  experienceSummary?: string;
  headline?: string;
  seniority?: string;
  departments?: string;
  // Raw enrichment fields (preserved from n8n for DB persistence)
  personId?: string;
  firstName?: string;
  lastName?: string;
  apolloPersonID?: string;
  cognismPersonID?: string;
  peopleSearchBy?: string;
  apolloCreditsUsed?: number;
  cognismCreditsUsed?: number;
  lushaCreditsUsed?: number;
  aLeadscreditsUsed?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-chat/types.ts
git commit -m "feat: extend ContactData with raw enrichment fields for DB persistence"
```

---

### Task 2: Preserve Raw Enrichment Fields in Parser

**Files:**
- Modify: `src/components/ai-chat/parseMessage.ts:16-29`

- [ ] **Step 1: Update normalizeEnrichedContacts to preserve all raw fields**

Replace the `normalizeEnrichedContacts` function (lines 16-29) with:

```typescript
/** Map n8n enrichment field names to ContactData interface */
function normalizeEnrichedContacts(data: StructuredData | null): void {
  if (!data?.contacts) return;
  for (const contact of data.contacts) {
    const raw = contact as Record<string, unknown>;
    const mobile = raw["phoneNumber(mobile)"] as string | undefined;
    const direct = raw["phoneNumber(direct)"] as string | undefined;
    if (mobile) contact.mobilePhone = mobile;
    if (direct) contact.directPhone = direct;
    contact.phone = contact.phone || mobile || direct || "";
    if (raw.seniority && typeof raw.seniority === "string") contact.seniority = raw.seniority;
    if (raw.departments && typeof raw.departments === "string") contact.departments = raw.departments;
    if (raw.provider && typeof raw.provider === "string" && !contact.source) contact.source = raw.provider;
    // Preserve raw enrichment fields for DB persistence
    if (raw.personId && typeof raw.personId === "string") contact.personId = raw.personId;
    if (raw.firstName && typeof raw.firstName === "string") contact.firstName = raw.firstName;
    if (raw.lastName && typeof raw.lastName === "string") contact.lastName = raw.lastName;
    if (raw.apolloPersonID && typeof raw.apolloPersonID === "string") contact.apolloPersonID = raw.apolloPersonID;
    if (raw.cognismPersonID && typeof raw.cognismPersonID === "string") contact.cognismPersonID = raw.cognismPersonID;
    if (raw.peopleSearchBy && typeof raw.peopleSearchBy === "string") contact.peopleSearchBy = raw.peopleSearchBy;
    if (typeof raw.apolloCreditsUsed === "number") contact.apolloCreditsUsed = raw.apolloCreditsUsed;
    if (typeof raw.cognismCreditsUsed === "number") contact.cognismCreditsUsed = raw.cognismCreditsUsed;
    if (typeof raw.lushaCreditsUsed === "number") contact.lushaCreditsUsed = raw.lushaCreditsUsed;
    if (typeof raw.aLeadscreditsUsed === "number") contact.aLeadscreditsUsed = raw.aLeadscreditsUsed;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-chat/parseMessage.ts
git commit -m "feat: preserve raw enrichment fields (personId, credits, provider IDs) in parser"
```

---

### Task 3: Create save-chat-contacts Edge Function

**Files:**
- Create: `supabase/functions/save-chat-contacts/index.ts`

This is the core of the feature. It receives enriched contacts from the frontend and handles all DB writes that require service_role access.

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/save-chat-contacts/index.ts` with the following content:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.15.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatContact {
  person_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_1: string;
  phone_2: string;
  linkedin: string;
  title: string;
  organization: string;
  domain: string;
  provider: string;
  people_search_by?: string;
  cognism_person_id?: string;
  apollo_person_id?: string;
  cognism_credits_used: number;
  apollo_credits_used: number;
  lusha_credits_used: number;
  aleads_credits_used: number;
}

interface RequestBody {
  search_id: string;
  contacts: ChatContact[];
  credits: {
    cognism_credits: number;
    apollo_credits: number;
    aleads_credits: number;
    lusha_credits: number;
    grand_total_credits: number;
    mobile_phone_contacts: number;
    mobile_phone_credits: number;
    direct_phone_contacts: number;
    direct_phone_credits: number;
    email_only_contacts: number;
    email_only_credits: number;
    enriched_contacts_count: number;
  };
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    // ── JWT auth (same pattern as trigger-n8n-webhook) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(
        new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
      );
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: "authenticated",
      });
      userId = payload.sub as string;
      if (!userId) throw new Error("no sub");
    } catch {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Service-role client for DB writes ──
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: RequestBody = await req.json();
    const { search_id, contacts, credits } = body;

    if (!search_id || !contacts?.length) {
      return new Response(
        JSON.stringify({ error: "search_id and contacts[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] save-chat-contacts: ${contacts.length} contacts for search ${search_id}, user ${userId}`);

    // ── 1. Upsert each contact to master_contacts + user_enriched_contacts ──
    let savedCount = 0;
    let cachedCount = 0;

    for (const contact of contacts) {
      try {
        const personId = contact.person_id?.trim() || null;
        const email = contact.email?.trim() || null;
        const linkedin = contact.linkedin?.trim() || null;
        const firstName = contact.first_name?.trim() || null;
        const lastName = contact.last_name?.trim() || null;
        const organization = contact.organization?.trim() || null;
        const domain = contact.domain?.trim() || null;
        const phone1 = contact.phone_1?.trim() || null;
        const phone2 = contact.phone_2?.trim() || null;
        const title = contact.title?.trim() || null;
        const provider = contact.provider?.trim() || null;
        const cognismPersonId = contact.cognism_person_id?.trim() || null;
        const apolloPersonId = contact.apollo_person_id?.trim() || null;
        const cognismCreditsUsed = toInt(contact.cognism_credits_used);
        const apolloCreditsUsed = toInt(contact.apollo_credits_used);
        const lushaCreditsUsed = toInt(contact.lusha_credits_used);
        const aleadsCreditsUsed = toInt(contact.aleads_credits_used);

        // 4-level dedup: person_id → linkedin → email → name+org
        let existingRecord = null;

        if (personId) {
          const { data } = await supabase
            .from("master_contacts")
            .select("*")
            .eq("person_id", personId)
            .maybeSingle();
          existingRecord = data;
        }

        if (!existingRecord && linkedin) {
          const { data } = await supabase
            .from("master_contacts")
            .select("*")
            .eq("linkedin", linkedin)
            .maybeSingle();
          existingRecord = data;
        }

        if (!existingRecord && email) {
          const { data } = await supabase
            .from("master_contacts")
            .select("*")
            .eq("email", email)
            .maybeSingle();
          existingRecord = data;
        }

        if (!existingRecord && firstName && lastName && organization) {
          const { data } = await supabase
            .from("master_contacts")
            .select("*")
            .eq("first_name", firstName)
            .eq("last_name", lastName)
            .eq("organization", organization)
            .maybeSingle();
          existingRecord = data;
        }

        let masterContactId: string;

        if (existingRecord) {
          masterContactId = existingRecord.id;
          const updates: Record<string, unknown> = {
            last_updated_at: new Date().toISOString(),
          };
          if (personId) updates.person_id = personId;
          if (email) updates.email = email;
          if (phone1) updates.phone_1 = phone1;
          if (phone2) updates.phone_2 = phone2;
          if (linkedin) updates.linkedin = linkedin;
          if (title) updates.title = title;
          if (organization) updates.organization = organization;
          if (domain) updates.domain = domain;
          if (provider) updates.provider = provider;
          if (cognismPersonId) updates.cognism_person_id = cognismPersonId;
          if (apolloPersonId) updates.apollo_person_id = apolloPersonId;
          if (cognismCreditsUsed > 0) updates.cognism_credits_used = cognismCreditsUsed;
          if (lushaCreditsUsed > 0) updates.lusha_credits_used = lushaCreditsUsed;
          if (aleadsCreditsUsed > 0) updates.aleads_credits_used = aleadsCreditsUsed;
          if (apolloCreditsUsed > 0) updates.apollo_credits_used = apolloCreditsUsed;

          // Email merge logic
          if (email && existingRecord.email && email !== existingRecord.email) {
            if (!existingRecord.email_2 || existingRecord.email_2 !== email) {
              updates.email_2 = existingRecord.email;
            }
          }

          const { error } = await supabase
            .from("master_contacts")
            .update(updates)
            .eq("id", existingRecord.id);

          if (error) {
            console.error(`[${requestId}] Error updating master_contacts:`, error);
          }
        } else {
          const { data: inserted, error } = await supabase
            .from("master_contacts")
            .insert({
              person_id: personId,
              first_name: firstName,
              last_name: lastName,
              email,
              phone_1: phone1,
              phone_2: phone2,
              linkedin,
              title,
              organization,
              domain,
              provider,
              cognism_person_id: cognismPersonId,
              apollo_person_id: apolloPersonId,
              cognism_credits_used: cognismCreditsUsed,
              lusha_credits_used: lushaCreditsUsed,
              aleads_credits_used: aleadsCreditsUsed,
              apollo_credits_used: apolloCreditsUsed,
              source_search_id: search_id,
              source_user_id: userId,
              first_seen_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (error || !inserted) {
            console.error(`[${requestId}] Error inserting master_contacts:`, error);
            continue;
          }
          masterContactId = inserted.id;
        }

        // Check if user already enriched this contact (cache check)
        const { data: existingJunction } = await supabase
          .from("user_enriched_contacts")
          .select("id")
          .eq("user_id", userId)
          .eq("master_contact_id", masterContactId)
          .maybeSingle();

        if (existingJunction) {
          cachedCount++;
        } else {
          savedCount++;
        }

        // Upsert junction table
        const contactCredits = cognismCreditsUsed + apolloCreditsUsed + lushaCreditsUsed + aleadsCreditsUsed;
        const { error: junctionError } = await supabase
          .from("user_enriched_contacts")
          .upsert(
            {
              user_id: userId,
              master_contact_id: masterContactId,
              search_id,
              credits_charged: contactCredits,
              enriched_at: new Date().toISOString(),
            },
            { onConflict: "user_id,master_contact_id" }
          );

        if (junctionError) {
          console.error(`[${requestId}] Error upserting user_enriched_contacts:`, junctionError);
        }
      } catch (err) {
        console.error(`[${requestId}] Error processing contact:`, err);
      }
    }

    console.log(`[${requestId}] master_contacts: ${savedCount} new, ${cachedCount} cached`);

    // ── 2. Save credit_usage with search_id (MAX-safe upsert) ──
    if (credits) {
      const { data: existingCredit } = await supabase
        .from("credit_usage")
        .select("id, cognism_credits, apollo_credits, aleads_credits, lusha_credits, grand_total_credits, mobile_phone_contacts, mobile_phone_credits, direct_phone_contacts, direct_phone_credits, email_only_contacts, email_only_credits, enriched_contacts_count")
        .eq("user_id", userId)
        .eq("search_id", search_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextCognism = Math.max(existingCredit?.cognism_credits ?? 0, credits.cognism_credits);
      const nextApollo = Math.max(existingCredit?.apollo_credits ?? 0, credits.apollo_credits);
      const nextAleads = Math.max(existingCredit?.aleads_credits ?? 0, credits.aleads_credits);
      const nextLusha = Math.max(existingCredit?.lusha_credits ?? 0, credits.lusha_credits);
      const nextGrandTotal = Math.max(existingCredit?.grand_total_credits ?? 0, credits.grand_total_credits);
      const nextMobileContacts = Math.max(existingCredit?.mobile_phone_contacts ?? 0, credits.mobile_phone_contacts);
      const nextMobileCredits = Math.max(existingCredit?.mobile_phone_credits ?? 0, credits.mobile_phone_credits);
      const nextDirectContacts = Math.max(existingCredit?.direct_phone_contacts ?? 0, credits.direct_phone_contacts);
      const nextDirectCredits = Math.max(existingCredit?.direct_phone_credits ?? 0, credits.direct_phone_credits);
      const nextEmailContacts = Math.max(existingCredit?.email_only_contacts ?? 0, credits.email_only_contacts);
      const nextEmailCredits = Math.max(existingCredit?.email_only_credits ?? 0, credits.email_only_credits);
      const nextEnrichedCount = Math.max(existingCredit?.enriched_contacts_count ?? 0, credits.enriched_contacts_count);

      const creditRow = {
        cognism_credits: nextCognism,
        apollo_credits: nextApollo,
        aleads_credits: nextAleads,
        lusha_credits: nextLusha,
        grand_total_credits: nextGrandTotal,
        mobile_phone_contacts: nextMobileContacts,
        mobile_phone_credits: nextMobileCredits,
        direct_phone_contacts: nextDirectContacts,
        direct_phone_credits: nextDirectCredits,
        email_only_contacts: nextEmailContacts,
        email_only_credits: nextEmailCredits,
        enriched_contacts_count: nextEnrichedCount,
      };

      if (existingCredit?.id) {
        await supabase
          .from("credit_usage")
          .update({ ...creditRow, updated_at: new Date().toISOString() })
          .eq("id", existingCredit.id);
      } else {
        await supabase
          .from("credit_usage")
          .insert({ user_id: userId, search_id, ...creditRow });
      }

      // ── 3. Workspace credit deduction (delta-safe) ──
      const previousGrandTotal = existingCredit?.grand_total_credits ?? 0;
      const creditDelta = nextGrandTotal - previousGrandTotal;

      if (creditDelta > 0) {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", userId)
          .maybeSingle();

        if (userProfile?.workspace_id) {
          const { data: deductResult } = await supabase.rpc("deduct_workspace_credits", {
            p_workspace_id: userProfile.workspace_id,
            p_amount: creditDelta,
            p_search_id: search_id,
            p_note: `Chat enrichment ${search_id}: +${creditDelta} credits (M:${nextMobileCredits} D:${nextDirectCredits} E:${nextEmailCredits})`,
          });

          if (deductResult?.success) {
            console.log(`[${requestId}] Deducted ${creditDelta} workspace credits. Balance: ${deductResult.new_balance}`);
          } else {
            console.error(`[${requestId}] Workspace deduction failed:`, deductResult?.error);
          }
        }
      }

      console.log(`[${requestId}] Credit usage saved. Grand total: ${nextGrandTotal}, delta: ${nextGrandTotal - previousGrandTotal}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        saved_count: savedCount,
        cached_count: cachedCount,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${requestId}] save-chat-contacts error:`, msg);
    return new Response(
      JSON.stringify({ error: msg, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy the edge function**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions deploy save-chat-contacts --no-verify-jwt --project-ref ggvhwxpaovfvoyvzixqw
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/save-chat-contacts/index.ts
git commit -m "feat: add save-chat-contacts edge function for recruiting chat DB persistence"
```

---

### Task 4: Create Frontend Save Helper

**Files:**
- Create: `src/components/ai-chat/saveChatContacts.ts`

This module formats enriched contacts from the chat into the edge function payload and handles the `search_results` table append.

- [ ] **Step 1: Create the saveChatContacts module**

```typescript
import { supabase } from "@/integrations/supabase/client";
import type { ContactData, Credits } from "./types";

interface SaveResult {
  searchId: string;
  savedCount: number;
  cachedCount: number;
}

/**
 * Format a ContactData into the edge function's ChatContact shape.
 */
function formatContact(contact: ContactData) {
  const nameParts = (contact.fullName || "").trim().split(/\s+/);
  return {
    person_id: contact.personId || "",
    first_name: contact.firstName || nameParts[0] || "",
    last_name: contact.lastName || nameParts.slice(1).join(" ") || "",
    email: contact.email || "",
    phone_1: contact.mobilePhone || contact.phone || "",
    phone_2: contact.directPhone || "",
    linkedin: contact.linkedinUrl || "",
    title: contact.jobTitle || "",
    organization: contact.companyName || "",
    domain: contact.companyDomain || "",
    provider: contact.source || "",
    people_search_by: contact.peopleSearchBy || "",
    cognism_person_id: contact.cognismPersonID || "",
    apollo_person_id: contact.apolloPersonID || "",
    cognism_credits_used: contact.cognismCreditsUsed ?? 0,
    apollo_credits_used: contact.apolloCreditsUsed ?? 0,
    lusha_credits_used: contact.lushaCreditsUsed ?? 0,
    aleads_credits_used: contact.aLeadscreditsUsed ?? 0,
  };
}

/**
 * Format a ContactData into search_results contact_data shape
 * (matches the format used by save-search-results / syncToResults).
 */
function formatForSearchResults(contact: ContactData) {
  const nameParts = (contact.fullName || "").trim().split(/\s+/);
  return {
    First_Name: contact.firstName || nameParts[0] || "",
    Last_Name: contact.lastName || nameParts.slice(1).join(" ") || "",
    Email: contact.email || "",
    LinkedIn: contact.linkedinUrl || "",
    Phone_Number_1: contact.mobilePhone || contact.phone || "",
    Phone_Number_2: contact.directPhone || "",
    Organization: contact.companyName || "",
    Domain: contact.companyDomain || "",
    Title: contact.jobTitle || "",
    Provider: contact.source || "",
    person_id: contact.personId || "",
  };
}

/**
 * Build credit payload from parsed Credits + contacts for the edge function.
 */
function buildCreditPayload(credits: Credits | null, contacts: ContactData[]) {
  if (credits) {
    return {
      cognism_credits: credits.cognism ?? 0,
      apollo_credits: credits.apollo ?? 0,
      aleads_credits: credits.aleads ?? 0,
      lusha_credits: credits.lusha ?? 0,
      grand_total_credits: credits.total ?? 0,
      mobile_phone_contacts: credits.contacts_with_mobile_phone ?? 0,
      mobile_phone_credits: credits.mobile_phone_credits ?? 0,
      direct_phone_contacts: credits.contacts_with_direct_phone_only ?? 0,
      direct_phone_credits: credits.direct_phone_credits ?? 0,
      email_only_contacts: credits.email_linkedin_only_contacts ?? 0,
      email_only_credits: credits.email_only_credits ?? 0,
      enriched_contacts_count:
        (credits.contacts_with_mobile_phone ?? 0) +
        (credits.contacts_with_direct_phone_only ?? 0) +
        (credits.email_linkedin_only_contacts ?? 0),
    };
  }
  // Fallback: compute from contacts if no Credits object
  let mobileCount = 0;
  let directOnlyCount = 0;
  let emailOnlyCount = 0;
  for (const c of contacts) {
    if (c.mobilePhone) mobileCount++;
    else if (c.directPhone) directOnlyCount++;
    else emailOnlyCount++;
  }
  return {
    cognism_credits: 0,
    apollo_credits: 0,
    aleads_credits: 0,
    lusha_credits: 0,
    grand_total_credits: mobileCount * 4 + directOnlyCount * 3 + emailOnlyCount * 2,
    mobile_phone_contacts: mobileCount,
    mobile_phone_credits: mobileCount * 4,
    direct_phone_contacts: directOnlyCount,
    direct_phone_credits: directOnlyCount * 3,
    email_only_contacts: emailOnlyCount,
    email_only_credits: emailOnlyCount * 2,
    enriched_contacts_count: contacts.length,
  };
}

/**
 * Ensure a searches record exists for this conversation.
 * Returns the search_id (creates one if needed, reuses if already linked).
 */
async function ensureSearchRecord(
  userId: string,
  conversationId: string,
  conversationTitle: string,
  existingSearchId: string | null
): Promise<string> {
  if (existingSearchId) return existingSearchId;

  const { data: search, error } = await supabase
    .from("searches")
    .insert({
      user_id: userId,
      search_type: "ai_chat",
      company_name: conversationTitle,
      status: "completed",
    })
    .select("id")
    .single();

  if (error || !search) {
    throw new Error(`Failed to create search record: ${error?.message}`);
  }

  // Link back to conversation
  await supabase
    .from("ai_chat_conversations")
    .update({ synced_search_id: search.id })
    .eq("id", conversationId);

  return search.id;
}

/**
 * Save enriched contacts from a single chat response.
 * Called automatically when enrichment data arrives.
 *
 * 1. Ensures a searches record exists for the conversation
 * 2. Calls save-chat-contacts edge function (master_contacts + credits)
 * 3. Appends to search_results table (for Results page)
 */
export async function saveChatContacts(
  userId: string,
  conversationId: string,
  conversationTitle: string,
  existingSearchId: string | null,
  contacts: ContactData[],
  credits: Credits | null
): Promise<SaveResult> {
  // Filter: only contacts with phone numbers and not preview
  const enrichedWithPhone = contacts.filter(
    (c) =>
      !c.previewOnly &&
      (c.mobilePhone || c.directPhone || (c.phone && c.phone !== "Locked"))
  );

  if (enrichedWithPhone.length === 0) {
    throw new Error("No enriched contacts with phone numbers to save");
  }

  // 1. Ensure search record
  const searchId = await ensureSearchRecord(
    userId,
    conversationId,
    conversationTitle,
    existingSearchId
  );

  // 2. Call edge function for master_contacts + credits + workspace deduction
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-chat-contacts`;

  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      search_id: searchId,
      contacts: enrichedWithPhone.map(formatContact),
      credits: buildCreditPayload(credits, enrichedWithPhone),
    }),
  });

  if (!edgeRes.ok) {
    const errText = await edgeRes.text().catch(() => "");
    console.error("[saveChatContacts] edge function error:", edgeRes.status, errText);
    throw new Error("Failed to save contacts to master database");
  }

  const edgeResult = await edgeRes.json();

  // 3. Append to search_results (group contacts by company domain)
  const byCompany = new Map<string, ContactData[]>();
  for (const c of enrichedWithPhone) {
    const key = (c.companyDomain || c.companyName || "other").toLowerCase();
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(c);
  }

  const rows = Array.from(byCompany.entries()).map(([, groupContacts]) => ({
    search_id: searchId,
    company_name: groupContacts[0].companyName || groupContacts[0].companyDomain || "Unknown",
    domain: groupContacts[0].companyDomain || null,
    contact_data: groupContacts.map(formatForSearchResults),
    result_type: "enriched",
  }));

  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from("search_results")
      .insert(rows);
    if (insertErr) {
      console.error("[saveChatContacts] search_results insert failed:", insertErr);
    }
  }

  return {
    searchId,
    savedCount: edgeResult.saved_count ?? 0,
    cachedCount: edgeResult.cached_count ?? 0,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-chat/saveChatContacts.ts
git commit -m "feat: add saveChatContacts helper for auto-saving enriched contacts from chat"
```

---

### Task 5: Wire Auto-Save into ChatInterface

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`

This task connects everything: when enriched contacts arrive, auto-trigger the save, and remove the old bare `credit_usage` insert.

- [ ] **Step 1: Add import for saveChatContacts**

At the top of `ChatInterface.tsx`, after the existing `syncToResults` import (line 19), add:

```typescript
import { saveChatContacts } from "../ai-chat/saveChatContacts";
```

- [ ] **Step 2: Remove the bare credit_usage insert block**

Remove lines 374-397 (the `// Track credits in analytics (fire-and-forget)` block):

```typescript
        // Track credits in analytics (fire-and-forget — don't block chat)
        if (hasRealCredits) {
          supabase
            .from("credit_usage")
            .insert({
              user_id: userId,
              cognism_credits: parsed.credits!.cognism ?? 0,
              apollo_credits: parsed.credits!.apollo ?? 0,
              aleads_credits: parsed.credits!.aleads ?? 0,
              lusha_credits: parsed.credits!.lusha ?? 0,
              theirstack_credits: parsed.credits!.theirstack ?? 0,
              grand_total_credits: parsed.credits!.total ?? 0,
              mobile_phone_contacts: parsed.credits!.contacts_with_mobile_phone ?? 0,
              mobile_phone_credits: parsed.credits!.mobile_phone_credits ?? 0,
              direct_phone_contacts: parsed.credits!.contacts_with_direct_phone_only ?? 0,
              direct_phone_credits: parsed.credits!.direct_phone_credits ?? 0,
              email_only_contacts: parsed.credits!.email_linkedin_only_contacts ?? 0,
              email_only_credits: parsed.credits!.email_only_credits ?? 0,
              enriched_contacts_count: (parsed.credits!.contacts_with_mobile_phone ?? 0) + (parsed.credits!.contacts_with_direct_phone_only ?? 0) + (parsed.credits!.email_linkedin_only_contacts ?? 0),
            })
            .then(({ error }) => {
              if (error) console.error("[ChatInterface] credit_usage insert failed:", error);
            });
        }
```

- [ ] **Step 3: Add auto-save logic after message is saved to DB**

After the assistant message is saved to the database and added to state (after line 440 in the original, which is the `setMessages` call for the assistant reply), add the auto-save block. Place it right before `setConversations((prev) => {` (original line 442):

```typescript
        // Auto-save enriched contacts to master DB + search_results (fire-and-forget)
        const enrichedContacts = replyMetadata?.data?.contacts?.filter(
          (c) => !c.previewOnly && (c.mobilePhone || c.directPhone || (c.phone && c.phone !== "Locked"))
        );
        if (enrichedContacts && enrichedContacts.length > 0) {
          const conv = conversations.find((c) => c.id === activeId);
          saveChatContacts(
            userId,
            activeId,
            conv?.title || "Chat",
            conv?.synced_search_id ?? null,
            enrichedContacts,
            replyMetadata?.credits ?? null
          )
            .then((result) => {
              console.log(`[ChatInterface] Auto-saved ${result.savedCount} contacts (${result.cachedCount} cached) to master DB`);
              // Update synced_search_id on conversation if newly created
              if (!conv?.synced_search_id && result.searchId) {
                supabase
                  .from("ai_chat_conversations")
                  .select("id, title, session_id, updated_at, chat_type, synced_search_id")
                  .eq("id", activeId)
                  .single()
                  .then(({ data: updated }) => {
                    if (updated) {
                      setConversations((prev) =>
                        prev.map((c) => (c.id === activeId ? (updated as ConversationMeta) : c))
                      );
                    }
                  });
              }
            })
            .catch((err) => {
              console.error("[ChatInterface] Auto-save failed:", err);
            });
        }
```

- [ ] **Step 4: Verify the dev server compiles without errors**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run dev
```

Check terminal output for TypeScript compilation errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "feat: auto-save enriched chat contacts to master DB, replace bare credit_usage insert"
```

---

### Task 6: Deploy and End-to-End Test

- [ ] **Step 1: Deploy the edge function**

```bash
SUPABASE_ACCESS_TOKEN=sbp_29df1ea5254707857dbea5c5b3f444aa1bd8a084 /c/Users/prana/scoop/shims/supabase.exe functions deploy save-chat-contacts --no-verify-jwt --project-ref ggvhwxpaovfvoyvzixqw
```

- [ ] **Step 2: Test the full flow**

1. Open the recruiting chat at `http://localhost:8080`
2. Search for candidates (e.g., "Find backend engineers in Stuttgart")
3. Select candidates and click "Enrich Selected"
4. After enrichment results appear, check browser console for:
   - `[ChatInterface] Auto-saved X contacts (Y cached) to master DB`
5. Verify in Supabase:
   - `master_contacts` table has the enriched contacts
   - `user_enriched_contacts` has junction rows linking user → contacts
   - `credit_usage` has a row with the correct `search_id`
   - `workspace_credit_transactions` has a deduction entry
   - `search_results` has rows with the enriched contact data

- [ ] **Step 3: Test dedup safety**

1. In the same conversation, request enrichment of the same contacts again
2. Verify:
   - `master_contacts` is updated (not duplicated)
   - `user_enriched_contacts` shows `cachedCount > 0` in console
   - Workspace credits are NOT double-deducted (delta = 0)

- [ ] **Step 4: Final commit with all files**

```bash
git add -A
git commit -m "feat: complete save-chat-contacts — auto-save recruiting enrichment to master DB with credit tracking"
```
