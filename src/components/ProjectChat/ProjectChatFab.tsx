import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X, Check } from "lucide-react";
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
 * WhatsApp-style floating chat launcher shown on the Forms page.
 * Lives at the bottom-right, opens the full project chat panel, and is
 * deliberately separate from the Proximity discovery hub.
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
      <div className="fixed bottom-24 right-4 z-40 sm:bottom-8 sm:right-8">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={launch}
              aria-label="Open project chat"
              className="group relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                boxShadow: "0 10px 25px -5px rgba(18,140,126,0.55)",
              }}
            >
              <MessageCircle className="h-7 w-7" strokeWidth={2.2} />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            className="w-64 p-2"
          >
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Choose a project chat
            </p>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
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
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                    p.id === activeProjectId && "bg-accent",
                  )}
                >
                  <span className="truncate">{p.name}</span>
                  {p.id === activeProjectId && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

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
