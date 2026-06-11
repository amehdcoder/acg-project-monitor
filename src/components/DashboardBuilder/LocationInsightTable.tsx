import { useMemo } from "react";
import { extractLocationInfo, normalizeStateName, type LocationInfo } from "@/lib/locationUtils";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";

export type LocationLevel = "state" | "lga" | "ward" | "flhf" | "community" | "school";

const LEVEL_META: Record<LocationLevel, { label: string; field: keyof LocationInfo }> = {
  state: { label: "State", field: "state" },
  lga: { label: "LGA", field: "lga" },
  ward: { label: "Ward", field: "ward" },
  flhf: { label: "FLHF", field: "flhf" },
  community: { label: "Community / Settlement", field: "community" },
  school: { label: "School", field: "school" },
};

// Child level used to show "spread"/diversity within a row (McKinsey-style secondary metric)
const CHILD_LEVEL: Partial<Record<LocationLevel, LocationLevel>> = {
  state: "lga",
  lga: "ward",
  ward: "community",
  flhf: "community",
  community: "school",
};

interface Row {
  name: string;
  count: number;
  share: number; // 0..1 of total
  childCount: number; // distinct children
  geofenceOk: number; // submissions within geofence
}

// Heat scale: map a 0..1 intensity to a green→amber→red friendly insight gradient.
// We use HSL directly here (data viz heat ramp), which is acceptable for chart cells.
function heatColor(intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity));
  // 152 (emerald) -> 38 (amber) -> 4 (red)
  const hue = 152 - i * 148;
  return `hsl(${hue} 72% 46%)`;
}

interface Props {
  submissions: SubmissionRecord[];
  questions: any[];
  level: LocationLevel;
  title?: string;
}

const LocationInsightTable = ({ submissions, questions, level }: Props) => {
  const { rows, total, maxCount } = useMemo(() => {
    const synced = submissions.filter((s) => s.status === "sent");
    const meta = LEVEL_META[level] || LEVEL_META.state;
    const childLevel = CHILD_LEVEL[level];

    const buckets: Record<
      string,
      { count: number; children: Set<string>; geofenceOk: number }
    > = {};

    let totalCount = 0;
    for (const s of synced) {
      const loc = extractLocationInfo(s.data || {}, s.location as any);
      let key = (loc[meta.field] as string | null) || null;
      if (level === "state") key = normalizeStateName(key || s.state) || key;
      const name = (key && String(key).trim()) || "Unspecified";

      if (!buckets[name]) buckets[name] = { count: 0, children: new Set(), geofenceOk: 0 };
      buckets[name].count += 1;
      totalCount += 1;
      if (s.within_geofence) buckets[name].geofenceOk += 1;
      if (childLevel) {
        const childVal = loc[LEVEL_META[childLevel].field] as string | null;
        if (childVal && String(childVal).trim()) buckets[name].children.add(String(childVal).trim());
      }
    }

    const list: Row[] = Object.entries(buckets)
      .map(([name, b]) => ({
        name,
        count: b.count,
        share: totalCount ? b.count / totalCount : 0,
        childCount: b.children.size,
        geofenceOk: b.geofenceOk,
      }))
      .sort((a, b) => b.count - a.count);

    const max = list.reduce((m, r) => Math.max(m, r.count), 0);
    return { rows: list, total: totalCount, maxCount: max };
  }, [submissions, questions, level]);

  const meta = LEVEL_META[level] || LEVEL_META.state;
  const childLevel = CHILD_LEVEL[level];

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No {meta.label.toLowerCase()} data in submissions yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground">
            <th className="py-2.5 px-3 text-left font-semibold w-8">#</th>
            <th className="py-2.5 px-3 text-left font-semibold">{meta.label}</th>
            <th className="py-2.5 px-3 text-right font-semibold w-20">Records</th>
            <th className="py-2.5 px-3 text-left font-semibold w-[34%]">Share of total</th>
            {childLevel && (
              <th className="py-2.5 px-3 text-right font-semibold w-24">
                {LEVEL_META[childLevel].label}s
              </th>
            )}
            <th className="py-2.5 px-3 text-right font-semibold w-24">In-fence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const intensity = maxCount ? row.count / maxCount : 0;
            const color = heatColor(intensity);
            const fencePct = row.count ? Math.round((row.geofenceOk / row.count) * 100) : 0;
            return (
              <tr
                key={row.name}
                className={`border-b border-border/40 transition-colors hover:bg-primary/5 ${
                  i % 2 === 1 ? "bg-muted/30" : ""
                }`}
              >
                <td className="py-2 px-3 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="py-2 px-3 font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                </td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">
                  {row.count.toLocaleString()}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(row.share * 100, 2)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="w-11 text-right text-xs font-medium tabular-nums text-muted-foreground">
                      {(row.share * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
                {childLevel && (
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {row.childCount.toLocaleString()}
                  </td>
                )}
                <td className="py-2 px-3 text-right tabular-nums">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `hsl(${fencePct >= 80 ? 152 : fencePct >= 50 ? 38 : 4} 72% 46% / 0.15)`,
                      color: `hsl(${fencePct >= 80 ? 152 : fencePct >= 50 ? 38 : 4} 72% 38%)`,
                    }}
                  >
                    {fencePct}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0">
          <tr className="border-t-2 border-primary/30 bg-muted/60 font-semibold">
            <td className="py-2.5 px-3" />
            <td className="py-2.5 px-3">Total · {rows.length} {meta.label.toLowerCase()}s</td>
            <td className="py-2.5 px-3 text-right tabular-nums">{total.toLocaleString()}</td>
            <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">100%</td>
            {childLevel && <td className="py-2.5 px-3" />}
            <td className="py-2.5 px-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default LocationInsightTable;
