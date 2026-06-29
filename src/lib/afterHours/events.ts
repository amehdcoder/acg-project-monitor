// Shared client events for the after-hours approval workflow.

export const OPEN_AFTER_HOURS_APPROVALS = "afterhours:open-approvals";
export const OPEN_AFTER_HOURS_STATUS = "afterhours:open-status";

/** Open the reviewer approval center (optionally focusing a request id). */
export function openAfterHoursApprovals(requestId?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_AFTER_HOURS_APPROVALS, { detail: { requestId } }),
  );
}

/** Open the submitter's "my after-hours requests" status panel. */
export function openAfterHoursStatus() {
  window.dispatchEvent(new CustomEvent(OPEN_AFTER_HOURS_STATUS));
}
