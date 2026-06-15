// Owner / Co-owner tool to link a user to specific cascade options of a form
// (e.g. limit them to the "Jigawa" State). Assignments are saved to
// user_cascade_assignments and enforced by RLS (user_cascade_allows).
//
// Currently wired for the Bloomberg School Enrolment Validation form whose
// cascade source is the bloomberg_schools table (State -> LGA -> Ward ->
// Community -> School).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Check } from "lucide-react";
import { toast } from "sonner";
import { CASCADE_FIELDS, BLOOMBERG_FORM_ID, BLOOMBERG_FORM_NAME, type CascadeFieldKey } from "@/lib/bloomberg/definition";

interface Props {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

const FIELD_TINT: Record<CascadeFieldKey, string> = {
  state: "bg-blue-50 text-blue-700 border-blue-200 data-[on=true]:bg-blue-600 data-[on=true]:text-white",
  lga: "bg-emerald-50 text-emerald-700 border-emerald-200 data-[on=true]:bg-emerald-600 data-[on=true]:text-white",
  ward: "bg-violet-50 text-violet-700 border-violet-200 data-[on=true]:bg-violet-600 data-[on=true]:text-white",
  location: "bg-amber-50 text-amber-700 border-amber-200 data-[on=true]:bg-amber-600 data-[on=true]:text-white",
  school_key: "bg-rose-50 text-rose-700 border-rose-200 data-[on=true]:bg-rose-600 data-[on=true]:text-white",
};

type SchoolRow = Record<CascadeFieldKey, string | null> & { school_name?: string | null };

export default function CascadeAssignmentDialog({ userId, userName, open, onOpenChange, onSaved }: Props) {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [selected, setSelected] = useState<Record<CascadeFieldKey, Set<string>>>(() =>
    Object.fromEntries(CASCADE_FIELDS.map((f) => [f.key, new Set<string>()])) as Record<CascadeFieldKey, Set<string>>,
  );
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const all: SchoolRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase
          .from("bloomberg_schools")
          .select("state,lga,ward,location,school_key,school_name")
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        all.push(...(data as any));
        if (data.length < 1000) break;
      }
      setSchools(all);
      const lbl: Record<string, string> = {};
      all.forEach((s) => { if (s.school_key) lbl[s.school_key] = s.school_name || s.school_key; });
      setLabels(lbl);

      const { data: existing } = await supabase
        .from("user_cascade_assignments")
        .select("field_key, value")
        .eq("user_id", userId)
        .eq("form_id", BLOOMBERG_FORM_ID);
      const next = Object.fromEntries(CASCADE_FIELDS.map((f) => [f.key, new Set<string>()])) as Record<CascadeFieldKey, Set<string>>;
      (existing || []).forEach((r: any) => { if (next[r.field_key as CascadeFieldKey]) next[r.field_key as CascadeFieldKey].add(r.value); });
      setSelected(next);
      setLoading(false);
    })();
  }, [open, userId]);

  // Options at each level honour selections made at higher levels (true cascade).
  const optionsByField = useMemo(() => {
    const out: Record<CascadeFieldKey, { value: string; label: string }[]> = {} as any;
    const passes = (s: SchoolRow, upto: number) => {
      for (let i = 0; i < upto; i++) {
        const f = CASCADE_FIELDS[i].key;
        if (selected[f].size > 0 && !selected[f].has((s[f] ?? "").toString())) return false;
      }
      return true;
    };
    CASCADE_FIELDS.forEach((f, idx) => {
      const seen = new Map<string, string>();
      schools.forEach((s) => {
        if (!passes(s, idx)) return;
        const v = (s[f.key] ?? "").toString().trim();
        if (!v) return;
        seen.set(v, f.key === "school_key" ? (labels[v] || v) : v);
      });
      out[f.key] = [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    });
    return out;
  }, [schools, selected, labels]);

  const toggle = (field: CascadeFieldKey, value: string) => {
    setSelected((prev) => {
      const next = { ...prev, [field]: new Set(prev[field]) };
      if (next[field].has(value)) next[field].delete(value); else next[field].add(value);
      return next;
    });
  };

  const totalSelected = CASCADE_FIELDS.reduce((n, f) => n + selected[f.key].size, 0);

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from("user_cascade_assignments").delete().eq("user_id", userId).eq("form_id", BLOOMBERG_FORM_ID);
      const rows: any[] = [];
      CASCADE_FIELDS.forEach((f) => {
        selected[f.key].forEach((value) => {
          rows.push({
            user_id: userId, form_id: BLOOMBERG_FORM_ID, field_key: f.key, value,
            value_label: f.key === "school_key" ? (labels[value] || value) : value,
          });
        });
      });
      if (rows.length) {
        const { error } = await supabase.from("user_cascade_assignments").insert(rows);
        if (error) throw error;
      }
      toast.success(totalSelected ? `Cascade scope saved for ${userName}` : `Cascade scope cleared for ${userName}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Could not save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Cascade Scope — {userName}
          </DialogTitle>
          <DialogDescription>
            Link this user to specific options of <strong>{BLOOMBERG_FORM_NAME}</strong>. They will only see the
            options you select and everything beneath them. Leave a level empty to allow all of its options.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading cascade options…
          </div>
        ) : (
          <div className="space-y-4">
            {CASCADE_FIELDS.map((f) => {
              const opts = optionsByField[f.key] || [];
              return (
                <div key={f.key}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{f.label}</span>
                    {selected[f.key].size > 0 && (
                      <Badge variant="secondary" className="h-5 text-[10px]">{selected[f.key].size} selected</Badge>
                    )}
                  </div>
                  {opts.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground/60">No options available for the selections above.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {opts.map((o) => {
                        const on = selected[f.key].has(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            data-on={on}
                            onClick={() => toggle(f.key, o.value)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${FIELD_TINT[f.key]}`}
                          >
                            {on && <Check className="h-3 w-3" />}
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save scope ({totalSelected})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
