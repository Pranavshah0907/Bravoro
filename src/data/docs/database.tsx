export default function DatabaseSection() {
  return (
    <>
      <h2 id="what-it-stores" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Stores
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The Database page is your master repository of all enriched contacts. Every contact found through
        Bulk Search, People Enrichment, or Recruiting Chat enrichment is automatically stored here.
      </p>

      <h2 id="how-contacts-arrive" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        How Contacts Arrive
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Contacts are added automatically from three sources:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Bulk Search</span> — all contacts returned from company enrichments</li>
        <li><span className="text-emerald-400">People Enrichment</span> — all successfully enriched people</li>
        <li><span className="text-emerald-400">Recruiting Chat</span> — enriched candidates with phone numbers</li>
      </ul>

      <h2 id="deduplication" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Deduplication
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The same person won't appear twice in your database. Contacts are matched by their unique provider
        ID, so even if you enrich the same person across different searches, only one record is maintained
        (updated with the latest data).
      </p>

      <h2 id="searching" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Searching & Filtering
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Use the search and filter tools to find contacts by name, company, email, or phone number.
        The database supports full-text search across all contact fields.
      </p>
    </>
  );
}
