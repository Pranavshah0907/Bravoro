import { useState } from "react";
import {
  Building2,
  Globe,
  MapPin,
  Users,
  Briefcase,
  ExternalLink,
  Linkedin,
  Lock,
  User,
  Calendar,
  Factory,
  ChevronDown,
  Mail,
  Phone,
} from "lucide-react";
import type {
  CompanyData,
  ContactData,
  StructuredData,
  Credits,
  MessageMetadata,
} from "./types";
import { extractConversationalParts } from "./parseMessage";
import { FormattedText } from "./FormattedText";

/* ──────────────────────────────────────────────────────────────── */
/*  Credits Line (admin-only, outside the bubble)                  */
/* ──────────────────────────────────────────────────────────────── */

const CREDIT_LABELS: Record<string, string> = {
  theirstack: "Theirstack",
  cognism: "Cognism",
  apollo: "Apollo",
  lusha: "Lusha",
  aleads: "A-Leads",
};

export function CreditsLine({ credits }: { credits: Credits }) {
  const entries = Object.entries(CREDIT_LABELS)
    .map(([key, label]) => ({ label, value: credits[key] ?? 0 }))
    .filter((e) => e.value > 0);

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-1 ml-10 text-[10px] text-muted-foreground/50 select-none">
      {entries.map((e, i) => (
        <span key={e.label}>
          {i > 0 && <span className="mx-1">|</span>}
          <span className="font-medium">{e.label}:</span>{" "}
          <span>{e.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  Company Row (used inside the unified CompaniesPanel)            */
/* ──────────────────────────────────────────────────────────────── */

function CompanyRow({ company }: { company: CompanyData }) {
  const [jobsOpen, setJobsOpen] = useState(false);
  const rawUrl = company.website || company.domain;
  const websiteUrl = rawUrl?.startsWith("http")
    ? rawUrl
    : rawUrl ? `https://${rawUrl}` : "";

  return (
    <div>
      {/* Company header */}
      <div className="px-3.5 py-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span className="font-semibold text-[13px] text-foreground truncate">
              {company.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
            {company.domain && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 hover:text-emerald-400 transition-colors"
              >
                <Globe className="h-2.5 w-2.5" />
                {company.domain}
              </a>
            )}
            {(company.city || company.country) && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {[company.city, company.country].filter(Boolean).join(", ")}
              </span>
            )}
            {company.industry && (
              <span className="flex items-center gap-0.5">
                <Factory className="h-2.5 w-2.5" />
                {company.industry}
              </span>
            )}
            {company.employees && (
              <span className="flex items-center gap-0.5">
                <Users className="h-2.5 w-2.5" />
                {company.employees}
              </span>
            )}
          </div>
        </div>
        {company.linkedinUrl && (
          <a
            href={company.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors"
            title="View on LinkedIn"
          >
            <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
          </a>
        )}
      </div>

      {/* Jobs dropdown — collapsed by default */}
      {company.jobs?.length > 0 && (
        <div className="px-3.5 pb-2">
          <button
            type="button"
            onClick={() => setJobsOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors font-medium"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${
                jobsOpen ? "rotate-0" : "-rotate-90"
              }`}
            />
            <Briefcase className="h-3 w-3" />
            <span>
              {company.jobs.length} Open Position{company.jobs.length > 1 ? "s" : ""}
            </span>
          </button>
          {jobsOpen && (
            <div className="mt-1.5 ml-1 space-y-1 animate-fade-in">
              {company.jobs.map((job, i) => (
                <a
                  key={i}
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 group py-0.5"
                >
                  <Briefcase className="h-3 w-3 text-muted-foreground/60 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-foreground/80 group-hover:text-emerald-400 transition-colors flex-1 leading-snug">
                    {job.title}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 shrink-0">
                    {job.postedAt && (
                      <>
                        <Calendar className="h-2.5 w-2.5" />
                        {job.postedAt}
                      </>
                    )}
                    <ExternalLink className="h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  Companies Panel — single tile, companies separated by lines     */
/* ──────────────────────────────────────────────────────────────── */

function CompaniesPanel({ companies }: { companies: CompanyData[] }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden divide-y divide-border/30">
      {companies.map((company, i) => (
        <CompanyRow key={`${company.domain || company.name}-${i}`} company={company} />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  Contact Card (grouped by company)                               */
/* ──────────────────────────────────────────────────────────────── */

function ContactGroup({
  companyName,
  contacts,
  selectedKeys,
  onToggle,
}: {
  companyName: string;
  contacts: ContactData[];
  selectedKeys?: Set<string>;
  onToggle?: (contact: ContactData, key: string) => void;
}) {
  const allKeys = contacts.map((c) => contactKey(c));
  const allSelected = selectedKeys ? allKeys.every((k) => selectedKeys.has(k)) : false;

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden">
      <div className="px-3.5 py-2 border-b border-border/30 flex items-center gap-2">
        {onToggle && (
          <button
            type="button"
            onClick={() => {
              contacts.forEach((c) => {
                const k = contactKey(c);
                if (allSelected || !selectedKeys?.has(k)) onToggle(c, k);
              });
            }}
            className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              allSelected
                ? "bg-emerald-500 border-emerald-500"
                : "border-border/60 hover:border-emerald-400/60"
            }`}
            title={allSelected ? "Deselect all" : "Select all"}
          >
            {allSelected && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
        <Building2 className="h-3 w-3 text-emerald-400" />
        <span className="text-[12px] font-semibold text-foreground/80">
          {companyName}
        </span>
      </div>
      <div className="divide-y divide-border/20">
        {contacts.map((contact, i) => {
          const key = allKeys[i];
          const checked = selectedKeys?.has(key) ?? false;
          return (
            <div
              key={i}
              className={`px-3.5 py-2 flex items-center gap-2.5 transition-colors ${
                onToggle ? "cursor-pointer hover:bg-muted/30" : ""
              } ${checked ? "bg-emerald-500/5" : ""}`}
              onClick={() => onToggle?.(contact, key)}
            >
              {onToggle && (
                <button
                  type="button"
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    checked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-border/60 hover:border-emerald-400/60"
                  }`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(contact, key);
                  }}
                >
                  {checked && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )}
              <div className="shrink-0 w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center">
                <User className="h-3 w-3 text-muted-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-foreground truncate">
                    {contact.fullName}
                  </span>
                  {contact.previewOnly && (
                    <Lock className="h-2.5 w-2.5 text-amber-500/70 shrink-0" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground/60 truncate">
                  {contact.jobTitle}
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground/50 font-medium shrink-0">
                {contact.source}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  Enriched Contact Card — full details for unlocked contacts      */
/* ──────────────────────────────────────────────────────────────── */

function EnrichedContactCard({ contact }: { contact: ContactData }) {
  return (
    <div className="px-3.5 py-3">
      {/* Name + title row */}
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
          <User className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-foreground">
            {contact.fullName}
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            {contact.jobTitle}
            {contact.companyName && (
              <span className="text-muted-foreground/50"> · {contact.companyName}</span>
            )}
          </div>
        </div>
        {contact.source && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/70 font-medium shrink-0">
            {contact.source}
          </span>
        )}
      </div>

      {/* Contact details grid */}
      <div className="mt-2 ml-[42px] space-y-1">
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-2 text-[12px] text-foreground/80 hover:text-emerald-400 transition-colors group"
          >
            <Mail className="h-3 w-3 text-muted-foreground/50 group-hover:text-emerald-400 shrink-0" />
            <span>{contact.email}</span>
          </a>
        )}
        {contact.phone && contact.phone !== "Locked" && (
          <a
            href={`tel:${contact.phone}`}
            className="flex items-center gap-2 text-[12px] text-foreground/80 hover:text-emerald-400 transition-colors group"
          >
            <Phone className="h-3 w-3 text-muted-foreground/50 group-hover:text-emerald-400 shrink-0" />
            <span>{contact.phone}</span>
          </a>
        )}
        {contact.linkedinUrl && (
          <a
            href={contact.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[12px] text-foreground/80 hover:text-[#0A66C2] transition-colors group"
          >
            <Linkedin className="h-3 w-3 text-muted-foreground/50 group-hover:text-[#0A66C2] shrink-0" />
            <span className="truncate">{contact.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
          </a>
        )}
        {(contact.city || contact.country) && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground/60">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{[contact.city, contact.country].filter(Boolean).join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EnrichedContactsPanel({ contacts }: { contacts: ContactData[] }) {
  // Group by company
  const byCompany = new Map<string, ContactData[]>();
  for (const c of contacts) {
    const key = c.companyName || c.companyDomain || "Other";
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(c);
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden divide-y divide-border/30">
      {Array.from(byCompany.entries()).map(([company, groupContacts]) => (
        <div key={company}>
          <div className="px-3.5 py-2 bg-muted/20 flex items-center gap-2">
            <Building2 className="h-3 w-3 text-emerald-400" />
            <span className="text-[12px] font-semibold text-foreground/80">{company}</span>
          </div>
          <div className="divide-y divide-border/20">
            {groupContacts.map((contact, i) => (
              <EnrichedContactCard key={i} contact={contact} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stable key for a contact (name + title + company) */
export function contactKey(c: ContactData): string {
  return `${c.fullName}||${c.jobTitle}||${c.companyName || c.companyDomain}`;
}

/* ──────────────────────────────────────────────────────────────── */
/*  Collapsible Section Header                                       */
/* ──────────────────────────────────────────────────────────────── */

function CollapsibleSection({
  title,
  trailing,
  defaultOpen = true,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left group mt-1"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
        <span className="text-sm font-semibold text-foreground">
          {title}
        </span>
        {trailing && (
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {trailing}
          </span>
        )}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  Select All Button (for Contact Previews header)                  */
/* ──────────────────────────────────────────────────────────────── */

function SelectAllButton({
  contacts,
  selectedKeys,
  onToggle,
}: {
  contacts: ContactData[];
  selectedKeys?: Set<string>;
  onToggle: (contact: ContactData, key: string) => void;
}) {
  const allKeys = contacts.map((c) => contactKey(c));
  const allSelected = selectedKeys ? allKeys.every((k) => selectedKeys.has(k)) : false;

  return (
    <button
      type="button"
      onClick={() => {
        contacts.forEach((c) => {
          const k = contactKey(c);
          // If all selected → deselect all; otherwise → select unselected
          if (allSelected || !selectedKeys?.has(k)) onToggle(c, k);
        });
      }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <span
        className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
          allSelected
            ? "bg-emerald-500 border-emerald-500"
            : "border-border/60 hover:border-emerald-400/60"
        }`}
      >
        {allSelected && (
          <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      Select All
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  Main Rich Message Content                                       */
/* ──────────────────────────────────────────────────────────────── */

interface RichMessageContentProps {
  content: string;
  metadata?: MessageMetadata | null;
  selectedContactKeys?: Set<string>;
  onToggleContact?: (contact: ContactData, key: string) => void;
}

export function RichMessageContent({
  content,
  metadata,
  selectedContactKeys,
  onToggleContact,
}: RichMessageContentProps) {
  const data = metadata?.data;
  const hasCompanies = (data?.companies?.length ?? 0) > 0;
  const hasContacts = (data?.contacts?.length ?? 0) > 0;
  const hasStructuredData = hasCompanies || hasContacts;

  // If no structured data, use FormattedText for smart text formatting
  if (!hasStructuredData) {
    return <FormattedText text={content} />;
  }

  const { intro, outro } = extractConversationalParts(content, true);

  // Split contacts into preview (locked) vs enriched (unlocked)
  const previewContacts = data?.contacts?.filter((c) => c.previewOnly) ?? [];
  const enrichedContacts = data?.contacts?.filter((c) => !c.previewOnly) ?? [];

  // Group preview contacts by company for checkbox selection
  const previewByCompany = new Map<string, ContactData[]>();
  for (const contact of previewContacts) {
    const key = contact.companyName || contact.companyDomain || "Other";
    if (!previewByCompany.has(key)) previewByCompany.set(key, []);
    previewByCompany.get(key)!.push(contact);
  }

  return (
    <div className="space-y-3">
      {/* Intro text */}
      {intro && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{intro}</p>
      )}

      {/* Companies — single tile with line separators */}
      {hasCompanies && <CompaniesPanel companies={data!.companies} />}

      {/* Enriched (unlocked) contacts — full detail cards, no checkboxes */}
      {enrichedContacts.length > 0 && (
        <CollapsibleSection title={`Unlocked Contacts (${enrichedContacts.length})`}>
          <EnrichedContactsPanel contacts={enrichedContacts} />
        </CollapsibleSection>
      )}

      {/* Preview contacts — with checkboxes for selection */}
      {previewContacts.length > 0 && (
        <CollapsibleSection
          title={`Contact Previews (${previewContacts.length})`}
          defaultOpen={false}
          trailing={
            onToggleContact ? (
              <SelectAllButton
                contacts={previewContacts}
                selectedKeys={selectedContactKeys}
                onToggle={onToggleContact}
              />
            ) : undefined
          }
        >
          {Array.from(previewByCompany.entries()).map(
            ([companyName, contacts]) => (
              <ContactGroup
                key={companyName}
                companyName={companyName}
                contacts={contacts}
                selectedKeys={selectedContactKeys}
                onToggle={onToggleContact}
              />
            )
          )}
        </CollapsibleSection>
      )}

      {/* Outro text */}
      {outro && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{outro}</p>
      )}
    </div>
  );
}
