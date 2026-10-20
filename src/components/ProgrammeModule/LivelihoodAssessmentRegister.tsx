// Every registered beneficiary, ready for the Livelihood Needs Assessment.
// Visible whether or not a livelihood opportunity has been set up.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, Search, Users, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { readGate } from "@/lib/programmeModule/graduation";

interface Props {
  beneficiaries: BeneficiaryRow[];
  assessed: Map<string, { assessed_at?: string | null; created_at?: string | null } & Record<string, unknown>>;
  canAssess: boolean;
  onAssess: (b: BeneficiaryRow) => void;
  onOpen?: (b: BeneficiaryRow) => void;
}

const PAGE = 30;

export default function LivelihoodAssessmentRegister({ beneficiaries, assessed, canAssess, onAssess, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "done">("todo");
  const [limit, setLimit] = useState(PAGE);

  const doneCount = useMemo(() => beneficiaries.filter((b) => assessed.has(b.id)).length, [beneficiaries, assessed]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return beneficiaries.filter((b) => {
      const done = assessed.has(b.id);
      if (filter === "todo" && done) return false;
      if (filter === "done" && !done) return false;
      if (!s) return true;
      return [b.full_name, b.case_id, b.lga, b.ward].some((v) => String(v || "").toLowerCase().includes(s));
    });
  }, [beneficiaries, assessed, q, filter]);
  const pct = beneficiaries.length ? Math.round((doneCount / beneficiaries.length) * 100) : 0;

  return (
    <Card className="overflow-hidden animate-fade-in">
      <div className="space-y-3 border-b bg-primary/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Needs Assessment register
            </p>
            <p className="text-xs text-muted-foreground">
              Every beneficiary is eligible for livelihood mapping. Fill the form to score vulnerability and decide selection.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{doneCount}<span className="text-sm text-muted-foreground"> / {beneficiaries.length}</span></p>
            <p className="text-xs text-muted-foreground">assessed ({pct}%)</p>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, Case ID, LGA or ward" value={q}
              onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          </div>
          {([["todo", "Not assessed"], ["done", "Assessed"], ["all", "All"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"}
              onClick={() => { setFilter(k); setLimit(PAGE); }}>{l}</Button>
          ))}
        </div>
      </div>

      {beneficiaries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Users className="h-6 w-6" />
          No beneficiaries are registered in this project yet. Register a beneficiary to start the Needs Assessment.
        </div>
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          {filter === "todo" ? "Everyone matching has been assessed." : "No beneficiaries match."}
        </p>
      ) : (
        <ul className="divide-y">
          {rows.slice(0, limit).map((b, i) => {
            const a = assessed.get(b.id);
            const gate = readGate(b.profile || {});
            const when = a?.assessed_at || a?.created_at;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 animate-fade-in"
                style={{ animationDelay: `${Math.min(i, 15) * 30}ms`, animationFillMode: "both" }}>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  a ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  {a ? <CheckCircle2 className="h-4 w-4" /> : (b.full_name || "?").charAt(0).toUpperCase()}
                </div>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen?.(b)}>
                  <p className="truncate font-medium">{b.full_name || "Unnamed"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{b.case_id}</span>{b.lga ? ` · ${b.lga}` : ""}{b.ward ? ` · ${b.ward}` : ""}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  {gate.status === "selected" && <Badge>Selected</Badge>}
                  {gate.status === "not_selected" && <Badge variant="outline">Not selected</Badge>}
                  {a ? (
                    <Badge variant="secondary">Assessed{when ? ` ${new Date(when).toLocaleDateString()}` : ""}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Not assessed</Badge>
                  )}
                  {canAssess && (
                    <Button size="sm" variant={a ? "outline" : "default"} className="gap-1" onClick={() => onAssess(b)}>
                      <ClipboardCheck className="h-3.5 w-3.5" /> {a ? "Update" : "Fill form"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && (
        <div className="border-t p-3 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
            Show more ({rows.length - limit} remaining)
          </Button>
        </div>
      )}
    </Card>
  );
}
