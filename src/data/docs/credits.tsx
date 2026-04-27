import { DocsWarning } from "@/components/docs/DocsWarning";
import { DocsTable } from "@/components/docs/DocsTable";
import { DocsTip } from "@/components/docs/DocsTip";
import { Link } from "react-router-dom";

export default function CreditsSection() {
  return (
    <>
      <h2 id="how-credits-work" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        How Credits Work
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Your workspace has a shared credit pool. Every time a search or enrichment returns contact data,
        credits are deducted based on the type of information found. All users in your workspace draw
        from the same pool.
      </p>

      <h2 id="cost-table" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Cost per Contact Type
      </h2>
      <DocsTable
        headers={["Contact Type", "Credits", "Description"]}
        rows={[
          ["Mobile Phone", "4", "Personal mobile number — highest value, highest cost"],
          ["Direct Phone", "3", "Direct work phone line"],
          ["Email / LinkedIn", "2", "Business email or LinkedIn profile URL"],
          ["Job Listing", "1", "An open position at the company"],
        ]}
      />
      <DocsWarning>
        Credits are deducted when results are returned, not when searches are initiated. If a search finds
        a mobile phone and an email for one contact, that's 4 + 2 = 6 credits.
      </DocsWarning>

      <h2 id="checking-balance" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Checking Your Balance
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        You can check your remaining credits in two places:
      </p>
      <ul className="space-y-1.5 text-[14px] text-foreground/80 mb-4 ml-4 list-disc list-outside">
        <li>
          <Link to="/docs/settings" className="text-accent hover:text-accent underline underline-offset-2">Settings</Link>
          {" "}— shows your workspace balance with color-coded indicator
        </li>
        <li>
          <Link to="/docs/analytics" className="text-accent hover:text-accent underline underline-offset-2">Analytics</Link>
          {" "}— shows usage over time and remaining balance
        </li>
      </ul>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Balance is color-coded: <span className="text-green-400">green</span> (healthy),{" "}
        <span className="text-amber-400">amber</span> (running low),{" "}
        <span className="text-red-400">red</span> (critically low).
      </p>

      <h2 id="running-out" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        What Happens at Zero
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        When your workspace runs out of credits, all searches and enrichments are paused. You'll see a
        friendly message explaining the situation. Contact your workspace admin to request a credit top-up.
      </p>

      <h2 id="cache-benefit" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Cache Benefit
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Bravoro caches enrichment results for 6 months. If you enrich the same person again within that
        window, the cached data is returned at no additional credit cost. This makes it safe to re-run
        enrichments on overlapping contact lists.
      </p>

      <DocsTip>
        Before running a large bulk operation, check your credit balance in Settings to make sure you have
        enough credits to complete the full batch.
      </DocsTip>
    </>
  );
}
