import type { StructuredData, Credits } from "./types";

/** Map recruiting agent's "candidates" key → standard "contacts" key */
function normalizeCandidates(data: StructuredData | null): void {
  if (!data) return;
  const raw = data as Record<string, unknown>;
  if (Array.isArray(raw.candidates) && raw.candidates.length > 0) {
    if (!Array.isArray(data.contacts) || data.contacts.length === 0) {
      data.contacts = raw.candidates as StructuredData["contacts"];
    }
    delete raw.candidates;
  }
}

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

/**
 * Parse the n8n response item to extract clean text, structured data, credits, and chatName.
 *
 * The `output`/`text` field may contain `<!--JSONSTART-->...<!--JSONEND-->` blocks
 * with the full cumulative structured data. The `data` field from n8n is often
 * only the delta for that step, so we prefer the embedded JSON.
 */
export function parseN8nResponse(item: Record<string, unknown>): {
  cleanText: string;
  structuredData: StructuredData | null;
  credits: Credits | null;
  chatName: string | null;
  apiCost: number | null;
} {
  // 1. Get the text to display (prefer `text`, fall back to `output`)
  const hasTextField = typeof item?.text === "string" && item.text.trim() !== "";
  const rawText = String(
    item?.text ?? item?.response ?? item?.action?.message ?? item?.message ?? item?.output ?? ""
  );

  // 2. Extract structured data with correct priority:
  //    a) JSON markers in rawText (always authoritative)
  //    b) `data` field (per-step delta — preferred when `text` has no markers)
  //    c) JSON markers in `output` ONLY if `text` field doesn't exist
  //       (`output` is cumulative and would duplicate prior messages)
  let structuredData: StructuredData | null = null;
  const jsonBlockRegex = /<!--JSONSTART-->\s*([\s\S]*?)\s*<!--JSONEND-->/g;

  // a) Check rawText for JSON markers
  {
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = jsonBlockRegex.exec(rawText)) !== null) {
      lastMatch = match;
    }
    if (lastMatch) {
      try {
        structuredData = JSON.parse(lastMatch[1]) as StructuredData;
        normalizeCandidates(structuredData);
        normalizeEnrichedContacts(structuredData);
      } catch {
        // Malformed JSON — ignore
      }
    }
  }

  // b) Try the `data` field (per-step delta, not cumulative)
  if (!structuredData && item?.data && typeof item.data === "object") {
    const d = item.data as Record<string, unknown>;
    if (
      (Array.isArray(d.companies) && d.companies.length > 0) ||
      (Array.isArray(d.contacts) && d.contacts.length > 0) ||
      (Array.isArray(d.candidates) && d.candidates.length > 0)
    ) {
      structuredData = d as unknown as StructuredData;
      normalizeCandidates(structuredData);
      normalizeEnrichedContacts(structuredData);
    }
  }

  // c) Fall back to `output` JSON markers as last resort
  //    Only reached when rawText had no markers AND `data` field was empty/missing.
  //    IMPORTANT: `output` is cumulative (contains ALL structured data from the
  //    entire conversation). Only use it if the extracted data actually has non-empty
  //    arrays — otherwise we'd re-show companies/contacts from earlier messages.
  if (!structuredData) {
    const rawOutput = typeof item?.output === "string" ? item.output : "";
    if (rawOutput) {
      jsonBlockRegex.lastIndex = 0;
      let lastMatch: RegExpExecArray | null = null;
      let match: RegExpExecArray | null;
      while ((match = jsonBlockRegex.exec(rawOutput)) !== null) {
        lastMatch = match;
      }
      if (lastMatch) {
        try {
          const parsed = JSON.parse(lastMatch[1]) as StructuredData;
          normalizeCandidates(parsed);
          normalizeEnrichedContacts(parsed);
          // Guard: only use if it has non-empty companies or contacts
          if (
            (Array.isArray(parsed.companies) && parsed.companies.length > 0) ||
            (Array.isArray(parsed.contacts) && parsed.contacts.length > 0)
          ) {
            structuredData = parsed;
          }
        } catch {
          // Malformed JSON — ignore
        }
      }
    }
  }

  // 3. Strip ALL <!--JSONSTART-->...<!--JSONEND--> blocks from text
  let cleanText = rawText.replace(/<!--JSONSTART-->[\s\S]*?<!--JSONEND-->/g, "").trim();

  // 4. Handle chatname: prefix
  let chatName: string | null = (item?.chatName as string) ?? null;
  if (!chatName && cleanText.toLowerCase().startsWith("chatname:")) {
    const lines = cleanText.split("\n");
    chatName = lines[0].replace(/^chatname:\s*/i, "").trim() || null;
    cleanText = lines.slice(1).join("\n").trimStart();
  }

  // 5. Credits
  let credits = (item?.credits as Credits) ?? null;

  // 5b. Derive contact-type credits from enriched contacts if not already present
  const enrichedContacts = structuredData?.contacts?.filter((c) => !c.previewOnly) ?? [];
  if (enrichedContacts.length > 0 && (credits == null || credits.mobile_phone_credits == null)) {
    if (!credits) credits = { theirstack: 0, cognism: 0, apollo: 0, lusha: 0, aleads: 0, total: 0 };
    let mobileCount = 0;
    let directCount = 0;
    let emailOnlyCount = 0;
    for (const c of enrichedContacts) {
      if (c.mobilePhone || (c.phone && c.phone !== "Locked" && c.phone.length > 6)) {
        mobileCount++;
      } else if (c.directPhone) {
        directCount++;
      } else if (c.email || c.linkedinUrl) {
        emailOnlyCount++;
      }
    }
    if (mobileCount > 0 || directCount > 0 || emailOnlyCount > 0) {
      credits.contacts_with_mobile_phone = mobileCount;
      credits.mobile_phone_credits = mobileCount * 4;
      credits.contacts_with_direct_phone_only = directCount;
      credits.direct_phone_credits = directCount * 3;
      credits.email_linkedin_only_contacts = emailOnlyCount;
      credits.email_only_credits = emailOnlyCount * 2;
    }
  }

  // 6. API cost (estimated by n8n Parse Response node)
  const apiCost = typeof item?.apiCost === "number" && item.apiCost > 0 ? item.apiCost : null;

  return { cleanText, structuredData, credits, chatName, apiCost };
}

