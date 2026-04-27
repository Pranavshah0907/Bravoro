import { DocsTip } from "@/components/docs/DocsTip";
import { DocsTable } from "@/components/docs/DocsTable";
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";
import { Link } from "react-router-dom";

export default function SingleSearchSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Single Search lets you look up one company at a time. Enter a company name, optionally refine by
        domain, location, job function, and seniority — and Bravoro returns enriched contacts matching
        your criteria, plus any open job listings if enabled.
      </p>
      <DocsFlowDiagram steps={["Enter company details", "Run search", "View contacts & jobs"]} />

      <h2 id="search-fields" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Search Fields
      </h2>
      <DocsTable
        headers={["Field", "Required", "Description"]}
        rows={[
          ["Company Name", "Yes", "The company to search for"],
          ["Domain", "No", "Company website domain (improves accuracy)"],
          ["Location", "No", "Filter contacts by geographic location"],
          ["Person Functions", "No", "Job functions like Sales, Marketing, Engineering"],
          ["Person Seniorities", "No", "Levels like Director, VP, C-Suite"],
          ["Job Title", "No", "Specific job title to filter by"],
        ]}
      />
      <DocsTip>
        Adding the company domain is optional but significantly improves match accuracy, especially for
        companies with common names.
      </DocsTip>

      <h2 id="results" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        What You Get
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Results include enriched contacts with email addresses, phone numbers (mobile and direct),
        LinkedIn profiles, and seniority information. If job search is enabled, you'll also see
        current open positions at the company.
      </p>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Credits are deducted per contact type found — see{" "}
        <Link to="/docs/credits" className="text-accent hover:text-accent underline underline-offset-2">
          Credits
        </Link>{" "}
        for the cost breakdown.
      </p>
    </>
  );
}
