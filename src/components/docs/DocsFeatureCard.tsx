import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface DocsFeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

export function DocsFeatureCard({ icon: Icon, title, description, href }: DocsFeatureCardProps) {
  return (
    <Link
      to={href}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-accent/40 hover:bg-muted"
    >
      <div className="mb-2 text-accent">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-[13px] font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
    </Link>
  );
}

export function DocsFeatureCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
      {children}
    </div>
  );
}
