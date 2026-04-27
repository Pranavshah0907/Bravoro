import { DocsTip } from "@/components/docs/DocsTip";
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { Link } from "react-router-dom";

export default function RecruitingChatSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Recruiting Chat is an AI-powered candidate search tool. Describe the role you're hiring for,
        and the AI finds matching candidates across the web. You can then select candidates and enrich
        them with verified contact details — all within the chat.
      </p>

      <h2 id="how-to-use" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        How to Use
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-3">
        Select <span className="text-accent font-medium">Recruiting</span> from the Tools section in the sidebar, then describe the role.
      </p>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-2">Example queries:</p>
      <DocsCodeBlock>
        "Find senior React developers in Berlin"
      </DocsCodeBlock>
      <DocsCodeBlock>
        "Search for data scientists with Python experience in London"
      </DocsCodeBlock>

      <h2 id="candidate-flow" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Candidate Flow
      </h2>
      <DocsFlowDiagram steps={["Search", "Review candidates", "Select & Enrich", "Get contact details"]} />
      <ol className="space-y-2 text-[14px] text-foreground/80 mb-4 ml-4 list-decimal list-outside mt-4">
        <li>The AI searches for candidates matching your criteria and shows preview cards (name, current title, LinkedIn)</li>
        <li>Review the candidates and use checkboxes to select the ones you want to enrich</li>
        <li>Click <span className="text-accent font-medium">"Enrich Selected"</span> to retrieve verified contact details</li>
        <li>Enriched cards show: email, mobile phone, direct phone, and seniority level</li>
      </ol>

      <h2 id="auto-save" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Auto-Save to Database
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Enriched contacts with phone numbers are automatically saved to your{" "}
        <Link to="/docs/database" className="text-accent hover:text-accent underline underline-offset-2">
          master database
        </Link>
        . No extra steps needed — your enriched candidates are preserved for future reference and won't be
        double-charged if you enrich them again.
      </p>

      <h2 id="credit-costs" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Credit Costs
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Candidate search itself is free — credits are only deducted when you enrich contacts. The cost
        depends on what contact data is found (see{" "}
        <Link to="/docs/credits" className="text-accent hover:text-accent underline underline-offset-2">
          Credits
        </Link>
        ).
      </p>

      <DocsTip>
        Include location in your search query — results are more accurate when location comes from
        evidence in candidate profiles, not assumptions. "React developers in Berlin" works better
        than just "React developers."
      </DocsTip>
    </>
  );
}
