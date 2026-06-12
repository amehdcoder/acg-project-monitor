import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X, Check, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ProjectChatDialog } from "@/components/ProjectChat/ProjectChatDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ProjectChatFabProps {
  projects: Array<{ id: string; name: string }>;
  currentProjectId?: string | null;
}

/**
 * Floating chat launcher positioned at the bottom-left of the Forms page.
 * Deliberately placed away from the Proximity discovery hub (bottom-right).
 * Uses the Amehnities brand palette for a cohesive, premium feel.
 */
export function ProjectChatFab({ projects, currentProjectId }: ProjectChatFabProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    currentProjectId ?? projects[0]?.id ?? null,
  );
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (currentProjectId) setActiveProjectId(currentProjectId);
  }, [currentProjectId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId],
  );

  // Lightweight unread badge across all of the user's projects.
  useEffect(() => {
    if (!user || projects.length === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        let total = 0;
        for (const p of projects) {
          const { data } = await supabase.rpc("get_project_unread_count", {
            p_user_id: user.id,
            p_project_id: p.id,
          });
          total += Number(data ?? 0);
        }
        if (!cancelled) setUnread(total);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user, projects, open]);

  if (projects.length === 0) return null;

  const launch = () => {
    if (projects.length > 1 && !currentProjectId) {
      setPickerOpen(true);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {/* ── Floating Action Button ── bottom-left, clear of the desktop sidebar
          and far from the ProximityHub (which lives at the bottom-right). ── */}
      <div className="fixed bottom-24 left-4 z-[55] sm:bottom-8 lg:left-[260px]">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={launch}
              aria-label="Open project chat"
              className="group relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-all duration-300 hover:scale-110 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)] active:scale-95"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-accent)) 100%)",
                boxShadow: "0 8px 28px -6px hsl(var(--primary) / 0.45)",
              }}
            >
              {/* Subtle inner glow ring */}
              <span className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary) / 0.2) 0%, hsl(var(--chart-accent) / 0.2) 100%)"
                }}
              />

              {/* Icon morphs between bubble and square on hover */}
              <MessagesSquare className="h-7 w-7 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3" strokeWidth={2.2} />

              {/* Unread badge — red with white ring */}
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1.5 text-[11px] font-bold text-white ring-[2.5px] ring-[hsl(var(--background))] animate-badge-bounce">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}

              {/* Online / active indicator dot */}
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[hsl(var(--background))] bg-emerald-400" />
            </button>
          </PopoverTrigger>

          {/* ── Project Picker Popover ── */}
          <PopoverContent
            align="start"
            side="top"
            className="w-72 p-0 overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-2xl"
          >
            {/* Popover header with gradient */}
            <div className="px-4 py-3 border-b border-border/40"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-accent)) 100%)"
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-white/90">
                Project Chats
              </p>
              <p className="text-[10px] text-white/70 mt-0.5">
                Select a project to start chatting
              </p>
            </div>

            <div className="max-h-64 space-y-0.5 overflow-y-auto p-1.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveProjectId(p.id);
                    setPickerOpen(false);
                    setOpen(true);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-accent/50 hover:shadow-sm",
                    p.id === activeProjectId && "bg-accent/40 shadow-sm ring-1 ring-primary/20",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Project avatar circle */}
                    <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{
                        background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--chart-accent)) 100%)"
                      }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate font-medium">{p.name}</span>
                  </div>
                  {p.id === activeProjectId && (
                    <div className="h-5 w-5 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Full Chat Dialog ── */}
      {activeProject && (
        <ProjectChatDialog
          projectId={activeProject.id}
          projectName={activeProject.name}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
