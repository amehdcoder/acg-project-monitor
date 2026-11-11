import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { communityRisk, type CommunityRiskInput } from "@/lib/microplanning/communityRisk";

export default function CommunityRiskBadge({ entry }: { entry: CommunityRiskInput }) {
  const risk = communityRisk(entry);
  const tone = risk.band === "Critical" || risk.band === "High" ? "text-destructive" : risk.band === "Moderate" ? "text-status-warning" : risk.band === "Low" ? "text-status-success" : "text-muted-foreground";
  const value = risk.score === null ? `${risk.minimum}–${risk.maximum}` : String(risk.score);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`h-auto min-h-8 px-1.5 text-[11px] gap-1 ${tone}`} aria-label={`Security risk ${value} out of 100, ${risk.band}`}>
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="text-left whitespace-normal"><strong className="tabular-nums">{value}/100</strong> · {risk.band}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] text-xs space-y-3">
        <div className="font-semibold">Security risk · {risk.band}</div>
        <dl className="space-y-1.5">
          {risk.parts.map(part => <div key={part.label} className="flex justify-between gap-3"><dt>{part.label}</dt><dd className="tabular-nums">{part.points === null ? "Not recorded" : `${part.points} / ${part.max}`}</dd></div>)}
        </dl>
        <p className="text-muted-foreground">Security: cleared 0, partial 25, not cleared 50. Access: accessible 0, seasonal 15, hard to reach 25, inaccessible 30. CDD: Named CDD present 0; Explicit gap (no usable CDD data) 20.</p>
        <p className="text-muted-foreground">Low 0–24 · Moderate 25–49 · High 50–74 · Critical 75–100. Missing security or accessibility shows a possible range, not a confirmed score.</p>
        <p className="font-medium">Local planning index only. Not a threat forecast or permission to deploy teams.</p>
      </PopoverContent>
    </Popover>
  );
}