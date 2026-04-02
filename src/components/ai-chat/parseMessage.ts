import type { StructuredData, Credits } from "./types";

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
      (Array.isArray(d.contacts) && d.contacts.length > 0)
    ) {
      structuredData = d as unknown as StructuredData;
    }
  }

  // c) Fall back to `output` JSON markers ONLY when there is no separate `text` field
  //    (if `text` exists but lacks markers, `output` is cumulative — skip it)
  if (!structuredData && !hasTextField) {
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
          structuredData = JSON.parse(lastMatch[1]) as StructuredData;
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
  const credits = (item?.credits as Credits) ?? null;

  return { cleanText, structuredData, credits, chatName };
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
  // Patterns: "\n\n1. ", "\nCompanies\n", "Contact previews\n"
  const structuredStartIdx = text.search(
    /\n(?:\d+\.\s|Companies\s*\n|Contact previews\s*\n)/
  );

  const intro =
    structuredStartIdx >= 0
      ? text.slice(0, structuredStartIdx).trim()
      : text.trim();

  // Find outro — the last paragraph(s) after structured content
  // that starts with a conversational pattern
  const outroMatch = text.match(
    /\n\n((?:If you|Pick |Would you|Say |I also|Do you|Let me know|I couldn't|No |Unfortunately|I checked|Note:)[\s\S]*?)$/i
  );
  const outro = outroMatch ? outroMatch[1].trim() : "";

  return { intro, outro };
}
