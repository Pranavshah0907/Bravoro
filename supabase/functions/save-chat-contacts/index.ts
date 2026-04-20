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

interface CreditPayload {
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
  jobs_count: number;
  jobs_credits: number;
  enriched_contacts_count: number;
}

interface RequestBody {
  search_id: string;
  contacts: ChatContact[];
  credits: CreditPayload;
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

    if (!search_id || (!contacts?.length && !credits)) {
      return new Response(
        JSON.stringify({ error: "search_id and contacts[] or credits required" }),
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
        .select("id, cognism_credits, apollo_credits, aleads_credits, lusha_credits, grand_total_credits, mobile_phone_contacts, mobile_phone_credits, direct_phone_contacts, direct_phone_credits, email_only_contacts, email_only_credits, jobs_count, jobs_credits, enriched_contacts_count")
        .eq("user_id", userId)
        .eq("search_id", search_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextCognism = Math.max(existingCredit?.cognism_credits ?? 0, credits.cognism_credits ?? 0);
      const nextApollo = Math.max(existingCredit?.apollo_credits ?? 0, credits.apollo_credits ?? 0);
      const nextAleads = Math.max(existingCredit?.aleads_credits ?? 0, credits.aleads_credits ?? 0);
      const nextLusha = Math.max(existingCredit?.lusha_credits ?? 0, credits.lusha_credits ?? 0);
      const nextGrandTotal = Math.max(existingCredit?.grand_total_credits ?? 0, credits.grand_total_credits ?? 0);
      const nextMobileContacts = Math.max(existingCredit?.mobile_phone_contacts ?? 0, credits.mobile_phone_contacts ?? 0);
      const nextMobileCredits = Math.max(existingCredit?.mobile_phone_credits ?? 0, credits.mobile_phone_credits ?? 0);
      const nextDirectContacts = Math.max(existingCredit?.direct_phone_contacts ?? 0, credits.direct_phone_contacts ?? 0);
      const nextDirectCredits = Math.max(existingCredit?.direct_phone_credits ?? 0, credits.direct_phone_credits ?? 0);
      const nextEmailContacts = Math.max(existingCredit?.email_only_contacts ?? 0, credits.email_only_contacts ?? 0);
      const nextEmailCredits = Math.max(existingCredit?.email_only_credits ?? 0, credits.email_only_credits ?? 0);
      const nextJobsCount = Math.max(existingCredit?.jobs_count ?? 0, credits.jobs_count ?? 0);
      const nextJobsCredits = Math.max(existingCredit?.jobs_credits ?? 0, credits.jobs_credits ?? 0);
      const nextEnrichedCount = Math.max(existingCredit?.enriched_contacts_count ?? 0, credits.enriched_contacts_count ?? 0);

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
        jobs_count: nextJobsCount,
        jobs_credits: nextJobsCredits,
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
            p_note: `Chat enrichment ${search_id}: +${creditDelta} credits (M:${nextMobileCredits} D:${nextDirectCredits} E:${nextEmailCredits} J:${nextJobsCredits})`,
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
