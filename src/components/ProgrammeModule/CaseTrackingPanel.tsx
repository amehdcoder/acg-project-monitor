// Case tracking — the journey of every case-search case, from the CDD's
// finding in the community through clinician review and lesion staging to
// registration at a facility with a Case ID.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, Circle, CircleDot, XCircle, Route, Download, Hospital, BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import { conditionLabel } from "@/lib/programmeModule/lesionVision";
import {
  CASE_STATUS_LABEL, CASE_STATUS_TONE, caseJourney, useCaseBeneficiaries,
  type CaseJourneyStep, type PotentialCaseRow,
} from "@/lib/programmeModule/cddCaseSearch";

interface Props {
  cases: PotentialCaseRow[];
  facilityName: (id?: string | null) => string;
  cddName: (id?: string | null) => string;
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STEP_ICON: Record<CaseJourneyStep["state"], typeof Circle> = {
  done: CheckCircle2,
  current: CircleDot,
  blocked: XCircle,
  waiting: Circle,
};

const STEP_COLOR: Record<CaseJourneyStep["state"], string> = {
  done: "text-emerald-600",
  current: "text-amber-600",
  blocked: "text-rose-600",
  waiting: "text-muted-foreground",
};

const CaseTrackingPanel = ({ cases, facilityName, cddName }: Props) => {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState("");
  const codes = useCaseBeneficiaries(cases);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return cases
      .filter((c) => (status === "all" || c.status === status)
        && (!q || [c.full_name, c.community, c.ward, c.lga, codes[c.beneficiary_id || ""]]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))))
      .map((c) => ({
        c,
        code: c.beneficiary_id ? codes[c.beneficiary_id] || null : null,
        steps: caseJourney(c, { cddName, facilityName, caseCode: codes[c.beneficiary_id || ""] }),
      }))
      .sort((a, b) => String(b.c.created_at).localeCompare(String(a.c.created_at)));
  }, [cases, term, status, codes, cddName, facilityName]);

  const exportCsv = () => {
    const head = [
      "Name", "Condition", "Community", "Origin facility", "CDD", "Found on",
      "Reviewed on", "Confirmed stage", "Referred to", "Accepted on", "Case ID", "Current status",
    ];
    const lines = rows.map(({ c, code }) => [
      c.full_name, conditionLabel(c.confirmed_condition || c.condition), c.community || "",
      facilityName(c.facility_id), cddName(c.cdd_id), c.search_date || "",
      c.confirmed_at ? c.confirmed_at.slice(0, 10) : "", c.confirmed_stage_label || "",
      c.referred_to_facility_id ? facilityName(c.referred_to_facility_id) : "",
      c.accepted_at ? c.accepted_at.slice(0, 10) : "", code || "",
      CASE_STATUS_LABEL[c.status],
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `case-tracking-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Route className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-foreground">Case tracking</h4>
        <Badge variant="outline">{rows.length}</Badge>
        <div className="flex-1" />
        <Input
          className="h-9 w-[200px]" placeholder="Name, community or Case ID…"
          value={term} onChange={(e) => setTerm(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CASE_STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No case to track yet. Every case a CDD records appears here with its full journey.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ c, code, steps }) => {
            const open = openId === c.id;
            return (
              <div key={c.id} className="rounded-lg border border-border">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
                  onClick={() => setOpenId(open ? "" : c.id)}
                >
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{c.full_name}</span>
                      <Badge variant="outline" className={cn("border", toneClasses[CASE_STATUS_TONE[c.status]])}>
                        {CASE_STATUS_LABEL[c.status]}
                      </Badge>
                      <Badge variant="outline">{conditionLabel(c.confirmed_condition || c.condition)}</Badge>
                      {code && (
                        <Badge variant="outline" className="gap-1">
                          <BadgeCheck className="h-3 w-3" /> {code}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Hospital className="mr-1 inline h-3 w-3" />
                      {facilityName(c.facility_id)}
                      {c.referred_to_facility_id && ` → ${facilityName(c.referred_to_facility_id)}`}
                      {" · found "}{fmt(c.search_date)}{" by "}{cddName(c.cdd_id)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {steps.filter((s) => s.state === "done").length}/{steps.length} steps
                  </span>
                </button>

                {open && (
                  <ol className="space-y-3 border-t border-border p-4">
                    {steps.map((s) => {
                      const Icon = STEP_ICON[s.state];
                      return (
                        <li key={s.key} className="flex gap-3">
                          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", STEP_COLOR[s.state])} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {s.label}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">{fmt(s.at)}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{s.detail}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default CaseTrackingPanel;
