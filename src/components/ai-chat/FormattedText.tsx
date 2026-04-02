import { Fragment, type ReactNode } from "react";

/**
 * Smart text formatter for AI assistant messages.
 * Detects patterns in plain-text n8n responses and renders them with
 * appropriate formatting — bold labels, separators, styled bullets, etc.
 *
 * Handles:
 *  - Section headers ("Companies:", "Contact previews", "Free contact previews found:")
 *  - Numbered items ("1. Company Name") — bold name, separator above
 *  - Field labels ("Domain:", "City:", "Industry:", "Employees:", "Country:")
 *  - Sub-sections ("Jobs:")
 *  - Bullet items ("- some text")
 *  - Regular conversational paragraphs
 *  - Inline URLs → clickable links
 */

/* ── Inline URL linkifier ─────────────────────────────────────── */
const URL_RE = /(https?:\/\/[^\s),]+)/g;
const URL_TEST = /^https?:\/\//;

function linkify(text: string): ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        URL_TEST.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 break-all"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

type LineType =
  | { kind: "section-header"; text: string }
  | { kind: "numbered-item"; number: string; name: string }
  | { kind: "field"; label: string; value: string }
  | { kind: "sub-header"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" };

const FIELD_LABELS = new Set([
  "domain",
  "city",
  "country",
  "industry",
  "employees",
  "website",
  "linkedin",
  "linkedinurl",
]);

const SECTION_PATTERNS = [
  /^companies:?\s*$/i,
  /^contact previews?\s*$/i,
  /^free contact previews? found:?\s*$/i,
  /^open positions:?\s*$/i,
  /^results:?\s*$/i,
];

const SUB_HEADER_PATTERNS = [/^jobs:?\s*$/i];

function classifyLine(line: string): LineType {
  const trimmed = line.trim();

  if (trimmed === "") return { kind: "blank" };

  // Section headers
  for (const p of SECTION_PATTERNS) {
    if (p.test(trimmed)) return { kind: "section-header", text: trimmed };
  }

  // Sub-headers
  for (const p of SUB_HEADER_PATTERNS) {
    if (p.test(trimmed)) return { kind: "sub-header", text: trimmed };
  }

  // Numbered items: "1. Company Name" or "2. Some Name Here"
  const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numberedMatch) {
    return { kind: "numbered-item", number: numberedMatch[1], name: numberedMatch[2] };
  }

  // Field labels: "   Domain: example.com"
  const fieldMatch = trimmed.match(/^(\w[\w\s]*?):\s+(.+)$/);
  if (fieldMatch && FIELD_LABELS.has(fieldMatch[1].toLowerCase().replace(/\s+/g, ""))) {
    return { kind: "field", label: fieldMatch[1], value: fieldMatch[2] };
  }

  // Bullet items: "- Some text" or "  - Some text"
  if (/^\s*-\s+/.test(line)) {
    const bulletText = trimmed.replace(/^-\s+/, "");
    return { kind: "bullet", text: bulletText };
  }

  return { kind: "text", text: trimmed };
}

export function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const classified = lines.map(classifyLine);

  // Check if this text has any structured patterns (numbered items, fields, bullets under companies)
  const hasStructuredContent = classified.some(
    (l) =>
      l.kind === "numbered-item" ||
      l.kind === "section-header" ||
      l.kind === "field"
  );

  // If no structured patterns detected, just render as plain text
  if (!hasStructuredContent) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  // Track context for grouping
  let insideNumberedBlock = false;

  return (
    <div className="space-y-0.5">
      {classified.map((line, i) => {
        switch (line.kind) {
          case "blank":
            // Collapse multiple blanks; use small spacer
            return <div key={i} className="h-1.5" />;

          case "section-header":
            insideNumberedBlock = false;
            return (
              <div key={i} className="pt-2 first:pt-0">
                <div className="text-xs uppercase tracking-wider text-emerald-400/70 font-semibold pb-1 border-b border-border/30 mb-1">
                  {line.text.replace(/:$/, "")}
                </div>
              </div>
            );

          case "numbered-item": {
            insideNumberedBlock = true;
            const showSeparator = i > 0 && classified[i - 1]?.kind !== "section-header" && classified[i - 1]?.kind !== "blank";
            return (
              <Fragment key={i}>
                {showSeparator && (
                  <div className="border-t border-border/20 my-1.5" />
                )}
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-xs font-medium text-emerald-400/60 shrink-0 w-4 text-right">
                    {line.number}.
                  </span>
                  <span className="font-semibold text-sm text-foreground">
                    {linkify(line.name)}
                  </span>
                </div>
              </Fragment>
            );
          }

          case "field":
            return (
              <div key={i} className="flex items-baseline gap-1 pl-6 text-sm">
                <span className="text-muted-foreground/70 font-medium">
                  {line.label}:
                </span>
                <span className="text-foreground/80">{linkify(line.value)}</span>
              </div>
            );

          case "sub-header":
            return (
              <div
                key={i}
                className="pl-6 pt-0.5 text-xs text-muted-foreground/60 font-medium"
              >
                {line.text}
              </div>
            );

          case "bullet": {
            // Detect if this is a contact preview (Name, Title, Company pattern)
            const contactMatch = line.text.match(/^(.+?),\s+(.+?),\s+(.+)$/);
            if (contactMatch) {
              return (
                <div key={i} className="flex items-baseline gap-2 pl-6 py-0.5 text-sm">
                  <span className="text-muted-foreground/50 shrink-0">-</span>
                  <span>
                    <span className="font-medium text-foreground">
                      {linkify(contactMatch[1])}
                    </span>
                    <span className="text-muted-foreground/70">
                      , {linkify(contactMatch[2])},{" "}
                    </span>
                    <span className="text-foreground/70">{linkify(contactMatch[3])}</span>
                  </span>
                </div>
              );
            }

            return (
              <div key={i} className="flex items-baseline gap-2 pl-6 py-0.5 text-sm">
                <span className="text-muted-foreground/50 shrink-0">-</span>
                <span className="text-foreground/80">{linkify(line.text)}</span>
              </div>
            );
          }

          case "text":
            return (
              <p
                key={i}
                className={`text-sm leading-relaxed ${
                  insideNumberedBlock ? "pl-6" : ""
                }`}
              >
                {linkify(line.text)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
