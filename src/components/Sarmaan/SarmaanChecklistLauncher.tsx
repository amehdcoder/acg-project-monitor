import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Circle,
  ClipboardCheck,
  BarChart3,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Flag,
  CalendarClock,
  Trophy,
  FileCheck2,
  BookOpen,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { NAVY, CHECKLIST_MODULES } from "./sarmaanBrand";

interface Props {
  formName: string;
  requiresGps?: boolean;
  onBegin: () => void;
  onOpenDashboard?: () => void;
  onClose: () => void;
}

/**
 * SARMAAN ACSM Integrated Supervisory Checklist — dedicated navy-themed entry
 * screen matching the reference design. Presents the 12 checklist modules, an
 * overall progress wizard and a rich context rail, then delegates the actual
 * data capture to the robust shared form engine (skip logic, GPS, offline).
 */
export default function SarmaanChecklistLauncher({
  formName,
  requiresGps = true,
  onBegin,
  onOpenDashboard,
  onClose,
}: Props) {
  const [active, setActive] = useState(1);
  const current = CHECKLIST_MODULES.find((m) => m.n === active) ?? CHECKLIST_MODULES[0];

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-hidden"
      style={{ background: NAVY.canvas, fontFamily: NAVY.bodyFont, color: NAVY.ink }}
    >
      {/* ---------- Left navy sidebar ---------- */}
      <aside
        className="hidden w-[300px] shrink-0 flex-col md:flex"
        style={{ background: `linear-gradient(180deg, ${NAVY.sidebar} 0%, ${NAVY.sidebarDeep} 100%)`, color: NAVY.sidebarText }}
      >
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: NAVY.teal }}
          >
            <ClipboardCheck className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-extrabold leading-tight" style={{ fontFamily: NAVY.headingFont }}>
              SARMAAN ACSM Integrated Supervisory Checklist
            </h1>
            <p className="mt-0.5 text-[11px]" style={{ color: NAVY.sidebarSub }}>
              for Programme Implementation Learning
            </p>
          </div>
        </div>

        <div className="px-5 pb-2 pt-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: NAVY.sidebarSub }}>
          Checklist Modules
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {CHECKLIST_MODULES.map((m) => {
            const isActive = m.n === active;
            const status = m.n < active ? "done" : m.n === 3 ? "warn" : "pending";
            return (
              <button
                key={m.n}
                onClick={() => setActive(m.n)}
                className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                style={{
                  background: isActive ? NAVY.sidebarActive : "transparent",
                }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{
                    background: isActive ? NAVY.teal : "rgba(255,255,255,0.08)",
                    color: isActive ? "#fff" : NAVY.sidebarSub,
                  }}
                >
                  {m.n}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">{m.title}</span>
                {status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: NAVY.teal }} />
                ) : status === "warn" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: NAVY.gold }} />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" style={{ color: NAVY.sidebarSub, opacity: 0.5 }} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t px-5 py-4 text-[11px]" style={{ borderColor: NAVY.sidebarLine, color: NAVY.sidebarSub }}>
          <div>Checklist ID: <span className="font-semibold text-white">ISPL-2025-05-001247</span></div>
          <div className="mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: NAVY.teal }} /> Auto-saved · ready to begin
          </div>
          <button
            onClick={onBegin}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-semibold text-white transition hover:bg-white/5"
            style={{ borderColor: NAVY.sidebarLine }}
          >
            <BookOpen className="h-4 w-4" /> Checklist Guidance & Resources
          </button>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar: step wizard */}
        <header
          className="flex items-center gap-4 border-b px-5 py-3"
          style={{ borderColor: NAVY.line, background: NAVY.panel }}
        >
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold transition hover:bg-black/5"
            style={{ color: NAVY.inkSoft }}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-xs font-semibold" style={{ color: NAVY.inkSoft }}>
              Step {active} of 12
            </span>
            <span className="text-sm font-bold" style={{ color: NAVY.ink }}>· {current.title}</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: NAVY.inkSoft }}>Overall Completion</span>
              <ProgressRing pct={Math.round((active / 12) * 100)} />
            </div>
            <div className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3" style={{ borderColor: NAVY.line }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: NAVY.primary }}>SV</span>
              <div className="leading-tight">
                <div className="text-[12px] font-bold">Supervisor</div>
                <div className="text-[10px]" style={{ color: NAVY.inkSoft }}>SARMAAN Programme</div>
              </div>
            </div>
          </div>
        </header>

        {/* step chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b px-5 py-3" style={{ borderColor: NAVY.line, background: NAVY.panel2 }}>
          {CHECKLIST_MODULES.map((m, i) => (
            <div key={m.n} className="flex shrink-0 items-center">
              <button
                onClick={() => setActive(m.n)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition"
                style={{
                  background: m.n <= active ? NAVY.teal : NAVY.line,
                  color: m.n <= active ? "#fff" : NAVY.inkSoft,
                }}
              >
                {m.n < active ? <CheckCircle2 className="h-4 w-4" /> : m.n}
              </button>
              {i < CHECKLIST_MODULES.length - 1 && (
                <span className="h-0.5 w-6" style={{ background: m.n < active ? NAVY.teal : NAVY.line }} />
              )}
            </div>
          ))}
        </div>

        {/* body: content + right rail */}
        <div className="flex min-h-0 flex-1 overflow-y-auto">
          <main className="min-w-0 flex-1 p-5 lg:p-6">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-2xl font-extrabold" style={{ fontFamily: NAVY.headingFont }}>
                {active}. {current.title}
              </h2>
            </div>
            <p className="mb-4 text-sm" style={{ color: NAVY.inkSoft }}>{current.blurb}</p>

            <div className="mb-5 flex flex-wrap gap-2">
              <Chip label="Activity Type" value="Routine Immunization" color={NAVY.primary} />
              <Chip label="Visit Type" value="Supportive Supervision" color={NAVY.teal} />
              <Chip label="Modality" value="In-person" color={NAVY.violet} />
            </div>

            {/* supervisor hint */}
            <div className="mb-5 rounded-2xl border" style={{ borderColor: NAVY.line, background: NAVY.primarySoft }}>
              <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "rgba(11,92,171,0.15)" }}>
                <Lightbulb className="h-4 w-4" style={{ color: NAVY.primary }} />
                <span className="text-sm font-bold" style={{ color: NAVY.primary }}>Supervisor Hint</span>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <HintCol title="Who to ask" text="Community leaders, volunteers, caregivers, facility staff, CHWs" />
                <HintCol title="What to check" text="Engagement quality, meeting inclusiveness, feedback loops" />
                <HintCol title="How to collect" text="Interviews, observation, meeting records, sign-in sheets, photos" />
              </div>
            </div>

            {/* module preview cards */}
            <div className="rounded-2xl border p-5" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: NAVY.teal }} />
                <h3 className="text-sm font-bold">This checklist covers 12 guided modules</h3>
              </div>
              <p className="mt-1 text-xs" style={{ color: NAVY.inkSoft }}>
                Not every question applies to every visit — the checklist adapts and hides what isn&apos;t relevant.
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {CHECKLIST_MODULES.map((m) => (
                  <button
                    key={m.n}
                    onClick={() => setActive(m.n)}
                    className="flex items-start gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm"
                    style={{
                      borderColor: m.n === active ? NAVY.teal : NAVY.line,
                      background: m.n === active ? NAVY.primarySoft : NAVY.panel2,
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-extrabold text-white"
                      style={{ background: NAVY.sidebar, fontFamily: NAVY.headingFont }}
                    >
                      {m.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold leading-snug">{m.title}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: NAVY.inkSoft }}>{m.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={onBegin}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-lg transition active:scale-[0.99]"
                style={{ background: `linear-gradient(90deg, ${NAVY.teal}, ${NAVY.tealDeep})` }}
              >
                <ClipboardCheck className="h-5 w-5" /> Begin supervision
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </main>

          {/* right rail */}
          <aside className="hidden w-[320px] shrink-0 space-y-4 border-l p-4 xl:block" style={{ borderColor: NAVY.line, background: NAVY.panel2 }}>
            <RailCard title="Quality & Risk Overview">
              <RailRow icon={<Trophy className="h-4 w-4" style={{ color: NAVY.gold }} />} label="Quality Score" sub="Good" value="78%" valueColor={NAVY.good} />
              <RailRow icon={<FileCheck2 className="h-4 w-4" style={{ color: NAVY.good }} />} label="MOV Completeness" sub="Good" value="85%" valueColor={NAVY.good} />
              <RailRow icon={<AlertTriangle className="h-4 w-4" style={{ color: NAVY.warn }} />} label="Risk Level" value="Medium" valueColor={NAVY.warn} pill />
              <RailRow icon={<Flag className="h-4 w-4" style={{ color: NAVY.bad }} />} label="Unresolved Issues" sub="2" value="View" valueColor={NAVY.primary} />
              <RailRow icon={<CalendarClock className="h-4 w-4" style={{ color: NAVY.primary }} />} label="Action Points Due" sub="3" value="View" valueColor={NAVY.primary} />
            </RailCard>

            <RailCard title="Location & Context">
              <div className="mb-2 flex h-28 items-center justify-center rounded-xl border" style={{ borderColor: NAVY.line, background: `linear-gradient(135deg, #dbe7f3, #eef4fb)` }}>
                <MapPin className="h-6 w-6" style={{ color: NAVY.bad }} />
              </div>
              <div className="text-[13px] font-bold">Location captured on visit</div>
              <div className="mt-1 text-[11.5px]" style={{ color: NAVY.inkSoft }}>Facility · Visited on submission</div>
              {requiresGps && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: NAVY.primarySoft, color: NAVY.primary }}>
                  <ShieldCheck className="h-3.5 w-3.5" /> GPS-verified location
                </div>
              )}
            </RailCard>

            <RailCard title="Validation Alerts" badge="3">
              <ul className="space-y-1.5 text-[12px]" style={{ color: NAVY.inkSoft }}>
                <li>• Complete all required fields per section</li>
                <li>• Attach evidence for logged activities</li>
                <li>• Provide examples where prompted</li>
              </ul>
            </RailCard>

            <RailCard title="Skip Logic">
              <p className="text-[12px]" style={{ color: NAVY.inkSoft }}>
                Sections adapt to your answers — non-relevant questions are hidden automatically as you progress.
              </p>
            </RailCard>

            {onOpenDashboard && (
              <button
                onClick={onOpenDashboard}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 py-3 text-sm font-bold transition hover:bg-white"
                style={{ borderColor: NAVY.primary, color: NAVY.primary }}
              >
                <BarChart3 className="h-5 w-5" /> Learning Dashboard
              </button>
            )}
          </aside>
        </div>

        {/* bottom action bar */}
        <footer
          className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: NAVY.line, background: NAVY.panel }}
        >
          <button
            onClick={() => setActive((a) => Math.max(1, a - 1))}
            className="inline-flex items-center gap-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-black/5"
            style={{ borderColor: NAVY.line, color: NAVY.inkSoft }}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onBegin}
              className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-black/5"
              style={{ borderColor: NAVY.line, color: NAVY.ink }}
            >
              <Save className="h-4 w-4" /> Save Draft
            </button>
            {active < 12 ? (
              <button
                onClick={() => setActive((a) => Math.min(12, a + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
                style={{ background: NAVY.teal }}
              >
                Next Section <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={onBegin}
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
                style={{ background: NAVY.primary }}
              >
                <Send className="h-4 w-4" /> Submit Checklist
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke={NAVY.line} strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={NAVY.teal} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{pct}%</span>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px]" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
      <span className="font-semibold" style={{ color }}>{label}:</span>
      <span className="font-medium" style={{ color: NAVY.ink }}>{value}</span>
    </span>
  );
}

function HintCol({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-bold" style={{ color: NAVY.primary }}>{title}</div>
      <div className="text-[11.5px] leading-snug" style={{ color: NAVY.inkSoft }}>{text}</div>
    </div>
  );
}

function RailCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-bold" style={{ fontFamily: NAVY.headingFont }}>{title}</h3>
        {badge && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: NAVY.bad }}>{badge}</span>
        )}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function RailRow({ icon, label, sub, value, valueColor, pill }: { icon: React.ReactNode; label: string; sub?: string; value: string; valueColor: string; pill?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{label}</div>
        {sub && <div className="text-[11px]" style={{ color: NAVY.inkSoft }}>{sub}</div>}
      </div>
      {pill ? (
        <span className="rounded-md border px-2 py-0.5 text-[11px] font-bold" style={{ color: valueColor, borderColor: valueColor }}>{value}</span>
      ) : (
        <span className="text-[13px] font-extrabold" style={{ color: valueColor }}>{value}</span>
      )}
    </div>
  );
}
