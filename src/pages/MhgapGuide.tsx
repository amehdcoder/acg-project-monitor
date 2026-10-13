import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BookOpen, CalendarClock, HeartHandshake, MessageCircle, Pill, Printer, Search, Share2, ShieldAlert, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MHGAP_MODULES, ESSENTIAL_CARE, EMERGENCY_FLAGS, EMERGENCY_MEDS, type DrugRole, type MhgapModule } from "@/lib/programmeModule/mhgapEngine";

const hsl = (h: string, a = 1) => `hsl(${h} / ${a})`;
const ROLE: Record<DrugRole, string> = {
  first: "First choice", alternative: "Alternative", eps: "Side-effect (EPS) treatment", mood: "Mood stabiliser",
  emergency: "Emergency", withdrawal: "Withdrawal", relapse: "Relapse prevention", specialist: "Specialist only",
};
const WEIGHT: Record<string, string> = {
  core: "Core sign", symptom: "Symptom", severity: "Severity", red: "Urgent", caution: "Caution", exclude: "Rule out", override: "Override",
};

function matches(m: MhgapModule, q: string) {
  if (!q) return true;
  const hay = [m.label, m.short, m.summary, m.followUp, ...m.criteria.map((c) => c.text), ...m.psychosocial, ...m.messages, ...m.referWhen,
    ...m.regimens.flatMap((r) => [r.name, r.adult, r.sideEffects, r.cautions])].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function Section({ icon: Icon, title, hue, children }: { icon: typeof Pill; title: string; hue: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4" style={{ color: hsl(hue) }} />{title}</h4>
      {children}
    </div>
  );
}

export default function MhgapGuide() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [q, setQ] = useState("");
  const active = hash.replace("#", "").toUpperCase();
  const mods = useMemo(() => MHGAP_MODULES.filter((m) => matches(m, q)), [q]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => document.getElementById(`mod-${active}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(t);
  }, [active]);

  const go = (k: string) => navigate({ hash: k }, { replace: true });
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur print:static">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={back} className="gap-1 print:hidden"><ArrowLeft className="h-4 w-4" />Back</Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground" style={{ background: "linear-gradient(120deg, hsl(262 70% 50%), hsl(199 85% 42%))" }}>
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">mhGAP guideline reference</h1>
              <p className="truncate text-xs text-muted-foreground">WHO mhGAP Intervention Guide 2.0 · Mental Health & Psychosocial Support</p>
            </div>
          </div>
          <div className="relative w-full sm:w-64 print:hidden">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search signs, medicines…" className="pl-8" />
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1 print:hidden"><Printer className="h-4 w-4" />Print</Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 print:hidden">
          {[{ key: "CARE", short: "Care", hue: "199 85% 42%" }, { key: "EMERGENCY", short: "Emergency", hue: "0 75% 50%" }, ...MHGAP_MODULES].map((m) => (
            <button key={m.key} onClick={() => go(m.key)}
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
              style={{ color: hsl(m.hue), borderColor: hsl(m.hue, active === m.key ? 1 : 0.35), background: active === m.key ? hsl(m.hue, 0.12) : undefined }}>
              {m.short}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">
        <p className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          Decision support for trained health workers. Clinical judgement, national protocols and specialist review always take precedence; medicines and doses must be confirmed by a qualified prescriber.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <section id="mod-CARE" className="scroll-mt-32 rounded-lg border border-border bg-background p-4 shadow-sm">
            <Section icon={HeartHandshake} title="Essential care & practice (all conditions)" hue="199 85% 42%">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">{ESSENTIAL_CARE.map((t) => <li key={t}>{t}</li>)}</ol>
            </Section>
          </section>
          <section id="mod-EMERGENCY" className="scroll-mt-32 rounded-lg border border-destructive/40 bg-background p-4 shadow-sm">
            <Section icon={ShieldAlert} title="Emergency presentations — act first" hue="0 75% 50%">
              <ul className="space-y-1.5 text-sm text-foreground">{EMERGENCY_FLAGS.map((t) => <li key={t} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />{t}</li>)}</ul>
              <div className="mt-3 grid gap-2">
                {EMERGENCY_MEDS.map((e) => (
                  <div key={e.title} className="rounded-md bg-destructive/5 p-2 text-xs"><p className="font-semibold text-foreground">{e.title}</p><p className="text-muted-foreground">{e.text}</p></div>
                ))}
              </div>
            </Section>
          </section>
        </div>

        {mods.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No guideline content matches “{q}”.</p>}

        {mods.map((m) => (
          <section key={m.key} id={`mod-${m.key}`} className="scroll-mt-32 overflow-hidden rounded-lg border bg-background shadow-sm"
            style={{ borderColor: active === m.key ? hsl(m.hue) : undefined }}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: hsl(m.hue, 0.1) }}>
              <span className="rounded-md px-2 py-1 text-xs font-bold text-primary-foreground" style={{ background: hsl(m.hue) }}>{m.short}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-foreground">{m.label}</h2>
                <p className="text-xs text-muted-foreground">{m.summary}</p>
              </div>
            </div>
            <div className="grid gap-5 p-4 lg:grid-cols-2">
              <Section icon={Stethoscope} title="Assess" hue={m.hue}>
                <ul className="space-y-1.5 text-sm">
                  {m.criteria.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      <span className={`mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-semibold ${c.weight === "red" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{WEIGHT[c.weight || "symptom"]}</span>
                      <span className="text-foreground">{c.step ? <b className="font-medium">{c.step}: </b> : null}{c.text}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <div className="space-y-5">
                <Section icon={HeartHandshake} title="Psychosocial interventions" hue={m.hue}>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{m.psychosocial.map((t) => <li key={t}>{t}</li>)}</ul>
                </Section>
                {m.messages.length > 0 && (
                  <Section icon={MessageCircle} title="Key messages for the person & carers" hue={m.hue}>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{m.messages.map((t) => <li key={t}>{t}</li>)}</ul>
                  </Section>
                )}
                <Section icon={CalendarClock} title="Follow-up" hue={m.hue}><p className="text-sm text-foreground">{m.followUp}</p></Section>
                <Section icon={Share2} title="Refer when" hue={m.hue}>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{m.referWhen.map((t) => <li key={t}>{t}</li>)}</ul>
                </Section>
              </div>
            </div>
            {m.regimens.length > 0 && (
              <div className="border-t border-border p-4">
                <Section icon={Pill} title="Medicines in the guide" hue={m.hue}>
                  <div className="grid gap-3 md:grid-cols-2">
                    {m.regimens.map((r) => (
                      <div key={`${r.name}-${r.role}`} className="rounded-md border border-border p-3 text-xs">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{r.name}</p>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: hsl(m.hue), background: hsl(m.hue, 0.1) }}>{ROLE[r.role]}</span>
                        </div>
                        <dl className="space-y-1 text-muted-foreground">
                          {([["Adult", r.adult], ["Older adult", r.older], ["Child/adolescent", r.child], ["Pregnancy/breastfeeding", r.pregnancy], ["Side effects", r.sideEffects], ["Cautions", r.cautions]] as const)
                            .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="inline font-medium text-foreground">{k}: </dt><dd className="inline">{v}</dd></div>)}
                        </dl>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
