import { useEffect, useMemo, useState } from "react";
import { HeartPulse, LogOut, ShieldCheck, ArrowLeft, Lock, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import ProgrammeModuleWorkspace from "./ProgrammeModuleWorkspace";
import type { RecordsOnlyProject } from "@/lib/programmeModule/recordsOnly";

interface Props {
  projects: RecordsOnlyProject[];
  initialProjectId?: string | null;
  /** Shown when the user still has other, unlocked projects to go back to. */
  onExit?: () => void;
  /** Owner / Co-owner only: return to the full application. */
  onSwitchToFullApp?: () => void;
}

/**
 * Full-screen shell for projects the Owner / Co-Owner has locked to the
 * Longitudinal Beneficiary Records system. Nothing else in the application is
 * reachable from here.
 */
const RecordsOnlyShell = ({ projects, initialProjectId, onExit, onSwitchToFullApp }: Props) => {
  const { profile, signOut, isAdmin, isSuperAdmin, isOwner } = useAuth();
  const [projectId, setProjectId] = useState<string>(
    initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : projects[0]?.id || "",
  );

  useEffect(() => {
    if (!projects.length) return;
    if (!projects.some((p) => p.id === projectId)) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const active = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  return (
    <div className="min-h-[100dvh] bg-health-surface">
      <header className="sticky top-0 z-40 border-b border-primary/20 bg-primary text-primary-foreground shadow-lg">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {onExit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onExit}
                className="text-primary-foreground hover:bg-primary-foreground/15"
                title="Back to projects"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15">
              <HeartPulse className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary-foreground/75">
                Longitudinal Beneficiary Records
              </p>
              <h1 className="truncate font-report-display text-xl font-bold sm:text-2xl">
                {active?.name || "Beneficiary records"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {projects.length > 1 && (
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-10 w-full border-primary-foreground/30 bg-card text-foreground sm:w-[260px]">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {onSwitchToFullApp ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={onSwitchToFullApp}
                className="gap-1.5 font-semibold"
                title="Leave the records workspace and return to the full application"
              >
                <LayoutGrid className="h-4 w-4" /> Switch to full app
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-semibold">
                <Lock className="h-3.5 w-3.5" /> Records-only project
              </span>
            )}
            <span className="hidden truncate text-xs text-primary-foreground/80 sm:inline">
              {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              className="gap-1.5 text-primary-foreground hover:bg-primary-foreground/15"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <div className="grid divide-y divide-primary-foreground/15 bg-primary/90 px-4 py-2 text-[11px] text-primary-foreground/85 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
          <p className="py-1.5 sm:pr-4">
            <span className="font-bold text-primary-foreground">One record per person</span><br />
            Every service, visit and outcome on a single Case ID
          </p>
          <p className="py-1.5 sm:px-4">
            <span className="font-bold text-primary-foreground">Facility accountable</span><br />
            Local ownership with project-level oversight
          </p>
          <p className="py-1.5 sm:pl-4">
            <span className="inline-flex items-center gap-1 font-bold text-primary-foreground">
              <ShieldCheck className="h-3 w-3" /> Protection-aware
            </span><br />
            Sensitive narratives stay access-restricted
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">
        {active ? (
          <ProgrammeModuleWorkspace
            key={active.id}
            projectId={active.id}
            canConfigure={isAdmin}
            isOwner={isOwner}
            isSuperAdmin={isSuperAdmin || isOwner}
          />
        ) : (
          <div className="flex h-72 items-center justify-center rounded-xl border border-dashed bg-card text-sm text-muted-foreground">
            No beneficiary-records project is assigned to you yet.
          </div>
        )}
      </main>
    </div>
  );
};

export default RecordsOnlyShell;
