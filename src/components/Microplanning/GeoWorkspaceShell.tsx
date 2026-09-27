import { LayoutGrid, LogOut, Lock, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import MicroplanningView from "./MicroplanningView";

interface Props {
  onSwitchToFullApp?: () => void;
}

/** Full-screen Geo Microplanning workspace with no side menu. */
const GeoWorkspaceShell = ({ onSwitchToFullApp }: Props) => {
  const { profile, signOut } = useAuth();
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="z-40 border-b border-primary/20 bg-primary text-primary-foreground shadow-lg">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15">
              <MapPinned className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary-foreground/75">Amehnities</p>
              <h1 className="font-report-display text-xl font-bold sm:text-2xl">Geo Microplanning workspace</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onSwitchToFullApp ? (
              <Button size="sm" variant="secondary" onClick={onSwitchToFullApp} className="gap-1.5 font-semibold">
                <LayoutGrid className="h-4 w-4" /> Switch to full app
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-semibold">
                <Lock className="h-3.5 w-3.5" /> Geo Microplanning only
              </span>
            )}
            <span className="hidden text-xs text-primary-foreground/80 sm:inline">
              {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()} className="gap-1.5 text-primary-foreground hover:bg-primary-foreground/15">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6">
          <MicroplanningView />
        </div>
      </main>
    </div>
  );
};

export default GeoWorkspaceShell;
