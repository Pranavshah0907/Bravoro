import { supabase } from "@/integrations/supabase/client";
import type { ContactData, Credits } from "./types";

interface SaveResult {
  searchId: string;
  savedCount: number;
  cachedCount: number;
}

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


function buildCreditPayload(credits: Credits | null, contacts: ContactData[]) {
  const mobileCount = credits?.contacts_with_mobile_phone ?? 0;
  const directCount = credits?.contacts_with_direct_phone_only ?? 0;
  const emailCount = credits?.email_linkedin_only_contacts ?? 0;
  const jobsCredits = credits?.theirstack_total_credits ?? 0;
  const grandTotal = mobileCount * 4 + directCount * 3 + emailCount * 2 + jobsCredits;

  if (credits) {
    return {
      cognism_credits: credits.cognism ?? 0,
      apollo_credits: credits.apollo ?? 0,
      aleads_credits: credits.aleads ?? 0,
      lusha_credits: credits.lusha ?? 0,
      grand_total_credits: grandTotal,
      mobile_phone_contacts: mobileCount,
      mobile_phone_credits: mobileCount * 4,
      direct_phone_contacts: directCount,
      direct_phone_credits: directCount * 3,
      email_only_contacts: emailCount,
      email_only_credits: emailCount * 2,
      jobs_count: jobsCredits,
      jobs_credits: jobsCredits,
      enriched_contacts_count: mobileCount + directCount + emailCount,
    };
  }
  // Fallback: compute from contacts if no Credits object
  let mc = 0;
  let dc = 0;
  let ec = 0;
  for (const c of contacts) {
    if (c.mobilePhone) mc++;
    else if (c.directPhone) dc++;
    else ec++;
  }
  return {
    cognism_credits: 0,
    apollo_credits: 0,
    aleads_credits: 0,
    lusha_credits: 0,
    grand_total_credits: mc * 4 + dc * 3 + ec * 2,
    mobile_phone_contacts: mc,
    mobile_phone_credits: mc * 4,
    direct_phone_contacts: dc,
    direct_phone_credits: dc * 3,
    email_only_contacts: ec,
    email_only_credits: ec * 2,
    jobs_count: 0,
    jobs_credits: 0,
    enriched_contacts_count: contacts.length,
  };
}

async function ensureSearchRecord(
  userId: string,
  conversationId: string,
  conversationTitle: string,
  existingSearchId: string | null,
  chatType: string
): Promise<string> {
  if (existingSearchId) return existingSearchId;

  const { data: search, error } = await supabase
    .from("searches")
    .insert({
      user_id: userId,
      search_type: "ai_chat",
      company_name: conversationTitle,
      domain: chatType,
      status: "completed",
    })
    .select("id")
    .single();

  if (error || !search) {
    throw new Error(`Failed to create search record: ${error?.message}`);
  }

  await supabase
    .from("ai_chat_conversations")
    .update({ synced_search_id: search.id })
    .eq("id", conversationId);

  return search.id;
}

/**
 * Save enriched contacts from a chat response to master DB + search_results.
 * Called automatically when enrichment data arrives with phone numbers.
 *
 * 1. Ensures a searches record exists for the conversation
 * 2. Calls save-chat-contacts edge function (master_contacts + credits + workspace deduction)
 * 3. Appends to search_results table (for Results page)
 */
export async function saveChatContacts(
  userId: string,
  conversationId: string,
  conversationTitle: string,
  existingSearchId: string | null,
  contacts: ContactData[],
  credits: Credits | null,
  searchType: string = "ai_chat"
): Promise<SaveResult> {
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
    existingSearchId,
    searchType
  );
  // searchType is stored in the `domain` column to differentiate AI Chat vs Recruiting

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

  return {
    searchId,
    savedCount: edgeResult.saved_count ?? 0,
    cachedCount: edgeResult.cached_count ?? 0,
  };
}

/**
 * Save credits to credit_usage when there are no enriched contacts
 * (e.g. jobs-only responses with theirstack_total_credits).
 */
export async function saveChatCreditsOnly(
  userId: string,
  _conversationId: string,
  _conversationTitle: string,
  existingSearchId: string | null,
  credits: Credits,
  _chatType: string = "ai_chat"
): Promise<void> {
  if (!existingSearchId) return;

  const searchId = existingSearchId;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return;

  const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-chat-contacts`;

  await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      search_id: searchId,
      contacts: [],
      credits: buildCreditPayload(credits, []),
    }),
  });
}
