import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

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
  accentColor = "primary"
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
        
        {/* Active indicator */}
        {isSelected && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center",
        "w-full aspect-[4/3] p-8 rounded-2xl",
        "bg-gradient-to-br", gradient,
        "border border-border/50 backdrop-blur-sm",
        "transition-all duration-500 ease-out",
        "hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10",
        "hover:border-primary/40",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
      )}
    >
      {/* Glow effect on hover */}
      <div className={cn(
        "absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500",
        "bg-gradient-to-t from-primary/5 to-transparent",
        "group-hover:opacity-100"
      )} />
      
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Icon */}
      <div className={cn(
        "relative p-5 rounded-2xl mb-6",
        "bg-card/80 border border-border/30",
        "transition-all duration-500",
        "group-hover:bg-primary/10 group-hover:border-primary/30 group-hover:scale-110",
        "group-hover:shadow-lg group-hover:shadow-primary/20"
      )}>
        <Icon className={cn(
          "h-8 w-8 transition-colors duration-300",
          "text-muted-foreground group-hover:text-primary"
        )} />
        
        {/* Icon glow */}
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>

      {/* Text */}
      <div className="relative text-center space-y-2">
        <h3 className="text-xl font-bold text-foreground transition-colors group-hover:text-primary">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[200px] leading-relaxed">
          {description}
        </p>
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/20" />
      </div>
    </button>
  );
};