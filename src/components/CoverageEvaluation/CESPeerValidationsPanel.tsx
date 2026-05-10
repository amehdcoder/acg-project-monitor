import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, XCircle, AlertTriangle, Footprints, FileSearch,
  Loader2, ShieldCheck, ChevronDown, ChevronUp, User as UserIcon,
} from "lucide-react";

type Verdict = "confirmed" | "disputed" | "needs_resample";
type Mode = "revisit" | "desk_review";

export interface PeerValidationRow {
  id: string;
  survey_id: string;
  validator_id: string;
  mode: Mode;
  verdict: Verdict;
  households_revisited: number | null;
  households_agreed: number | null;
  agreement_pct: number | null;
  notes: string | null;
  created_at: string;
  validator_name?: string;
  validator_email?: string;
}

const verdictStyle: Record<Verdict, { label: string; cls: string; Icon: any }> = {
  confirmed:       { label: "Pass — confirmed",     cls: "bg-green-100 text-green-800 border-green-300", Icon: CheckCircle2 },
  disputed:        { label: "Fail — disputed",      cls: "bg-amber-100 text-amber-800 border-amber-300", Icon: AlertTriangle },
  needs_resample:  { label: "Fail — needs resample", cls: "bg-red-100 text-red-800 border-red-300",      Icon: XCircle },
};

interface Props {
  surveyId: string;
  /** show as a collapsible block (default true). If false, always expanded. */
  collapsible?: boolean;
  /** Optional — auto-refresh in realtime when validations are added. */
  realtime?: boolean;
}

export default function CESPeerValidationsPanel({ surveyId, collapsible = true, realtime = true }: Props) {
  const [rows, setRows] = useState<PeerValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!collapsible);

  const load = async () => {
    setLoading(true);
    const { data: pv } = await supabase
      .from("ces_peer_validations" as any)
      .select("*")
      .eq("survey_id", surveyId)
      .order("created_at", { ascending: false });
    const list = ((pv as any) ?? []) as PeerValidationRow[];

    // Resolve validator names
    const ids = Array.from(new Set(list.map(r => r.validator_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles" as any)
        .select("user_id, display_name, full_name, email")
        .in("user_id", ids);
      const map = new Map((profs as any[] ?? []).map(p => [p.user_id, p]));
      list.forEach(r => {
        const p: any = map.get(r.validator_id);
        if (p) {
          r.validator_name = p.display_name || p.full_name || p.email || r.validator_id.slice(0, 8);
          r.validator_email = p.email;
        }
      });
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [surveyId]);

  useEffect(() => {
    if (!realtime) return;
    const ch = supabase
      .channel(`pv-${surveyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "ces_peer_validations", filter: `survey_id=eq.${surveyId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [surveyId, realtime]);

  const passes = rows.filter(r => r.verdict === "confirmed").length;
  const fails  = rows.length - passes;

  return (
    <div className="border rounded-md bg-card">
      <div
        className={`flex items-center justify-between gap-2 p-2 ${collapsible ? "cursor-pointer hover:bg-muted/40" : ""}`}
        onClick={() => collapsible && setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-semibold">Peer validations</span>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          {rows.length > 0 && (
            <>
              <Badge className="bg-green-600 text-white text-[10px]">{passes} pass</Badge>
              {fails > 0 && <Badge variant="destructive" className="text-[10px]">{fails} fail</Badge>}
            </>
          )}
        </div>
        {collapsible && (open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />)}
      </div>

      {open && (
        <div className="border-t divide-y">
          {loading && <div className="p-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
          {!loading && rows.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">No peer validations recorded yet for this survey.</p>
          )}
          {!loading && rows.map(r => {
            const v = verdictStyle[r.verdict];
            const ModeIcon = r.mode === "revisit" ? Footprints : FileSearch;
            return (
              <div key={r.id} className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${v.cls}`}>
                    <v.Icon className="h-3 w-3 mr-1" />{v.label}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    <ModeIcon className="h-3 w-3 mr-1" />
                    {r.mode === "revisit" ? "Revisit" : "Desk review"}
                  </Badge>
                  {r.agreement_pct != null && (
                    <Badge variant="outline" className="text-[10px]">{r.agreement_pct}% agreement</Badge>
                  )}
                  {r.households_revisited != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {r.households_agreed ?? 0}/{r.households_revisited} households
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1 min-w-0">
                    <UserIcon className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {r.validator_name || r.validator_id.slice(0, 8)}
                      {r.validator_email && r.validator_name !== r.validator_email
                        ? ` (${r.validator_email})` : ""}
                    </span>
                  </div>
                  <span className="flex-shrink-0">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                {r.notes && (
                  <p className="text-xs bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap">{r.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
