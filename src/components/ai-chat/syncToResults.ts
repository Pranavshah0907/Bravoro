import { supabase } from "@/integrations/supabase/client";
import type { CompanyData, ContactData, MessageMetadata } from "./types";

/**
 * Sync AI chat data (companies, jobs, enriched contacts) to the
 * searches + search_results tables so they appear on the Results page.
 */

interface ChatMessage {
  role: "user" | "assistant";
  metadata?: MessageMetadata | null;
}

/* ── Gather data from all messages in the conversation ─────────── */

interface GatheredCompany {
  company: CompanyData;
  jobs: Array<{ title: string; url: string; postedAt: string }>;
}

function gatherChatData(messages: ChatMessage[]) {
  // Companies keyed by domain (fallback: name)
  const companiesMap = new Map<string, GatheredCompany>();
  // Enriched contacts grouped by company key
  const contactsByCompany = new Map<string, ContactData[]>();

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const data = (msg.metadata as MessageMetadata | null)?.data;
    if (!data) continue;

    // Collect companies with jobs
    if (data.companies?.length) {
      for (const company of data.companies) {
        const key = (company.domain || company.name || "").toLowerCase();
        if (!key) continue;
        const existing = companiesMap.get(key);
        if (!existing) {
          companiesMap.set(key, {
            company,
            jobs: (company.jobs || []).map((j) => ({
              title: j.title,
              url: j.url,
              postedAt: j.postedAt,
            })),
          });
        } else {
          // Merge new jobs (dedupe by URL)
          const existingUrls = new Set(existing.jobs.map((j) => j.url));
          for (const job of company.jobs || []) {
            if (job.url && !existingUrls.has(job.url)) {
              existing.jobs.push({ title: job.title, url: job.url, postedAt: job.postedAt });
            }
          }
        }
      }
    }

    // Collect enriched contacts only (skip previews)
    if (data.contacts?.length) {
      for (const contact of data.contacts) {
        if (contact.previewOnly) continue;
        const key = (contact.companyDomain || contact.companyName || "other").toLowerCase();
        if (!contactsByCompany.has(key)) contactsByCompany.set(key, []);
        contactsByCompany.get(key)!.push(contact);
      }
    }
  }

  return { companiesMap, contactsByCompany };
}

/* ── Map AI chat contact → search_results contact_data format ──── */

function mapContact(
  contact: ContactData,
  jobs: Array<{ title: string; url: string; postedAt: string }>
): Record<string, unknown> {
  const nameParts = (contact.fullName || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const base: Record<string, unknown> = {
    First_Name: firstName,
    Last_Name: lastName,
    Email: contact.email || "",
    LinkedIn: contact.linkedinUrl || "",
    Phone_Number_1: contact.phone && contact.phone !== "Locked" ? contact.phone : "",
    Phone_Number_2: "",
    Organization: contact.companyName || "",
    Domain: contact.companyDomain || "",
    Title: contact.jobTitle || "",
    Provider: contact.source || "",
  };

  // Attach jobs to every contact (matches n8n pattern — UI deduplicates)
  if (jobs.length > 0) {
    base.job_search_result = {
      job_search_status: "jobs_found",
      results: jobs.map((j) => ({
        job_title: j.title || "",
        job_link: j.url || "",
        last_posted_date: j.postedAt || "",
        company: contact.companyName || "",
        company_domain: contact.companyDomain || "",
        location: "",
      })),
    };
  }

  return base;
}

/* ── Build search_results rows ─────────────────────────────────── */

function buildResultRows(
  searchId: string,
  companiesMap: Map<string, GatheredCompany>,
  contactsByCompany: Map<string, ContactData[]>
) {
  const rows: Array<{
    search_id: string;
    company_name: string;
    domain: string | null;
    contact_data: Record<string, unknown>[];
    result_type: string;
  }> = [];

  // Only include companies that have enriched contacts
  for (const [companyKey, contacts] of contactsByCompany) {
    const companyInfo = companiesMap.get(companyKey);
    const jobs = companyInfo?.jobs || [];
    const companyName = contacts[0].companyName || companyInfo?.company.name || companyKey;
    const domain = contacts[0].companyDomain || companyInfo?.company.domain || null;

    rows.push({
      search_id: searchId,
      company_name: companyName,
      domain,
      contact_data: contacts.map((c) => mapContact(c, jobs)),
      result_type: "enriched",
    });
  }

  return rows;
}

/* ── Main sync function ────────────────────────────────────────── */

export async function syncChatToResults(
  userId: string,
  conversationId: string,
  conversationTitle: string,
  messages: ChatMessage[],
  existingSearchId: string | null
): Promise<{ searchId: string; companiesCount: number; contactsCount: number }> {
  const { companiesMap, contactsByCompany } = gatherChatData(messages);

  // Count totals for feedback
  let contactsCount = 0;
  for (const contacts of contactsByCompany.values()) contactsCount += contacts.length;
  const companiesCount = new Set([
    ...companiesMap.keys(),
    ...contactsByCompany.keys(),
  ]).size;

  if (contactsCount === 0 && companiesMap.size === 0) {
    throw new Error("No enriched contacts or companies to sync");
  }

  let searchId = existingSearchId;

  if (searchId) {
    // Re-sync: delete old results, update search timestamp
    const { error: delErr } = await supabase
      .from("search_results")
      .delete()
      .eq("search_id", searchId);
    if (delErr) throw new Error(`Failed to clear old results: ${delErr.message}`);

    await supabase
      .from("searches")
      .update({
        company_name: conversationTitle,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", searchId);
  } else {
    // New sync: create search record
    const { data: search, error: searchErr } = await supabase
      .from("searches")
      .insert({
        user_id: userId,
        search_type: "ai_chat",
        company_name: conversationTitle,
        domain: "ai_staffing",
        status: "completed",
      })
      .select("id")
      .single();

    if (searchErr || !search) {
      throw new Error(`Failed to create search: ${searchErr?.message}`);
    }
    searchId = search.id;

    // Link back to conversation
    await supabase
      .from("ai_chat_conversations")
      .update({ synced_search_id: searchId })
      .eq("id", conversationId);
  }

  // Insert result rows
  const rows = buildResultRows(searchId, companiesMap, contactsByCompany);
  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from("search_results")
      .insert(rows);
    if (insertErr) throw new Error(`Failed to insert results: ${insertErr.message}`);
  }

  return { searchId, companiesCount, contactsCount };
}

/* ── Check if conversation has syncable data ───────────────────── */

export function hasSyncableData(messages: ChatMessage[]): boolean {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const data = (msg.metadata as MessageMetadata | null)?.data;
    if (!data) continue;
    if (data.contacts?.some((c) => !c.previewOnly)) return true;
  }
  return false;
}
