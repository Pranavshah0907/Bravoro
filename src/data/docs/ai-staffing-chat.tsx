import { DocsTip } from "@/components/docs/DocsTip";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";

export default function AIStaffingChatSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        AI Staffing Chat is a conversational interface for discovering companies and contacts.
        Instead of filling out forms, describe what you're looking for in natural language — the AI
        searches the web and returns structured company cards and contact information.
      </p>

      <h2 id="how-to-use" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        How to Use
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Select <span className="text-emerald-400 font-medium">AI Staffing</span> from the Tools section in the sidebar, then type your query.
      </p>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-2">Example queries:</p>
      <DocsCodeBlock>
        "Find software companies in Berlin with 50-200 employees"
      </DocsCodeBlock>
      <DocsCodeBlock>
        "Show me marketing agencies in Munich hiring for account managers"
      </DocsCodeBlock>

      <h2 id="rich-results" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Rich Results
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The AI returns structured data rendered as interactive cards:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Company cards</span> — domain, location, employee count, and a summary</li>
        <li><span className="text-emerald-400">Contact cards</span> — name, title, email, phone when available</li>
        <li><span className="text-emerald-400">Job listings</span> — open positions at discovered companies (collapsible)</li>
      </ul>

      <h2 id="conversation-management" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Conversation Management
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Your chat history is saved automatically. From the sidebar you can:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li>Start a new chat with the + button</li>
        <li>Switch between previous conversations</li>
        <li>Rename conversations for easier reference</li>
        <li>Delete old conversations you no longer need</li>
      </ul>

      <DocsTip>
        Be specific about location and company size for better results. "Software companies in Berlin
        with 50-200 employees" gives much better results than just "software companies."
      </DocsTip>
    </>
  );
}
