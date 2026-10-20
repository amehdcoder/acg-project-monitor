/** Completed referrals / all recorded referrals, expressed on a 0–100 scale. */
export function referralCompletionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 10000) / 100;
}