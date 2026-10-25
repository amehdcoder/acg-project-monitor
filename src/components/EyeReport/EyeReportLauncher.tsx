import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Accessibility, BarChart3, ChevronRight, ClipboardPlus, Settings2 } from "lucide-react";
import hero from "@/assets/eye-report/hero.jpg";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { loadReports } from "@/lib/eyeReport/store";
import type { EyeReportRow } from "@/lib/eyeReport/definition";
import EyeDailyReportForm, { type EyeFacility } from "./EyeDailyReportForm";
import EyeReportDashboard from "./EyeReportDashboard";
import EyeReportAccessDialog from "./EyeReportAccessDialog";

const db = supabase as any;
interface Props { projectId: string | null; projects: { id: string; name: string }[]; userId?: string; isAdmin: boolean }

/** Forms-page entry cards for the Eye Health daily report and its dashboard. */
export default function EyeReportLauncher({ projectId: selected, projects, userId, isAdmin }: Props) {
  // With "All projects" selected, fall back to the first project that has the report.
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => {
    if (selected) return;
    void cachedRead<{ project_id: string }[]>("eye-projects", () => db.from("eye_report_projects").select("project_id")).then(({ data }) => {
      const ids = new Set((data ?? []).map((r) => r.project_id));
      setFallback(projects.find((p) => ids.has(p.id))?.id ?? null);
    });
  }, [selected, projects]);
  const projectId = selected ?? fallback;
  const [perm, setPerm] = useState({ enabled: false, report: false, view: false });
  const [facilities, setFacilities] = useState<EyeFacility[]>([]);
  const [open, setOpen] = useState<"form" | "dash" | null>(null);
  const [manage, setManage] = useState(false);
  const [rows, setRows] = useState<EyeReportRow[]>([]);

  const check = useCallback(async () => {
    if (!projectId || !userId) return setPerm({ enabled: false, report: false, view: false });
    const { data } = await cachedRead<{ enabled: boolean; report: boolean; view: boolean }>(`eye-perm:${projectId}`, async () => {
      const [e, r, v] = await Promise.all([
        db.rpc("eye_report_enabled", { _project: projectId }),
        db.rpc("can_eye_report", { _user: userId, _project: projectId }),
        db.rpc("can_view_eye_dashboard", { _user: userId, _project: projectId }),
      ]);
      return { data: { enabled: !!e.data, report: !!r.data, view: !!v.data }, error: e.error || r.error || v.error };
    });
    setPerm(data ?? { enabled: false, report: false, view: false });
    const fac = await cachedRead<EyeFacility[]>(`eye-facilities:${projectId}`, () => db.from("health_facilities").select("id, name, state, lga").eq("project_id", projectId).order("name"));
    setFacilities(fac.data ?? []);
  }, [projectId, userId]);
  useEffect(() => { void check(); }, [check]);

  const openForm = async () => { if (projectId) setRows((await loadReports(projectId)).rows); setOpen("form"); };
  const projectName = projects.find((p) => p.id === projectId)?.name;
  if (!projectId || !userId || (!perm.enabled && !isAdmin) || (!perm.report && !perm.view && !isAdmin)) return null;

  return (
    <div className="border-b border-border/60 bg-eye-sky/50 p-3 sm:p-4">
      <div className="relative mb-3 overflow-hidden rounded-2xl bg-eye-deep text-primary-foreground">
        <img src={hero} alt="" width={1600} height={640} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-right opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-eye-deep via-eye-deep/85 to-transparent" />
        <div className="relative flex items-center justify-between gap-2 p-4">
          <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-widest text-eye-gold">Primary Eye Care</p><p className="text-base font-extrabold">Eye Health Facility Reporting</p><p className="truncate text-xs opacity-80">Daily outputs & outcomes · CSOM · monthly & annual totals</p></div>
          {isAdmin && <button type="button" onClick={() => setManage(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-eye-gold px-2.5 py-1.5 text-xs font-bold text-eye-ink"><Settings2 className="h-3.5 w-3.5" /> Access</button>}
        </div>
      </div>
      {perm.enabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {perm.report && (
            <button type="button" onClick={() => void openForm()} className="group flex items-start gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-eye-blue text-primary-foreground"><ClipboardPlus className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold text-eye-deep">Daily Facility Report</span><span className="mt-1 block text-xs text-muted-foreground">Consultations, surgeries, refraction, glasses and the CSOM episode. Works offline.</span></span>
              <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground/60" />
            </button>
          )}
          {perm.view && (
            <button type="button" onClick={() => setOpen("dash")} className="group flex items-start gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-eye-teal text-primary-foreground"><BarChart3 className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold text-eye-deep">Outputs & Outcomes Dashboard</span><span className="mt-1 block text-xs text-muted-foreground">Filters, trends, CSOM quality and WHO-style Summary/CSOM exports.</span></span>
              <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground/60" />
            </button>
          )}
        </div>
      ) : <p className="text-xs text-muted-foreground">Not added to this project yet. Use Access → Projects to add it.</p>}
      {open === "form" && <EyeDailyReportForm projectId={projectId} projectName={projectName} facilities={facilities} mode={{ kind: "user", userId }} otherReports={rows} onClose={() => setOpen(null)} />}
      {open === "dash" && <EyeReportDashboard projectId={projectId} projectName={projectName} facilities={facilities} userId={userId} canReport={perm.report} canManage={isAdmin} onClose={() => setOpen(null)} />}
      <EyeReportAccessDialog open={manage} onOpenChange={setManage} projects={projects} projectId={projectId} userId={userId} onChanged={() => void check()} />
    </div>
  );
}
