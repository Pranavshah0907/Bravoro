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
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────── */
/*  Credits Line (admin-only, outside the bubble)                  */
/* ──────────────────────────────────────────────────────────────── */

export function CreditsLine({ credits }: { credits: Credits }) {
  const total =
    ((credits.contacts_with_mobile_phone ?? 0) * 4) +
    ((credits.contacts_with_direct_phone_only ?? 0) * 3) +
    ((credits.email_linkedin_only_contacts ?? 0) * 2) +
    (credits.theirstack_total_credits ?? 0);

  if (total === 0) return null;

  return (
    <span>
      <span className="font-medium">Credits used:</span> {total}
    </span>
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
              {company.jobs.map((job) => (
                <a
                  key={`${job.title}-${job.url}`}
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
        <CompanyRow key={company.domain || company.name} company={company} />
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
  enrichedKeys,
  onToggle,
}: {
  companyName: string;
  contacts: ContactData[];
  selectedKeys?: Set<string>;
  enrichedKeys?: Set<string>;
  onToggle?: (contact: ContactData, key: string) => void;
}) {
  const allKeys = contacts.map((c) => contactKey(c));
  const selectableKeys = allKeys.filter((k) => !enrichedKeys?.has(k));
  const allSelected = selectedKeys && selectableKeys.length > 0
    ? selectableKeys.every((k) => selectedKeys.has(k))
    : false;

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden">
      <div className="px-3.5 py-2 border-b border-border/30 flex items-center gap-2">
        {onToggle && selectableKeys.length > 0 && (
          <button
            type="button"
            onClick={() => {
              contacts.forEach((c) => {
                const k = contactKey(c);
                if (enrichedKeys?.has(k)) return;
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
          const isEnriched = enrichedKeys?.has(key) ?? false;
          const checked = isEnriched || (selectedKeys?.has(key) ?? false);
          return (
            <div
              key={i}
              className={`px-3.5 py-2 flex items-center gap-2.5 transition-colors ${
                onToggle && !isEnriched ? "cursor-pointer hover:bg-muted/30" : ""
              } ${checked ? "bg-emerald-500/5" : ""} ${isEnriched ? "opacity-60" : ""}`}
              onClick={() => !isEnriched && onToggle?.(contact, key)}
            >
              {onToggle && (
                <button
                  type="button"
                  disabled={isEnriched}
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    checked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-border/60 hover:border-emerald-400/60"
                  } ${isEnriched ? "cursor-not-allowed" : ""}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isEnriched) onToggle(contact, key);
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
            {groupContacts.map((contact) => (
              <EnrichedContactCard key={contactKey(contact)} contact={contact} />
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
  enrichedKeys,
  onToggle,
}: {
  contacts: ContactData[];
  selectedKeys?: Set<string>;
  enrichedKeys?: Set<string>;
  onToggle: (contact: ContactData, key: string) => void;
}) {
  const selectableContacts = contacts.filter((c) => !enrichedKeys?.has(contactKey(c)));
  const allSelected = selectedKeys && selectableContacts.length > 0
    ? selectableContacts.every((c) => selectedKeys.has(contactKey(c)))
    : false;

  if (selectableContacts.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        selectableContacts.forEach((c) => {
          const k = contactKey(c);
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
/*  Candidate Preview Card (recruiting discovery)                    */
/* ──────────────────────────────────────────────────────────────── */

const CandidatePreviewCard = ({
  contact,
  isSelected,
  isEnriched,
  onToggle,
  contactKey: key,
}: {
  contact: ContactData;
  isSelected: boolean;
  isEnriched?: boolean;
  onToggle: (contact: ContactData, key: string) => void;
  contactKey: string;
}) => (
  <div
    className={cn(
      "group relative flex items-start gap-3 p-3 rounded-lg border transition-colors",
      isEnriched
        ? "bg-emerald-500/5 border-emerald-500/20 opacity-60 cursor-default"
        : isSelected
          ? "bg-emerald-500/10 border-emerald-500/30 cursor-pointer"
          : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12] cursor-pointer"
    )}
    onClick={() => !isEnriched && onToggle(contact, key)}
  >
    <div className={cn(
      "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
      isEnriched
        ? "bg-emerald-700/50 border-emerald-700/50"
        : isSelected
          ? "bg-emerald-500 border-emerald-500"
          : "border-white/20 group-hover:border-white/40"
    )}>
      {(isSelected || isEnriched) && (
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{contact.fullName}</span>
        {contact.linkedinUrl && (
          <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 shrink-0" title="View profile">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        )}
      </div>
      {(contact.headline || contact.jobTitle) && (
        <p className="text-xs text-white/60 mt-0.5 truncate">
          {contact.headline || `${contact.jobTitle}${contact.companyName ? ` at ${contact.companyName}` : ""}`}
        </p>
      )}
      {(contact.city || contact.country) && (
        <p className="text-xs text-white/40 mt-0.5">{[contact.city, contact.country].filter(Boolean).join(", ")}</p>
      )}
      {contact.skills && contact.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {contact.skills.slice(0, 5).map((skill) => (
            <span key={skill} className="px-1.5 py-0.5 text-[10px] rounded bg-white/[0.06] text-white/50">{skill}</span>
          ))}
          {contact.skills.length > 5 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/[0.06] text-white/40">+{contact.skills.length - 5}</span>
          )}
        </div>
      )}
      {contact.experienceSummary && (
        <p className="text-[11px] text-white/30 mt-1 line-clamp-2 italic">{contact.experienceSummary}</p>
      )}
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────────────── */
/*  Enriched Candidate Card (recruiting enrichment results)          */
/* ──────────────────────────────────────────────────────────────── */

const EnrichedCandidateCard = ({ contact }: { contact: ContactData }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg border bg-emerald-500/[0.05] border-emerald-500/20">
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{contact.fullName}</span>
        {contact.linkedinUrl && (
          <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 shrink-0">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        )}
      </div>
      {contact.jobTitle && (
        <p className="text-xs text-white/60 mt-0.5">{contact.jobTitle}{contact.companyName ? ` at ${contact.companyName}` : ""}</p>
      )}
      {(contact.city || contact.country) && (
        <p className="text-xs text-white/40 mt-0.5">{[contact.city, contact.country].filter(Boolean).join(", ")}</p>
      )}
      <div className="flex flex-col gap-1 mt-2 text-xs">
        {contact.email && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 shrink-0">Email:</span>
            <a href={`mailto:${contact.email}`} className="text-emerald-400 hover:text-emerald-300 truncate">{contact.email}</a>
          </div>
        )}
        {contact.mobilePhone && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 shrink-0">Mobile:</span>
            <a href={`tel:${contact.mobilePhone}`} className="text-emerald-400 hover:text-emerald-300">{contact.mobilePhone}</a>
          </div>
        )}
        {contact.directPhone && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 shrink-0">Direct:</span>
            <a href={`tel:${contact.directPhone}`} className="text-emerald-400 hover:text-emerald-300">{contact.directPhone}</a>
          </div>
        )}
        {!contact.mobilePhone && !contact.directPhone && contact.phone && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 shrink-0">Phone:</span>
            <a href={`tel:${contact.phone}`} className="text-emerald-400 hover:text-emerald-300">{contact.phone}</a>
          </div>
        )}
      </div>
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────────────── */
/*  Main Rich Message Content                                       */
/* ──────────────────────────────────────────────────────────────── */

interface RichMessageContentProps {
  content: string;
  metadata?: MessageMetadata | null;
  selectedContactKeys?: Set<string>;
  enrichedContactKeys?: Set<string>;
  onToggleContact?: (contact: ContactData, key: string) => void;
}

export function RichMessageContent({
  content,
  metadata,
  selectedContactKeys,
  enrichedContactKeys,
  onToggleContact,
}: RichMessageContentProps) {
  const structuredData = metadata?.data;
  const data = structuredData;
  const hasCompanies = (data?.companies?.length ?? 0) > 0;
  const hasContacts = (data?.contacts?.length ?? 0) > 0;
  const isCandidateType = data?.type === "candidates" || data?.type === "enriched_contacts";
  const hasStructuredData = hasCompanies || hasContacts || isCandidateType;

  // If no structured data, use FormattedText for smart text formatting
  if (!hasStructuredData) {
    return <FormattedText text={content} />;
  }

  let { intro, outro } = extractConversationalParts(content, true);

  // For enriched contacts, only keep the first paragraph as intro —
  // everything else (name, email, phone, location lines) duplicates the cards
  if (data?.type === "enriched_contacts") {
    const firstBreak = intro.search(/\n\s*\n/);
    intro = firstBreak > 0 ? intro.slice(0, firstBreak).trim() : intro;
    outro = "";
  }

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
      {intro && <FormattedText text={intro} />}

      {/* Companies — single tile with line separators */}
      {hasCompanies && <CompaniesPanel companies={data!.companies} />}

      {/* Enriched (unlocked) contacts — full detail cards, no checkboxes (AI Staffing only) */}
      {!isCandidateType && enrichedContacts.length > 0 && (
        <CollapsibleSection title={`Unlocked Contacts (${enrichedContacts.length})`}>
          <EnrichedContactsPanel contacts={enrichedContacts} />
        </CollapsibleSection>
      )}

      {/* Preview contacts — with checkboxes for selection (AI Staffing only) */}
      {!isCandidateType && previewContacts.length > 0 && (
        <CollapsibleSection
          title={`Contact Previews (${previewContacts.length})`}
          defaultOpen={false}
          trailing={
            onToggleContact ? (
              <SelectAllButton
                contacts={previewContacts}
                selectedKeys={selectedContactKeys}
                enrichedKeys={enrichedContactKeys}
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
                enrichedKeys={enrichedContactKeys}
                onToggle={onToggleContact}
              />
            )
          )}
        </CollapsibleSection>
      )}

      {/* Candidate Preview Cards (recruiting discovery) */}
      {structuredData?.type === "candidates" && structuredData.contacts && structuredData.contacts.length > 0 && onToggleContact && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
              Candidates Found ({structuredData.contacts.length})
            </span>
            <button
              onClick={() => {
                const selectableContacts = structuredData.contacts.filter((c) => !enrichedContactKeys?.has(contactKey(c)));
                const allSelected = selectableContacts.every((c) => selectedContactKeys?.has(contactKey(c)));
                selectableContacts.forEach((c) => {
                  const k = contactKey(c);
                  if (allSelected) { if (selectedContactKeys?.has(k)) onToggleContact(c, k); }
                  else { if (!selectedContactKeys?.has(k)) onToggleContact(c, k); }
                });
              }}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {structuredData.contacts.filter((c) => !enrichedContactKeys?.has(contactKey(c))).every((c) => selectedContactKeys?.has(contactKey(c))) && structuredData.contacts.some((c) => !enrichedContactKeys?.has(contactKey(c))) ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="grid gap-2">
            {structuredData.contacts.map((contact) => {
              const key = contactKey(contact);
              return (
                <CandidatePreviewCard key={key} contact={contact} isSelected={selectedContactKeys?.has(key) ?? false} isEnriched={enrichedContactKeys?.has(key)} onToggle={onToggleContact} contactKey={key} />
              );
            })}
          </div>
        </div>
      )}

      {/* Enriched Candidate Cards (recruiting enrichment results) */}
      {structuredData?.type === "enriched_contacts" && structuredData.contacts && structuredData.contacts.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider">
            Enriched Contacts ({structuredData.contacts.length})
          </span>
          <div className="grid gap-2">
            {structuredData.contacts.map((contact) => (
              <EnrichedCandidateCard key={contactKey(contact)} contact={contact} />
            ))}
          </div>
        </div>
      )}

      {/* Outro text */}
      {outro && (
        <div className="pt-2 border-t border-white/[0.06]">
          <FormattedText text={outro} />
        </div>
      )}
    </div>
  );
}
