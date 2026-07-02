import { ChevronLeft, ClipboardCheck, ShieldCheck, MapPin, Sparkles, ArrowRight, BarChart3 } from "lucide-react";
import { SARMAAN, SUPERVISORY_SECTIONS } from "./sarmaanBrand";

interface Props {
  formName: string;
  requiresGps?: boolean;
  onBegin: () => void;
  onOpenDashboard?: () => void;
  onClose: () => void;
}

/**
 * Dedicated, SARMAAN-branded entry screen for the Integrated Supervisory
 * Checklist. Presents the 13 sections and guidance, then delegates the actual
 * data capture to the robust shared form engine (skip logic, GPS, offline).
 */
export default function SarmaanChecklistLauncher({
  formName,
  requiresGps = true,
  onBegin,
  onOpenDashboard,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: SARMAAN.cream, fontFamily: SARMAAN.bodyFont, color: SARMAAN.ink }}
    >
      {/* Hero */}
      <div
        className="relative overflow-hidden px-5 pb-10 pt-4 sm:px-8"
        style={{
          background: `radial-gradient(120% 140% at 100% 0%, ${SARMAAN.jade} 0%, ${SARMAAN.jadeDark} 45%, ${SARMAAN.jadeDeep} 100%)`,
        }}
      >
        {/* decorative rings */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30"
          style={{ background: `radial-gradient(circle, ${SARMAAN.gold}55 0%, transparent 65%)` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/3 h-56 w-56 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${SARMAAN.coral}66 0%, transparent 65%)` }}
        />

        <button
          onClick={onClose}
          className="relative inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-white/90 transition hover:bg-white/15"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>

        <div className="relative mx-auto mt-6 max-w-4xl">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: `${SARMAAN.gold}`, color: SARMAAN.jadeDeep }}
          >
            <Sparkles className="h-3.5 w-3.5" /> SARMAAN Programme
          </span>
          <h1
            className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl"
            style={{ fontFamily: SARMAAN.headingFont }}
          >
            Integrated Supervisory Checklist
            <span className="block" style={{ color: SARMAAN.goldSoft }}>
              & Learning Dashboard
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/85">
            A structured supervision journey across programme implementation — from advocacy and
            community dialogue to non-compliance resolution, evidence quality and adaptive learning.
            Sections adapt to your answers as you go.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={onBegin}
              className="group inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-base font-bold shadow-lg transition active:scale-[0.98]"
              style={{ background: SARMAAN.gold, color: SARMAAN.jadeDeep }}
            >
              <ClipboardCheck className="h-5 w-5" />
              Begin supervision
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
            </button>
            {onOpenDashboard && (
              <button
                onClick={onOpenDashboard}
                className="inline-flex items-center gap-2 rounded-2xl border-2 px-5 py-3 text-base font-bold text-white transition hover:bg-white/10"
                style={{ borderColor: "rgba(255,255,255,0.4)" }}
              >
                <BarChart3 className="h-5 w-5" />
                Learning dashboard
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-[13px] text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" style={{ color: SARMAAN.goldSoft }} /> 13 guided sections (A–M)
            </span>
            {requiresGps && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" style={{ color: SARMAAN.goldSoft }} /> GPS-verified location
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" style={{ color: SARMAAN.goldSoft }} /> Auto-scored /80 judgement
            </span>
          </div>
        </div>
      </div>

      {/* Section overview */}
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <h2 className="text-lg font-bold" style={{ fontFamily: SARMAAN.headingFont }}>
          What you&apos;ll cover
        </h2>
        <p className="mt-1 text-sm" style={{ color: SARMAAN.inkSoft }}>
          Thirteen focused sections. Not every question applies to every visit — the checklist hides
          what isn&apos;t relevant.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {SUPERVISORY_SECTIONS.map((s, i) => (
            <div
              key={s.code}
              className="flex gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md"
              style={{ borderColor: SARMAAN.line, background: SARMAAN.creamPanel }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: SARMAAN_SECTION_COLOR(i), fontFamily: SARMAAN.headingFont }}
              >
                {s.code}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-bold leading-snug" style={{ color: SARMAAN.ink }}>
                  {s.title}
                </div>
                <div className="mt-0.5 text-[12.5px] leading-snug" style={{ color: SARMAAN.inkSoft }}>
                  {s.blurb}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onBegin}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition active:scale-[0.99]"
          style={{ background: `linear-gradient(90deg, ${SARMAAN.jade}, ${SARMAAN.jadeDark})` }}
        >
          <ClipboardCheck className="h-5 w-5" /> Start the checklist
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function SARMAAN_SECTION_COLOR(i: number): string {
  const ramp = [
    SARMAAN.jade,
    SARMAAN.jadeDark,
    SARMAAN.sky,
    SARMAAN.plum,
    SARMAAN.coral,
    "#C6893F",
    SARMAAN.gold,
  ];
  return ramp[i % ramp.length];
}