/**
 * Split clean text into conversational intro/outro parts,
 * stripping the structured listing that the rich cards will replace.
 */
export function extractConversationalParts(
  text: string,
  hasStructuredData: boolean
): { intro: string; outro: string } {
  if (!hasStructuredData) {
    return { intro: text, outro: "" };
  }

  // Find where structured listing begins
  // Patterns: "1. ", "- Name", "Companies\n", "Contact previews\n",
  //           "---" (separator), "### " (markdown heading — recruiting format),
  //           "**1." / "**N." (bold numbered — recruiting format)
  const structuredStartIdx = text.search(
    /(?:^|\n)(?:\d+\.\s|- \S|Companies\s*\n|Contact previews\s*\n|---\s*\n|#{1,3}\s+\*{0,2}\d+|^\*{2}\d+\.)/m
  );

  const intro =
    structuredStartIdx >= 0
      ? text.slice(0, structuredStartIdx).trim()
      : text.trim();

  // Find outro — text after the LAST structured block.
  // Strategy: find the last separator/heading/bullet block, then look for
  // prose text (not a heading, bullet, or separator) after it.
  let outro = "";

  // Look for the last "---" separator followed by non-structured text
  const lastSepIdx = text.lastIndexOf("\n---");
  if (lastSepIdx >= 0) {
    // Get text after that last separator
    const afterSep = text.slice(lastSepIdx).replace(/^[\s-]+/, "").trim();
    // Check if this text is prose (not another heading/bullet/numbered item)
    if (afterSep && !/^(?:#{1,3}\s|\d+\.\s|- |\*{2}\d+\.)/.test(afterSep)) {
      outro = afterSep;
    }
  }

  // Fallback: try the old approach for AI Staffing format
  if (!outro) {
    const outroRegex = /(?:^|\n)(?:- .+|\d+\..+)\n\n((?!- |\d+\.)[^\n].*)$/gm;
    let outroMatch: RegExpExecArray | null;
    while ((outroMatch = outroRegex.exec(text)) !== null) {
      outro = outroMatch[1].trim();
    }
    if (outro) {
      const outroIdx = text.lastIndexOf(outro);
      if (outroIdx >= 0) {
        outro = text.slice(outroIdx).trim();
      }
    }
  }

  return { intro, outro };
}
