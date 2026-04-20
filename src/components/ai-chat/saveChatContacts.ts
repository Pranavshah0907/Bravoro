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
  credits: Credits | null
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
