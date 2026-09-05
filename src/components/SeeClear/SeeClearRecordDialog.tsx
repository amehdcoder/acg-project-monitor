/**
 * See Clear — single record view.
 *
 * Shows the structured monitoring answers plus EVERY extra question that exists
 * on the live KoboToolbox form but has no dedicated column in the database.
 * Those "unmapped" questions are resolved dynamically from the schema snapshot
 * (`seeclear_kobo_schema`) and rendered with their real Kobo labels and choice
 * labels, so a question added in Kobo shows up here immediately after a sync.
 */
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";
import type { SchemaField } from "@/hooks/useSeeClearKoboSchema";

export interface SeeClearRecordLike {
  id: string;
  facility_name?: string | null;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  community?: string | null;
  facility_level?: string | null;
  ownership?: string | null;
  date_of_visit?: string | null;
  readiness_score?: number | null;
  status?: string | null;
  critical_gap?: string | null;
  source?: string | null;
  kobo_payload?: Record<string, unknown> | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  record: SeeClearRecordLike | null;
  fields: SchemaField[];
  choices: Record<string, { value: string; label: string }[]>;
}

/** Columns the database already models — everything else is "unmapped". */
const MAPPED = new Set([
  "id", "monitor_id", "date_of_visit", "state", "lga", "ward", "community", "facility_name",
  "facility_level", "ownership", "functional_status", "is_functional", "staff_on_duty",
  "focal_name", "focal_designation", "focal_phone", "team_members", "gps_lat", "gps_lng",
  "gps_accuracy", "general", "hr_score", "hr_max", "infra_score", "infra_max", "equipment",
  "equip_score", "equip_max", "essential_supplies", "complete_records", "referral_compliance",
  "referrals_made", "referrals_completed", "readiness_score", "overall_score", "evidence",
  "challenges", "recommendations", "remarks", "officer_signature", "incharge_signature",
  "critical_gap", "status", "created_at", "updated_at", "submission_uuid", "source",
]);

const META_PREFIXES = ["_", "formhub/", "meta/", "__"];

/** Kobo stores grouped answers as `group/question` — index both spellings. */
function flattenPayload(payload: Record<string, unknown> | null | undefined) {
  const flat = new Map<string, unknown>();
  const walk = (obj: Record<string, unknown>, prefix = "") => {
    for (const [k, v] of Object.entries(obj || {})) {
      const full = prefix ? `${prefix}/${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, full);
      } else {
        flat.set(full, v);
        flat.set(k, v);
        const leaf = full.split("/").pop();
        if (leaf) flat.set(leaf, v);
      }
    }
  };
  walk((payload as Record<string, unknown>) || {});
  return flat;
}

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

export default function SeeClearRecordDialog({ open, onClose, record, fields, choices }: Props) {
  const flat = useMemo(() => flattenPayload(record?.kobo_payload), [record]);

  const unmapped = useMemo(() => {
    if (!record) return [] as { name: string; label: string; group: string | null; value: string }[];
    const seen = new Set<string>();
    const out: { name: string; label: string; group: string | null; value: string }[] = [];

    const labelValue = (f: SchemaField, raw: unknown): string => {
      const list = f.list_name ? choices[f.list_name] : undefined;
      const one = (v: unknown) => {
        const s = String(v);
        return list?.find((c) => c.value === s)?.label ?? s;
      };
      if (Array.isArray(raw)) return raw.map(one).join(", ");
      if (typeof raw === "string" && list && raw.includes(" ")) return raw.split(/\s+/).map(one).join(", ");
      return one(raw);
    };

    // 1) Questions described by the live Kobo schema.
    for (const f of fields) {
      if (MAPPED.has(f.name) || seen.has(f.name)) continue;
      const raw = flat.get(f.name);
      if (isEmpty(raw)) continue;
      seen.add(f.name);
      out.push({ name: f.name, label: f.label || f.name, group: f.group, value: labelValue(f, raw) });
    }

    // 2) Anything in the payload the schema does not describe yet (fallback so
    //    nothing the field team submitted is ever silently hidden).
    for (const [k, v] of flat.entries()) {
      const leaf = k.split("/").pop() || k;
      if (seen.has(leaf) || MAPPED.has(leaf) || isEmpty(v)) continue;
      if (META_PREFIXES.some((p) => k.startsWith(p) || leaf.startsWith(p))) continue;
      if (fields.some((f) => f.name === leaf)) continue;
      seen.add(leaf);
      out.push({ name: leaf, label: leaf.replace(/_/g, " "), group: null, value: Array.isArray(v) ? v.join(", ") : String(v) });
    }
    return out;
  }, [record, fields, choices, flat]);

  const grouped = useMemo(() => {
    const g = new Map<string, typeof unmapped>();
    for (const u of unmapped) {
      const key = u.group || "Additional Kobo questions";
      g.set(key, [...(g.get(key) || []), u]);
    }
    return [...g.entries()];
  }, [unmapped]);

  if (!record) return null;
  const core: [string, string][] = [
    ["Facility", record.facility_name || "—"],
    ["State / LGA", `${record.state || "—"} / ${record.lga || "—"}`],
    ["Ward / Community", `${record.ward || "—"} / ${record.community || "—"}`],
    ["Level", record.facility_level || "—"],
    ["Ownership", record.ownership || "—"],
    ["Date of visit", record.date_of_visit || "—"],
    ["Readiness", record.readiness_score != null ? `${Number(record.readiness_score).toFixed(0)}%` : "—"],
    ["Critical gap", record.critical_gap || "None recorded"],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {record.facility_name || "Monitoring record"}
            <Badge variant="secondary" className="capitalize">{record.status || "—"}</Badge>
            {record.source && <Badge variant="outline" className="capitalize">{record.source}</Badge>}
          </DialogTitle>
          <DialogDescription>Full checklist answers, including questions added on the Kobo form.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {core.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-muted/30 p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="text-sm font-medium capitalize text-foreground">{v}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <h4 className="text-sm font-semibold text-foreground">Kobo questions &amp; answers</h4>
              <Badge variant="secondary">{unmapped.length}</Badge>
            </div>
            {unmapped.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No extra Kobo answers on this record.
              </p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="mb-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {items.map((u) => (
                      <div key={u.name} className="flex flex-wrap items-start justify-between gap-2 p-2.5">
                        <span className="text-xs text-muted-foreground">{u.label}</span>
                        <span className="text-sm font-medium text-foreground">{u.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
