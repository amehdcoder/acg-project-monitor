// Pure layout helper for the WhatsApp-style call participant grid.
//
// The goal is a responsive layout that adapts smoothly to the number of
// participants with no layout jumps: a 1:1 call uses a featured layout (the
// remote peer full-bleed with the local camera as a picture-in-picture), while
// group calls use an even, balanced grid.

export interface VideoGridLayout {
  /** Tailwind grid-template-columns classes for the tile grid. */
  containerClass: string;
  /** When true, render a 1:1 featured (remote full-bleed + local PiP) layout. */
  featured: boolean;
  /** Effective number of columns at the largest breakpoint. */
  columns: number;
}

/**
 * Compute the grid layout for a given TOTAL participant count (local + remotes).
 * Buckets are chosen so tiles stay reasonably sized and the layout only changes
 * at sensible thresholds, avoiding jarring reflows as people join/leave.
 */
export function computeVideoGridLayout(participantCount: number): VideoGridLayout {
  const count = Math.max(1, Math.floor(participantCount) || 1);

  if (count === 1) return { containerClass: "grid-cols-1", featured: false, columns: 1 };
  if (count === 2) return { containerClass: "grid-cols-1", featured: true, columns: 1 };
  if (count <= 4) return { containerClass: "grid-cols-2", featured: false, columns: 2 };
  if (count <= 6) return { containerClass: "grid-cols-2 sm:grid-cols-3", featured: false, columns: 3 };
  if (count <= 9) return { containerClass: "grid-cols-3", featured: false, columns: 3 };
  if (count <= 12) return { containerClass: "grid-cols-3 sm:grid-cols-4", featured: false, columns: 4 };
  return { containerClass: "grid-cols-4 sm:grid-cols-5", featured: false, columns: 5 };
}
