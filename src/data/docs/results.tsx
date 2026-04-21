import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";

export default function ResultsSection() {
  return (
    <>
      <h2 id="viewing-results" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        Viewing Results
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        After any search completes, results appear on the Results page (accessible from the sidebar).
        Each search is listed with its status, timestamp, and input file name. Click a search to expand
        and view the returned data.
      </p>
      <DocsFlowDiagram steps={["Run a search", "Results page", "Expand company", "View contacts & jobs"]} />

      <h2 id="result-structure" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Result Structure
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Results are organized by company. Each company row expands to show:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Contacts</span> — enriched people with email, phone, LinkedIn, and seniority</li>
        <li><span className="text-emerald-400">Job Listings</span> — current open positions at the company (collapsible section)</li>
      </ul>

      <h2 id="filtering" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Filtering
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Use the search bar at the top to filter results by company name or the original input file name.
        The results list shows a "Name / File" column that displays either the Excel file name (for bulk
        uploads) or the company name (for single searches).
      </p>

      <h2 id="excel-export" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Excel Export
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Click the download button to export results as an{" "}
        <code className="px-1.5 py-0.5 rounded bg-[#1a3535] text-emerald-300 text-[12px]">.xlsx</code> file.
        The exported file contains all contacts and job data from the search. Files are named{" "}
        <code className="px-1.5 py-0.5 rounded bg-[#1a3535] text-emerald-300 text-[12px]">
          {"<input_file>_processed.xlsx"}
        </code>.
      </p>
    </>
  );
}
