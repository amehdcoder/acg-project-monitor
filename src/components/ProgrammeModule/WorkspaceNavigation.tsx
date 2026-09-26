import type { LucideIcon } from "lucide-react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type WorkspaceView =
  | "brain"
  | "guide"
  | "dashboard" | "records" | "journey" | "facility" | "followups" | "households"
  | "clusters" | "network" | "risk" | "casesearch" | "livelihood" | "safeguarding"
  | "safeguarding_dashboard" | "team" | "exchange";

export interface WorkspaceNavItem {
  key: WorkspaceView;
  label: string;
  description: string;
  icon: LucideIcon;
  show: boolean;
}

export interface WorkspaceNavGroup {
  label: string;
  items: WorkspaceNavItem[];
}

interface Props {
  groups: WorkspaceNavGroup[];
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  administration?: React.ReactNode;
}

const WorkspaceNavigation = ({ groups, view, onViewChange, administration }: Props) => {
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.show) }))
    .filter((group) => group.items.length > 0);
  const active = visibleGroups.flatMap((group) => group.items).find((item) => item.key === view);

  return (
    <div className="overflow-hidden rounded-lg border border-health-blue/20 bg-card shadow-soft">
      <div className="flex min-h-16 flex-col gap-3 border-b border-health-blue/15 bg-health-surface px-3 py-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-[260px]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-health-blue text-primary-foreground">
            {active ? <active.icon className="h-5 w-5" /> : <SlidersHorizontal className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Current workspace</p>
            <p className="truncate font-report-display text-sm font-bold text-health-ink">{active?.label || "Select workspace"}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-wrap gap-1.5" aria-label="Beneficiary records sections">
          {visibleGroups.map((group) => {
            const selected = group.items.some((item) => item.key === view);
            const first = group.items[0];
            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={selected ? "default" : "ghost"}
                    size="sm"
                    className={cn("justify-between gap-2", !selected && "text-health-ink")}
                  >
                    {group.label}<ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-2">
                  <DropdownMenuLabel className="px-2 text-[10px] uppercase text-muted-foreground">{group.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {group.items.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      onSelect={() => onViewChange(item.key)}
                      className={cn("gap-3 rounded-md p-2.5", item.key === view && "bg-health-blue/10 text-health-blue")}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-health-blue/10 text-health-blue">
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="block text-xs font-normal text-muted-foreground">{item.description}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  {!first && <DropdownMenuItem disabled>No sections available</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
        {administration}
      </div>
      {active && <p className="px-4 py-2 text-xs text-muted-foreground">{active.description}</p>}
    </div>
  );
};

export default WorkspaceNavigation;