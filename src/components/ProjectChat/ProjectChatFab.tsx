import { useEffect, useMemo, useState } from "react";
import { Check, MessagesSquare } from "lucide-react";
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

const UNREAD_CACHE_KEY = "amehnities:chat:unread";

/** Canonical UUID shape (v1-v5). Used to reject malformed deep-link params
 *  before we ever trust them for navigation. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Read the last-known unread total from localStorage so the badge stays
 *  accurate across page refreshes and full app restarts (before the live
 *  count finishes loading). */
function readCachedUnread(userId: string | undefined): number {
  if (!userId || typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(`${UNREAD_CACHE_KEY}:${userId}`);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCachedUnread(userId: string | undefined, value: number) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${UNREAD_CACHE_KEY}:${userId}`, String(value));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Floating chat launcher anchored to the bottom-LEFT of the Forms page.
 *
 * Layout guarantees:
 *  - Sits on the left, while the Proximity discovery hub is pinned bottom-right,
 *    so the two controls are always far more than 40px apart on every screen.
 *  - On mobile it is lifted above the bottom navigation bar (and the safe-area
 *    inset) so it is never hidden or overlapped.
 *  - Renders above the desktop sidebar via a high z-index + left offset.
 */
export function ProjectChatFab({ projects, currentProjectId }: ProjectChatFabProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    currentProjectId ?? projects[0]?.id ?? null,
  );
  const [initialGroupId, setInitialGroupId] = useState<string | null>(null);
  const [unread, setUnread] = useState(() => readCachedUnread(user?.id));

  useEffect(() => {
    if (currentProjectId) setActiveProjectId(currentProjectId);
  }, [currentProjectId]);

  // Re-hydrate the cached badge when the signed-in user changes.
  useEffect(() => {
    setUnread(readCachedUnread(user?.id));
  }, [user?.id]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId],
  );

  // ── Push-notification deep link ──
  // A tapped notification lands here with ?pcid=<project>&pgid=<group>.
  // Open the correct project chat (and group) so it is shown and marked read.
  // Malformed / missing / unknown params degrade gracefully: we still strip
  // them from the URL and fall back to the normal default chat state instead
  // of opening the wrong chat or throwing.
  useEffect(() => {
    if (projects.length === 0 || typeof window === "undefined") return;

    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }

    const hadParams = params.has("pcid") || params.has("pgid");
    if (!hadParams) return;

    const rawPcid = params.get("pcid");
    const rawPgid = params.get("pgid");

    // Only honour a syntactically valid project id that the user actually
    // belongs to; otherwise leave the default active project untouched.
    const validProjectId =
      isUuid(rawPcid) && projects.some((p) => p.id === rawPcid) ? rawPcid! : null;
    // A group id is only meaningful alongside a valid project, and must be a
    // well-formed UUID — anything else falls back to the project's default group.
    const validGroupId = validProjectId && isUuid(rawPgid) ? rawPgid! : null;

    if (validProjectId) {
      setActiveProjectId(validProjectId);
      setInitialGroupId(validGroupId);
      setPickerOpen(false);
      setOpen(true);
    }

    // Always clean the deep-link params so a later refresh doesn't reopen or
    // re-attempt the (possibly malformed) chat.
    params.delete("pcid");
    params.delete("pgid");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, [projects]);

  // ── Cross-tab unread synchronization ──
  // When another tab/window updates the cached unread total, mirror it here so
  // the WhatsApp-style badge stays consistent everywhere without waiting for
  // the next 30s poll.
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const key = `${UNREAD_CACHE_KEY}:${user.id}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      const n = e.newValue == null ? 0 : Number(e.newValue);
      if (Number.isFinite(n) && n >= 0) setUnread(n);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user?.id]);

  // Lightweight unread badge across all of the user's projects, persisted
  // to localStorage so it survives refreshes and app restarts.
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
        if (!cancelled) {
          setUnread(total);
          writeCachedUnread(user.id, total);
        }
      } catch {
        /* keep last cached value on transient errors */
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
      {/* ── Floating Action Button ──
          Bottom-LEFT, lifted above the mobile bottom-nav + safe area, and clear
          of the desktop sidebar. The Proximity hub lives bottom-RIGHT, so the
          two are always well beyond the required 40px apart. */}
      <div className="fixed left-4 z-[60] bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:bottom-8 lg:left-[260px]">
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
                    setInitialGroupId(null);
                    setPickerOpen(false);
                    setOpen(true);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-accent/50 hover:shadow-sm",
                    p.id === activeProjectId && "bg-accent/40 shadow-sm ring-1 ring-primary/20",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
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
          initialGroupId={initialGroupId}
        />
      )}
    </>
  );
}
