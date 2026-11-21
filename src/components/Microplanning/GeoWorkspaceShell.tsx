import { LayoutGrid, LogOut, Lock, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import MicroplanningView from "./MicroplanningView";
import { usePageAccess } from "@/hooks/usePageAccess";

interface Props {
  projectIds?: string[];
  onSwitchToFullApp?: () => void;
}

/** Full-screen Geo Microplanning workspace with no side menu. */
const GeoWorkspaceShell = ({ onSwitchToFullApp, projectIds }: Props) => {
  const { profile, signOut } = useAuth();
  const { microplanAccess, loadingAccess } = usePageAccess();
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="z-40 border-b border-border bg-card text-foreground">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-chart-secondary/10 text-chart-secondary">
              <MapPinned className="h-6 w-6" />
            </div>
            <div>
              <p className="font-report-display text-base font-semibold">Amehnities</p>
              <p className="font-report text-xs text-muted-foreground">Geospatial workspace</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onSwitchToFullApp ? (
              <Button size="sm" variant="secondary" onClick={onSwitchToFullApp} className="gap-1.5 font-semibold">
                <LayoutGrid className="h-4 w-4" /> Switch to full app
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                <Lock className="h-3.5 w-3.5" /> Geo Microplanning only
              </span>
            )}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()} className="gap-1.5">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6">
          {loadingAccess ? <p className="text-sm text-muted-foreground">Loading project access…</p> : microplanAccess === "none" ? <p className="text-sm text-muted-foreground">No microplanning access for this account.</p> : <MicroplanningView entryOnly={microplanAccess === "entry"} allowedProjectIds={projectIds} />}
        </div>
      </main>
    </div>
  );
};

export default GeoWorkspaceShell;
