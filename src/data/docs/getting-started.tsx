import { DocsTip } from "@/components/docs/DocsTip";
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";
import { Link } from "react-router-dom";

export default function GettingStartedSection() {
  return (
    <>
      <h2 id="dashboard-orientation" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        Dashboard Orientation
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Once you log in, the sidebar on the left is your main navigation. Here's what each section does:
      </p>
      <ul className="space-y-2 text-[14px] text-foreground/80 mb-6 ml-1">
        <li className="flex gap-2"><span className="text-accent font-medium">Home</span> — Dashboard with enrichment tool cards</li>
        <li className="flex gap-2"><span className="text-accent font-medium">Analytics</span> — Credit usage charts and consumption breakdown</li>
        <li className="flex gap-2"><span className="text-accent font-medium">Results</span> — All your completed searches and their results</li>
        <li className="flex gap-2"><span className="text-accent font-medium">Database</span> — Master database of all enriched contacts</li>
        <li className="flex gap-2"><span className="text-accent font-medium">Tools</span> — The 5 enrichment tools (Single Search, Bulk Search, People Enrichment, AI Staffing, Recruiting)</li>
      </ul>

      <h2 id="your-first-search" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Your First Search
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        The quickest way to get started is with a <Link to="/docs/single-search" className="text-accent hover:text-accent underline underline-offset-2">Single Search</Link>:
      </p>
      <DocsFlowDiagram steps={["Open Single Search", "Enter company name", "Set function & seniority", "Run search", "View results"]} />
      <p className="text-[14px] text-foreground/80 leading-relaxed mt-4 mb-4">
        Enter a company name, optionally narrow by job function and seniority level, then hit search.
        Results appear on the <Link to="/docs/results" className="text-accent hover:text-accent underline underline-offset-2">Results page</Link> with
        enriched contacts and job listings.
      </p>

      <h2 id="workspace-and-credits" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Workspace & Credits
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Your account belongs to a workspace — a shared environment for your team. Each workspace has a
        credit pool that's consumed when enrichments return contact data. Different contact types cost
        different amounts (see <Link to="/docs/credits" className="text-accent hover:text-accent underline underline-offset-2">Credits</Link> for the full breakdown).
      </p>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Check your remaining balance anytime in{" "}
        <Link to="/docs/settings" className="text-accent hover:text-accent underline underline-offset-2">Settings</Link> or{" "}
        <Link to="/docs/analytics" className="text-accent hover:text-accent underline underline-offset-2">Analytics</Link>.
        If credits run out, searches will be paused until your admin adds more.
      </p>

      <DocsTip>
        Start with Single Search to see how results look before running larger bulk operations. This helps you
        fine-tune your search parameters without spending many credits.
      </DocsTip>
    </>
  );
}
