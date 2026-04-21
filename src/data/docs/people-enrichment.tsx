import { DocsTip } from "@/components/docs/DocsTip";
import { DocsTable } from "@/components/docs/DocsTable";
import { Link } from "react-router-dom";

export default function PeopleEnrichmentSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        People Enrichment is for when you already have a list of people and want to fill in their contact
        details. Unlike Bulk Search (which starts from companies), People Enrichment starts from individual
        names and returns verified phone numbers, emails, and LinkedIn profiles.
      </p>

      <h2 id="input-methods" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Input Methods
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Same three options as Bulk Search — Excel upload, Google Sheets, or the built-in Spreadsheet Grid.
        The column headers are different since you're working with people, not companies.
      </p>

      <h2 id="required-columns" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Required Columns
      </h2>
      <DocsTable
        headers={["Column", "Required", "Notes"]}
        rows={[
          ["Sr No", "Yes", "Row number"],
          ["Record Id", "Yes", "Unique identifier for each person"],
          ["First Name", "Yes", "Contact's first name"],
          ["Last Name", "Yes", "Contact's last name"],
          ["Organization Domain", "Yes", "Company domain (e.g. acme.com)"],
          ["LinkedIn URL", "No", "LinkedIn profile URL — significantly improves match accuracy"],
        ]}
      />

      <h2 id="enrichment-results" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Enrichment Results
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        For each person, Bravoro attempts to find and verify:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Mobile Phone</span> — personal mobile number</li>
        <li><span className="text-emerald-400">Direct Phone</span> — direct work line</li>
        <li><span className="text-emerald-400">Email</span> — verified business email</li>
        <li><span className="text-emerald-400">LinkedIn</span> — confirmed LinkedIn profile URL</li>
        <li><span className="text-emerald-400">Seniority</span> — current seniority level</li>
      </ul>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Credits are deducted per contact type found — see{" "}
        <Link to="/docs/credits" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Credits
        </Link>{" "}
        for costs.
      </p>

      <DocsTip>
        Previously enriched contacts are cached — you won't be charged twice for the same person
        within 6 months. This means re-running enrichment on overlapping lists is safe and cost-effective.
      </DocsTip>
    </>
  );
}
