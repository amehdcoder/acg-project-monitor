/**
 * Unique Signals (unsupervised ML) — evidence never reported anywhere else in
 * the LGA or State on that field day. Isolation-forest anomaly scoring plus
 * peer-group rarity, rendered as a ranked, colour-graded intelligence feed.
 */
import { useMemo, useState } from "react";
import { Fingerprint, Radar, Sparkles, Star, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import detectUniqueSignals, { type UniqueSignal } from "@/lib/isc/uniqueSignals";
import type { ChartDrillSpec } from "./ChartRecordsDialog";

type Row = Record<string, unknown>;

const SCOPE_STYLE: Record<UniqueSignal["scope"], { cls: string; accent: string }> = {
  State: { cls: "bg-rose-50 text-rose-700 border-rose-300", accent: "#E11D48" },
  LGA: { cls: "bg-amber-50 text-amber-700 border-amber-300", accent: "#F59E0B" },
  Ward: { cls: "bg-sky-50 text-sky-700 border-sky-300", accent: "#0EA5E9" },
};

export default function UniqueSignalsTab({
  parents, drill,
}: { parents: Row[]; drill: (spec: ChartDrillSpec) => void }) {
  const [floor, setFloor] = useState(55);
  const result = useMemo(
    () => detectUniqueSignals(parents, { minUniqueness: floor }),
    [parents, floor],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, UniqueSignal[]>();
    result.signals.forEach((sg) => {
      const a = m.get(sg.day);
      if (a) a.push(sg); else m.set(sg.day, [sg]);
    });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [result.signals]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-gradient-to-r from-violet-500/10 via-sky-500/5 to-transparent p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Sparkles className="h-4 w-4 text-violet-600" />
          Machine-learned unique evidence
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          An isolation forest ({result.trees} trees, {result.features} supervisory features) was trained on
          this campaign's own {result.scanned.toLocaleString()} checklists, then combined with peer-group
          rarity to isolate what a community reported that <strong>no other community in its LGA or State
          reported that day</strong>. Findings common to more than 40% of visits are discarded as decoys.
        </p>
        {!!result.suppressed.length && (
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            Ignored as loud, campaign-wide noise: {result.suppressed.join(" · ")}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <span className="whitespace-nowrap text-[11px] font-medium">Uniqueness floor: {floor}</span>
          <Slider
            value={[floor]}
            onValueChange={(v) => setFloor(v[0])}
            min={30}
            max={95}
            step={5}
            className="max-w-[240px]"
          />
          <Badge variant="outline" className="text-[10px]">
            {result.signals.length} signals retained
          </Badge>
        </div>
      </div>

      {!result.signals.length ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-[12px] text-muted-foreground">
          <Radar className="mx-auto mb-2 h-5 w-5" />
          No community reported anything statistically unique above this threshold. Lower the floor to widen the scan.
        </div>
      ) : (
        byDay.map(([day, list]) => (
          <div key={day} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {day}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {list.length} unique signal{list.length === 1 ? "" : "s"}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {list.map((sg) => {
                const st = SCOPE_STYLE[sg.scope];
                return (
                  <div
                    key={`${sg.id}-${sg.findings.join("|")}`}
                    className="overflow-hidden rounded-lg border bg-card"
                    style={{ borderLeft: `4px solid ${st.accent}` }}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
                      <Fingerprint className="h-3.5 w-3.5" style={{ color: st.accent }} />
                      <span className="text-[12px] font-semibold">{sg.community}</span>
                      <Badge variant="outline" className={`text-[9.5px] ${st.cls}`}>
                        unique in {sg.scope}
                      </Badge>
                      {sg.firstEver && (
                        <Badge className="border-emerald-300 bg-emerald-50 text-[9.5px] text-emerald-700">
                          <Star className="mr-0.5 h-3 w-3" /> first ever
                        </Badge>
                      )}
                      <span className="ml-auto text-[11px] font-bold" style={{ color: st.accent }}>
                        {sg.uniqueness}
                      </span>
                    </div>

                    <div className="space-y-2 px-3 py-2">
                      <p className="text-[10.5px] text-muted-foreground">
                        {sg.ward} · {sg.lga} · {sg.state} — captured by {sg.monitor}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {sg.findings.map((f) => (
                          <span
                            key={f}
                            className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            style={{ borderColor: st.accent, color: st.accent }}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] leading-relaxed">{sg.interpretation}</p>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">Peer rarity</p>
                          <Progress value={sg.rarity * 100} className="h-1.5" />
                        </div>
                        <div>
                          <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
                            Isolation-forest anomaly
                          </p>
                          <Progress value={sg.isolation * 100} className="h-1.5" />
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-full text-[10.5px]"
                        onClick={() =>
                          drill({
                            title: `Unique signal — ${sg.community}`,
                            category: sg.findings.join(", "),
                            color: st.accent,
                            rows: sg.rows,
                            note: sg.interpretation,
                          })
                        }
                      >
                        <TrendingUp className="mr-1 h-3.5 w-3.5" /> View the records behind this signal
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
