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
      className="block rounded-lg border border-[#1e4040] bg-[#0f2424] p-4 transition-colors hover:border-emerald-500/40 hover:bg-[#122c2c]"
    >
      <div className="mb-2 text-emerald-400">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-[13px] font-semibold text-[#e5e7eb] mb-1">{title}</h3>
      <p className="text-[12px] text-[#9ca3af] leading-relaxed">{description}</p>
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
