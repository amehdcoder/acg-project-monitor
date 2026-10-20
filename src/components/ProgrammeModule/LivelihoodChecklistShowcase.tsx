import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ClipboardList, Coins, Users, HeartPulse, ShieldAlert, CloudLightning, MapPin, Rocket, Shield, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSESSMENT_SECTIONS, DOMAIN_WEIGHTS, type AssessmentField } from "@/lib/programmeModule/livelihood";

const ICONS: Record<string, typeof Coins> = {
  economic: Coins, dependency: Users, disease: HeartPulse, exclusion: ShieldAlert,
  shocks: CloudLightning, access: MapPin, readiness: Rocket, protection: Shield, preference: Compass,
};

function FieldRow({ f, i }: { f: AssessmentField; i: number }) {
  return (
    <li className="animate-fade-in rounded-lg border border-border/60 bg-background/60 p-3" style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">{i + 1}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium leading-snug">{f.label}</p>
          {f.hint && <p className="text-xs italic text-muted-foreground">{f.hint}</p>}
          {f.type === "select" && f.options && (
            <div className="space-y-1">
              {f.options.map((o) => (
                <div key={o.value} className="flex items-center gap-2 text-xs">
                  <span className="w-44 shrink-0 truncate text-muted-foreground sm:w-60" title={o.label}>{o.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-destructive transition-transform duration-700" style={{ width: `${Math.max(4, o.weight * 100)}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono tabular-nums text-muted-foreground">{Math.round(o.weight * 100)}</span>
                </div>
              ))}
            </div>
          )}
          {f.type === "number" && (
            <Badge variant="secondary" className="text-[11px]">Count · fully vulnerable at {f.max ?? "—"}{f.invert ? " (inverted)" : ""}</Badge>
          )}
          {f.type === "text" && <Badge variant="outline" className="text-[11px]">Free-text observation</Badge>}
        </div>
      </div>
    </li>
  );
}

export default function LivelihoodChecklistShowcase() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(ASSESSMENT_SECTIONS[0]?.key ?? null);
  const total = ASSESSMENT_SECTIONS.reduce((n, s) => n + s.fields.length, 0);

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="relative flex w-full items-center gap-3 bg-gradient-to-r from-primary/10 via-accent/10 to-transparent p-4 text-left">
        <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <span className="absolute inset-0 animate-ping rounded-xl bg-primary/30" style={{ animationDuration: "2.5s" }} />
          <ClipboardList className="relative h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Needs Assessment checklist</span>
          <span className="block text-xs text-muted-foreground">
            {ASSESSMENT_SECTIONS.length} sections · {total} questions used to score and target livelihood beneficiaries
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open && (
        <div className="animate-fade-in space-y-4 p-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">How each domain weighs in the vulnerability score</p>
            <div className="flex h-3 overflow-hidden rounded-full">
              {Object.entries(DOMAIN_WEIGHTS).map(([k, w], i) => (
                <div key={k} title={`${k}: ${Math.round(w * 100)}%`} className="h-full bg-primary transition-all"
                  style={{ width: `${w * 100}%`, opacity: 1 - i * 0.13 }} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <nav className="flex gap-2 overflow-x-auto lg:flex-col">
              {ASSESSMENT_SECTIONS.map((s, i) => {
                const Icon = ICONS[s.key] ?? ClipboardList;
                const w = DOMAIN_WEIGHTS[s.key as keyof typeof DOMAIN_WEIGHTS];
                const on = active === s.key;
                return (
                  <button key={s.key} type="button" onClick={() => setActive(s.key)}
                    className={cn("animate-fade-in flex shrink-0 items-center gap-2 rounded-lg border p-2.5 text-left transition-all duration-300",
                      on ? "border-primary bg-primary/10 shadow-sm lg:translate-x-1" : "border-border hover:bg-muted/50")}
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}>
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {s.fields.length} questions{w ? ` · ${Math.round(w * 100)}% weight` : " · not scored"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            {ASSESSMENT_SECTIONS.filter((s) => s.key === active).map((s) => (
              <div key={s.key} className="animate-fade-in space-y-3">
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.intro}</p>
                </div>
                <ol className="space-y-2">
                  {s.fields.map((f, i) => <FieldRow key={f.name} f={f} i={i} />)}
                </ol>
                <p className="text-[11px] text-muted-foreground">Bars show how strongly each answer signals vulnerability (0 = none, 100 = most vulnerable).</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
