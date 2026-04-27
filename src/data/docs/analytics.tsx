export default function AnalyticsSection() {
  return (
    <>
      <h2 id="what-it-shows" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        What It Shows
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        The Analytics page gives you a detailed breakdown of your workspace's credit usage over time.
        Use it to understand consumption patterns and manage your credit budget.
      </p>

      <h2 id="usage-breakdown" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Usage Breakdown
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Credits are broken down by contact type:
      </p>
      <ul className="space-y-1.5 text-[14px] text-foreground/80 mb-4 ml-4 list-disc list-outside">
        <li><span className="text-accent">Mobile Phone</span> — 4 credits each</li>
        <li><span className="text-accent">Direct Phone</span> — 3 credits each</li>
        <li><span className="text-accent">Email / LinkedIn</span> — 2 credits each</li>
        <li><span className="text-accent">Job Listings</span> — 1 credit each</li>
      </ul>

      <h2 id="time-charts" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Time-Based Charts
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Charts show credit consumption over time, so you can spot trends — such as which days or weeks
        have the highest usage. This is useful for planning credit top-ups and understanding your team's
        enrichment activity.
      </p>
    </>
  );
}
