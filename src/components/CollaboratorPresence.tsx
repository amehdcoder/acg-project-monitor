/**
 * CollaboratorPresence — Google-Workspace-style live presence avatars.
 *
 * Mounted in the Header for EVERY user (so they are counted as "present"), but
 * the avatar stack + roster popover only render for the Owner / Super Admins.
 * Users with no profile photo get a stable, friendly animal avatar so they stay
 * pseudonymous yet visually distinct.
 */
import { useMemo } from "react";
import { Users, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceTracking, type ActiveCollaborator } from "@/hooks/usePresenceTracking";
import { useDirectUnread } from "@/hooks/useDirectUnread";
import { cn } from "@/lib/utils";

const ANIMALS = [
  { emoji: "🦊", name: "Fox", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { emoji: "🦉", name: "Owl", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  { emoji: "🐢", name: "Turtle", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { emoji: "🦅", name: "Eagle", color: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  { emoji: "🐬", name: "Dolphin", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" },
  { emoji: "🦁", name: "Lion", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" },
  { emoji: "🐼", name: "Panda", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { emoji: "🦌", name: "Deer", color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  { emoji: "🐧", name: "Penguin", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  { emoji: "🦜", name: "Parrot", color: "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300" },
  { emoji: "🐝", name: "Bee", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200" },
  { emoji: "🦋", name: "Butterfly", color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
];

function animalFor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return ANIMALS[hash % ANIMALS.length];
}

function routeLabel(route: string): string {
  const tab = new URLSearchParams(route.split("?")[1] || "").get("tab");
  const clean = (tab || route.replace(/^\//, "").split("?")[0] || "dashboard")
    .replace(/[-_]/g, " ")
    .trim();
  if (!clean) return "Dashboard";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function CollaboratorAvatar({
  c,
  size = "md",
  ring = true,
}: {
  c: ActiveCollaborator;
  size?: "sm" | "md";
  ring?: boolean;
}) {
  const animal = animalFor(c.user_id);
  const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <Avatar
      className={cn(
        dim,
        ring && "ring-2 ring-card shadow-sm",
      )}
    >
      {c.avatar_url ? (
        <AvatarImage src={c.avatar_url} alt={c.name} className="object-cover" />
      ) : null}
      <AvatarFallback className={cn("text-base", animal.color)}>
        {animal.emoji}
      </AvatarFallback>
    </Avatar>
  );
}

const CollaboratorPresence = () => {
  const { user, isOwner, isSuperAdmin } = useAuth();
  const canView = isOwner || isSuperAdmin;
  // Track presence for every user; the roster is only rendered for admins.
  const { collaborators } = usePresenceTracking(true);
  // Per-peer unread direct-message counts (badge-only; no toast here).
  const { byUser: unreadByUser } = useDirectUnread();


  const startDirectChat = (c: ActiveCollaborator) => {
    window.dispatchEvent(
      new CustomEvent("amehnities:open-direct-chat", {
        detail: { userId: c.user_id, userName: c.name },
      }),
    );
  };


  const others = useMemo(
    () => collaborators,
    [collaborators],
  );

  if (!canView) return null;

  const total = others.length;
  const shown = others.slice(0, 4);
  const overflow = total - shown.length;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${total} active ${total === 1 ? "user" : "users"} online`}
              className="group relative flex items-center gap-2 rounded-full border border-border bg-card/60 px-1.5 py-1 transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {total === 0 ? (
                <span className="flex items-center gap-1.5 px-1.5 text-xs font-medium text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">No one online</span>
                </span>
              ) : (
                <div className="flex items-center -space-x-2.5">
                  {shown.map((c) => (
                    <CollaboratorAvatar key={c.user_id} c={c} size="sm" />
                  ))}
                  {overflow > 0 && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-card">
                      +{overflow}
                    </span>
                  )}
                  <span className="ml-3.5 hidden items-center gap-1 pr-1 text-xs font-semibold text-foreground sm:flex">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    {total}
                  </span>
                </div>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Active collaborators</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Active now</p>
            <p className="text-xs text-muted-foreground">
              {total} {total === 1 ? "person is" : "people are"} using the app
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {total === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No one is online right now</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {others.map((c) => {
                const animal = animalFor(c.user_id);
                return (
                  <li key={c.user_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="relative">
                      <CollaboratorAvatar c={c} ring={false} />
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.designation
                          ? c.designation.replace(/[-_]/g, " ")
                          : c.avatar_url
                            ? "Online"
                            : `Anonymous ${animal.name}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {routeLabel(c.route)}
                    </span>
                    {c.user_id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => startDirectChat(c)}
                        aria-label={`Chat with ${c.name}`}
                        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CollaboratorPresence;
