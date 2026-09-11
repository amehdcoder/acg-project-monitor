import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Resolves a configured icon name to a lucide icon, with a safe fallback. */
export const resolveIcon = (name?: string): LucideIcon => {
  const map = Lucide as unknown as Record<string, LucideIcon>;
  return (name && map[name]) || Lucide.CircleDot;
};
