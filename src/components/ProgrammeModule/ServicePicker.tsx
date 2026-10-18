import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, Plus, Search, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const customKey = (componentKey: string) => `amehnities:custom-services:${componentKey}`;

const readCustom = (componentKey: string): string[] => {
  try { return JSON.parse(localStorage.getItem(customKey(componentKey)) || "[]"); } catch { return []; }
};

interface Props {
  componentKey: string;
  projectId: string;
  options: string[];
  /** Services previously recorded for this component (e.g. on this beneficiary). */
  recent?: string[];
  value: string;
  onChange: (v: string) => void;
}

/** Search the standard services, or type any new service and add it in one tap. */
const ServicePicker = ({ componentKey, projectId, options, recent = [], value, onChange }: Props) => {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState<string[]>(() => readCustom(componentKey));

  // Project-wide custom services, shared live with every project user.
  useEffect(() => {
    let alive = true;
    const db = supabase as unknown as { from: (t: string) => any };
    const load = async () => {
      const { data } = await db.from("project_custom_services").select("name").eq("project_id", projectId).eq("component_key", componentKey).order("created_at", { ascending: false });
      if (!alive || !data) return;
      const names = (data as { name: string }[]).map((r) => r.name);
      setCustom(names);
      // Publish anything previously saved only on this device.
      const local = readCustom(componentKey).filter((n) => !names.some((x) => x.toLowerCase() === n.toLowerCase()));
      if (local.length) {
        const { data: auth } = await supabase.auth.getUser();
        await db.from("project_custom_services").upsert(local.map((name) => ({ project_id: projectId, component_key: componentKey, name, created_by: auth.user?.id })), { ignoreDuplicates: true });
        try { localStorage.removeItem(customKey(componentKey)); } catch { /* ignore */ }
        void load();
      }
    };
    void load();
    const ch = supabase.channel(`custom-services-${projectId}-${componentKey}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "project_custom_services", filter: `project_id=eq.${projectId}` }, () => { void load(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [projectId, componentKey]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...custom, ...recent, ...options].filter((s) => {
      const k = s.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [custom, recent, options]);
  const customSet = useMemo(() => new Set([...custom, ...recent].map((s) => s.toLowerCase())), [custom, recent]);

  const q = query.trim().toLowerCase();
  const matches = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
  const exact = all.some((s) => s.toLowerCase() === q);

  const addCustom = () => {
    const name = query.trim().replace(/\s+/g, " ");
    if (!name) return;
    const next = [name, ...custom.filter((c) => c.toLowerCase() !== name.toLowerCase())];
    setCustom(next);
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as unknown as { from: (t: string) => any }).from("project_custom_services")
        .upsert({ project_id: projectId, component_key: componentKey, name, created_by: auth.user?.id }, { ignoreDuplicates: true });
      // Offline: keep on this device and publish on the next successful load.
      if (error && error.code !== "23505") { try { localStorage.setItem(customKey(componentKey), JSON.stringify([name, ...readCustom(componentKey)])); } catch { /* ignore */ } }
    })();
    onChange(name);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 rounded-xl border border-health-teal/40 bg-gradient-to-r from-health-teal/10 to-health-blue/10 px-3 py-2">
          <Check className="h-4 w-4 shrink-0 text-health-teal" />
          <span className="flex-1 text-sm font-semibold text-health-ink">{value}</span>
          <button type="button" onClick={() => onChange("")} aria-label="Clear service" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (matches.length && (exact || matches.length === 1)) { onChange(matches.find((s) => s.toLowerCase() === q) || matches[0]); setQuery(""); }
            else addCustom();
          }}
          placeholder="Search or type a new service…"
          className="h-11 pl-9"
        />
      </div>
      {q && !exact && (
        <button
          type="button"
          onClick={addCustom}
          className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-health-teal/50 bg-health-teal/5 px-3 py-2.5 text-left text-sm font-semibold text-health-teal transition-colors hover:bg-health-teal/10"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="flex-1">Add “{query.trim()}” as a new service</span>
          <Plus className="h-4 w-4" />
        </button>
      )}
      <div className="form-scroll flex max-h-48 flex-wrap gap-1.5 rounded-xl border border-border/60 p-2">
        {matches.length === 0 && <p className="w-full py-2 text-center text-xs text-muted-foreground">No match — add it as a new service above.</p>}
        {matches.map((s) => {
          const selected = s === value;
          const isCustom = customSet.has(s.toLowerCase());
          return (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setQuery(""); }}
              className={`rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                selected
                  ? "border-health-teal bg-health-teal text-primary-foreground"
                  : isCustom
                    ? "border-status-warning/40 bg-status-warning/10 text-health-ink hover:border-status-warning"
                    : "border-border bg-background text-health-ink hover:border-health-teal/60 hover:bg-health-teal/5"
              }`}
            >
              {isCustom && !selected && <Sparkles className="mr-1 inline h-3 w-3 text-status-warning" />}
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ServicePicker;
