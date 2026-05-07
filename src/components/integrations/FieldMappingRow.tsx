import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Plus, X, AlertTriangle } from "lucide-react";

export interface FieldOption {
  key: string;
  label: string;
  isCustom: boolean;
}

interface Props {
  rowLabel: string;
  values: string[];
  options: FieldOption[];
  hint?: string;
  onChange: (next: string[]) => void;
}

export function FieldMappingRow({ rowLabel, values, options, hint, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const optionByKey = new Map(options.map((o) => [o.key, o] as const));
  const remainingOptions = options.filter((o) => !values.includes(o.key));
  remainingOptions.sort((a, b) => {
    if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
    return a.label.localeCompare(b.label);
  });

  function addKey(key: string) {
    if (values.includes(key)) return;
    onChange([...values, key]);
    setOpen(false);
  }
  function removeKey(key: string) {
    onChange(values.filter((v) => v !== key));
  }

  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start py-2">
      <div className="pt-1.5">
        <div className="text-sm font-medium">{rowLabel}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {values.length === 0 && (
          <span className="text-sm text-muted-foreground italic">(none)</span>
        )}
        {values.map((key) => {
          const opt = optionByKey.get(key);
          const label = opt?.label ?? key;
          const flavor = opt ? (opt.isCustom ? "custom" : "native") : "unknown";
          return (
            <Badge
              key={key}
              variant={opt ? "secondary" : "destructive"}
              className={cn(
                "gap-1 pr-1",
                !opt && "border-yellow-500 bg-yellow-50 text-yellow-900 hover:bg-yellow-100"
              )}
            >
              {!opt && <AlertTriangle className="h-3 w-3" />}
              <span className="font-medium">{label}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-60">{flavor}</span>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                className="ml-1 rounded-sm hover:bg-black/10 p-0.5"
                onClick={() => removeKey(key)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Search fields..." />
              <CommandList>
                <CommandEmpty>No matching fields.</CommandEmpty>
                <CommandGroup>
                  {remainingOptions.map((o) => (
                    <CommandItem
                      key={o.key}
                      value={`${o.label} ${o.key}`}
                      onSelect={() => addKey(o.key)}
                    >
                      <span className="flex-1">{o.label}</span>
                      <span className="text-[10px] uppercase tracking-wide opacity-60 ml-2">
                        {o.isCustom ? "custom" : "native"}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
