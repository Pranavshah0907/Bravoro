import { Search, Upload, Users, Bot, UserSearch } from "lucide-react";
import { DocsFeatureCard, DocsFeatureCardGrid } from "@/components/docs/DocsFeatureCard";
import { DocsTable } from "@/components/docs/DocsTable";
import { Link } from "react-router-dom";

export default function OverviewSection() {
  return (
    <>
      <h2 id="what-is-bravoro" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What is Bravoro?
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Bravoro is a lead enrichment and automation platform that helps sales and recruiting teams
        find, verify, and enrich business contacts at scale. Upload company lists, search individually,
        or use AI chat to discover candidates — Bravoro handles the rest and delivers verified
        emails, phone numbers, and job listings.
      </p>

      <h2 id="core-features" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-4 scroll-mt-24">
        Core Features
      </h2>
      <DocsFeatureCardGrid>
        <DocsFeatureCard icon={Search} title="Single Search" description="Look up one company at a time and get enriched contacts" href="/docs/single-search" />
        <DocsFeatureCard icon={Upload} title="Bulk Search" description="Upload an Excel file or Google Sheet with multiple companies" href="/docs/bulk-search" />
        <DocsFeatureCard icon={Users} title="People Enrichment" description="Enrich existing contact lists with verified phone and email" href="/docs/people-enrichment" />
        <DocsFeatureCard icon={Bot} title="AI Staffing Chat" description="Conversational AI for discovering companies and contacts" href="/docs/ai-staffing-chat" />
        <DocsFeatureCard icon={UserSearch} title="Recruiting Chat" description="Find and enrich candidates by role, skills, and location" href="/docs/recruiting-chat" />
      </DocsFeatureCardGrid>

      <h2 id="credit-costs" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-4 scroll-mt-24">
        Credit Costs at a Glance
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Every enrichment deducts credits from your workspace pool based on the type of contact data returned.
      </p>
      <DocsTable
        headers={["Contact Type", "Credits per Contact"]}
        rows={[
          ["Mobile Phone", "4 credits"],
          ["Direct Phone", "3 credits"],
          ["Email / LinkedIn", "2 credits"],
          ["Job Listing", "1 credit"],
        ]}
      />

      <h2 id="next-steps" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Next Steps
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed">
        Ready to dive in?{" "}
        <Link to="/docs/getting-started" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Get Started →
        </Link>
      </p>
    </>
  );
}
