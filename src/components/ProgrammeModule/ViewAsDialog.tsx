import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Hospital, Stethoscope, Pill, FileText, ClipboardList, Users, Check, MapPin, Layers, Sparkles, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIEW_AS_ROLES, viewAsLabel, type ViewAsConfig, type ViewAsRole } from "@/lib/programmeModule/viewAs";
import type { FacilityRow } from "@/lib/programmeModule/facilities";

const ICONS: Record<ViewAsRole, typeof Eye> = {
  facility_focal: Hospital, clinician: Stethoscope, pharmacist: Pill,
  records_officer: FileText, programme_officer: ClipboardList, team_member: Users, safeguarding_officer: ShieldCheck,
};
const TONES: Record<ViewAsRole, string> = {
  facility_focal: "bg-health-teal/15 text-health-teal",
  clinician: "bg-primary/15 text-primary",
  pharmacist: "bg-accent text-accent-foreground",
  records_officer: "bg-secondary text-secondary-foreground",
  programme_officer: "bg-primary/10 text-primary",
  team_member: "bg-muted text-foreground",
  safeguarding_officer: "bg-destructive/10 text-destructive",
};
const ALL = "__all";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  components: { key: string; label: string }[];
  facilities: FacilityRow[];
  states: string[];
  initial?: ViewAsConfig | null;
  onApply: (v: ViewAsConfig) => void;
}

export default function ViewAsDialog({ open, onOpenChange, components, facilities, states, initial, onApply }: Props) {
  const [role, setRole] = useState<ViewAsRole>(initial?.role || "facility_focal");
  const [picked, setPicked] = useState<string[]>(initial?.components || []);
  const [state, setState] = useState<string>(initial?.state || ALL);
  const [facilityId, setFacilityId] = useState<string>(initial?.facilityId || ALL);
  const needsFacility = VIEW_AS_ROLES.find((r) => r.key === role)?.needsFacility;
  const facilityChoices = useMemo(() => facilities.filter((f) => state === ALL || (f.state || "").toLowerCase() === state.toLowerCase()), [facilities, state]);
  const ready = !needsFacility || facilityId !== ALL;
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const apply = () => {
    if (!ready) return;
    onApply({ role, components: picked, state: state === ALL ? undefined : state, facilityId: facilityId === ALL ? undefined : facilityId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto p-0">
        <div className="bg-gradient-to-br from-primary to-health-teal p-6 text-primary-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl"><Eye className="h-5 w-5" /> View as another user</DialogTitle>
            <DialogDescription className="text-primary-foreground/85">See the Longitudinal Beneficiary Records exactly as they would — same menus, dashboards, components and records. Nobody's real access changes.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-6 p-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold">1 · Who do you want to view as?</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {VIEW_AS_ROLES.map((r) => {
                const Icon = ICONS[r.key];
                const on = role === r.key;
                return (
                  <button key={r.key} type="button" onClick={() => setRole(r.key)} aria-pressed={on}
                    className={cn("group relative rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card",
                      on ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                    {on && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                    <span className={cn("mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg", TONES[r.key])}><Icon className="h-5 w-5" /></span>
                    <p className="font-semibold">{r.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.hint}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> 2 · Components</h3>
            <p className="mb-3 text-xs text-muted-foreground">Pick one or more. Leave all off to show every component this role may see.</p>
            <div className="flex flex-wrap gap-2">
              {components.map((c) => {
                const on = picked.includes(c.key);
                return (
                  <button key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={on}
                    className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                    {on && <Check className="mr-1 inline h-3.5 w-3.5" />}{c.label}
                  </button>
                );
              })}
              {!components.length && <p className="text-sm text-muted-foreground">No components configured yet.</p>}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" /> 3 · State</h3>
              <Select value={state} onValueChange={(v) => { setState(v); setFacilityId(ALL); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1400]">
                  <SelectItem value={ALL}>All states</SelectItem>
                  {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Hospital className="h-4 w-4" /> Health facility {needsFacility && <span className="text-destructive">*</span>}</h3>
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1400]">
                  {!needsFacility && <SelectItem value={ALL}>All facilities</SelectItem>}
                  {needsFacility && <SelectItem value={ALL} disabled>Choose a facility</SelectItem>}
                  {facilityChoices.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}{f.lga ? ` · ${f.lga}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          <div className="flex flex-col-reverse items-stretch justify-between gap-3 rounded-xl bg-muted p-4 sm:flex-row sm:items-center">
            <p className="text-sm">
              Viewing as <strong>{viewAsLabel({ role, components: picked })}</strong>
              {picked.length ? ` · ${picked.length} component${picked.length > 1 ? "s" : ""}` : " · all their components"}
              {state !== ALL ? ` · ${state}` : ""}
              {facilityId !== ALL ? ` · ${facilities.find((f) => f.id === facilityId)?.name || ""}` : ""}
            </p>
            <Button onClick={apply} disabled={!ready} className="gap-2"><Sparkles className="h-4 w-4" /> Start viewing</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ViewAsBanner({ config, facilityName, onChange, onExit }: { config: ViewAsConfig; facilityName?: string; onChange: () => void; onExit: () => void }) {
  return (
    <div role="status" className="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-health-teal/10 to-primary/10 p-3 shadow-card">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Eye className="h-4 w-4" />
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/30 motion-reduce:hidden" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Viewing as {viewAsLabel(config)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {config.components.length ? `${config.components.length} component(s)` : "All their components"}
          {config.state ? ` · ${config.state}` : ""}{facilityName ? ` · ${facilityName}` : ""} · preview only, nothing you do here changes their access
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onChange}>Change</Button>
      <Button size="sm" onClick={onExit} className="gap-1"><X className="h-4 w-4" /> Exit view</Button>
    </div>
  );
}
