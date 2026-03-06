import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface EnrichmentCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  isSelected?: boolean;
  isCompact?: boolean;
  onClick: () => void;
  gradient?: string;
  accentColor?: string;
}

export const EnrichmentCard = ({
  title,
  description,
  icon: Icon,
  isSelected,
  isCompact,
  onClick,
  gradient = "from-primary/20 to-accent/10",
}: EnrichmentCardProps) => {
  if (isCompact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "group relative w-full p-4 rounded-xl transition-all duration-300",
          "bg-card/80 backdrop-blur-sm border",
          "hover:bg-card hover:shadow-lg",
          isSelected
            ? "border-primary/50 shadow-md shadow-primary/10"
            : "border-border/50 hover:border-primary/30"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg transition-all duration-300",
            isSelected
              ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-left">
            <h3 className={cn(
              "font-semibold text-sm transition-colors",
              isSelected ? "text-primary" : "text-foreground"
            )}>
              {title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {description}
            </p>
          </div>
        </div>
        {isSelected && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
        )}
      </button>
    );
  }

  return (
    <SpotlightCard
      spotlightColor="rgba(88, 221, 221, 0.09)"
      className={cn(
        "group h-56 w-full rounded-2xl cursor-pointer",
        "bg-gradient-to-br", gradient,
        "border backdrop-blur-sm",
        "transition-all duration-500 ease-out",
        "hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/15",
        isSelected
          ? "border-primary/50 shadow-lg shadow-primary/15"
          : "border-border/40 hover:border-primary/40"
      )}
      onClick={onClick}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Inner glow on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Card content — vertically centred */}
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
        {/* Icon */}
        <div className={cn(
          "relative p-4 rounded-xl shrink-0",
          "border transition-all duration-500",
          "group-hover:scale-110",
          isSelected
            ? "bg-primary/20 border-primary/40 text-primary shadow-lg shadow-primary/20"
            : "bg-card/70 border-border/40 text-muted-foreground group-hover:bg-primary/15 group-hover:border-primary/40 group-hover:text-primary group-hover:shadow-lg group-hover:shadow-primary/20"
        )}>
          <Icon className="h-7 w-7" />
          {/* Icon inner glow */}
          <div className="absolute inset-0 rounded-xl bg-primary/25 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        {/* Text */}
        <div className="space-y-1.5">
          <h3 className={cn(
            "text-base font-bold leading-tight transition-colors duration-300",
            isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
          )}>
            {title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[180px] mx-auto">
            {description}
          </p>
        </div>
      </div>

      {/* Bottom dots */}
      <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-1 group-hover:translate-y-0">
        <span className="w-1 h-1 rounded-full bg-primary/70" />
        <span className="w-1 h-1 rounded-full bg-primary/45" />
        <span className="w-1 h-1 rounded-full bg-primary/25" />
      </div>
    </SpotlightCard>
  );
};
