import { DocsTip } from "@/components/docs/DocsTip";
import { DocsWarning } from "@/components/docs/DocsWarning";
import { DocsTable } from "@/components/docs/DocsTable";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { Link } from "react-router-dom";

export default function BulkSearchSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Bulk Search lets you enrich contacts for multiple companies at once. Upload an Excel file,
        connect a Google Sheet, or use the built-in spreadsheet editor — Bravoro processes each
        company row and returns enriched contacts and job listings.
      </p>

      <h2 id="input-methods" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Input Methods
      </h2>

      <h3 className="text-[15px] font-medium text-[#d1d5db] mt-6 mb-2">Excel Upload</h3>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Upload a <code className="px-1.5 py-0.5 rounded bg-[#1a3535] text-emerald-300 text-[12px]">.xlsx</code> file
        with the required column headers. Download the template from the upload card to get the
        correct format.
      </p>

      <h3 className="text-[15px] font-medium text-[#d1d5db] mt-6 mb-2">Google Sheets</h3>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Paste a Google Sheet URL with the same column headers. The sheet must be shared (at least "Anyone with the link" as Viewer).
        See the{" "}
        <Link to="/google-sheets-guide" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Google Sheets Setup Guide
        </Link>{" "}
        for detailed instructions.
      </p>

      <h3 className="text-[15px] font-medium text-[#d1d5db] mt-6 mb-2">Spreadsheet Grid</h3>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Use the built-in spreadsheet editor to enter data directly in the browser. You can save
        your work as drafts and come back to them later. Drafts can be renamed, loaded, or deleted
        from the Spreadsheet tab.
      </p>

      <h2 id="required-columns" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Required Columns
      </h2>
      <DocsTable
        headers={["Column", "Required", "Notes"]}
        rows={[
          ["Sr No", "Yes", "Row number"],
          ["Organization Name", "Yes", "Company name"],
          ["Organization Locations", "No", "Filter by location"],
          ["Organization Domains", "No", "Company domain"],
          ["Person Functions", "No", "e.g. \"Sales, Marketing\" (comma separated)"],
          ["Person Seniorities", "No", "e.g. \"Director, VP\""],
          ["Person Job Title", "No", "Specific title filter"],
          ["Results per Function", "No", "Number of results per function"],
          ["Job Search", "No", "\"Yes\" or \"No\""],
          ["Job Title", "No", "Job title to search"],
          ["Job Seniority", "No", "Job seniority filter"],
          ["Date (days)", "No", "Job posting recency in days"],
        ]}
      />
      <DocsWarning>
        Ensure your Excel file has the correct column headers. Columns are matched by name prefix — suffixes
        like "(comma separated)" are acceptable. If headers don't match, the upload will be rejected.
      </DocsWarning>

      <h2 id="draft-management" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Draft Management
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        When using the Spreadsheet Grid, your work is automatically organized into drafts. You can:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li>Save your current grid as a named draft</li>
        <li>Load a previous draft to continue editing</li>
        <li>Rename or delete drafts you no longer need</li>
        <li>View submitted (sent) sheets separately from drafts</li>
      </ul>

      <DocsTip>
        Start with a small batch (5-10 companies) to verify your column mapping is correct before
        running a large upload.
      </DocsTip>
    </>
  );
}
