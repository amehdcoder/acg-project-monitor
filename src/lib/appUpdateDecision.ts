// Pure decision logic for the "Update now" banner.
//
// Extracted so it can be unit tested in isolation from the DOM / service-worker
// side effects in appUpdateManager.ts. The single rule the whole update system
// depends on: an update is ONLY available when a probe returns a *known* build
// id that differs from the build the current tab is running. A missing/unknown
// probe result (network blip, unreachable version.json, or a stale service
// worker "updatefound" event) must NEVER surface the banner.

export interface UpdateDecisionInput {
  /** Build id currently running in this tab. */
  currentBuildId: string;
  /** Build id reported by the probe, or null when it could not be determined. */
  latestBuildId: string | null;
  /** Where the signal came from. */
  source: "version" | "html" | "service-worker";
}

export interface UpdateDecision {
  updateAvailable: boolean;
  status: "available" | "current";
  currentBuildId: string;
  latestBuildId: string;
}

export const decideUpdate = (input: UpdateDecisionInput): UpdateDecision => {
  const { currentBuildId, latestBuildId } = input;

  // No trustworthy latest build id → treat as "current". This is the guard that
  // permanently kills the false-positive stale-service-worker banner.
  if (!latestBuildId || !latestBuildId.trim()) {
    return {
      updateAvailable: false,
      status: "current",
      currentBuildId,
      latestBuildId: currentBuildId,
    };
  }

  const changed = latestBuildId !== currentBuildId;
  return {
    updateAvailable: changed,
    status: changed ? "available" : "current",
    currentBuildId,
    latestBuildId,
  };
};
