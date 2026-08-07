/**
 * MDA Lens write guard — single source of truth for "this user may only read".
 *
 * A user carrying an enabled MDA Lens grant is a *viewer*: they see real-time
 * scoped data and may export it, but they may never create, edit, delete, or
 * request deletion of a submission. Admins and owners are exempt.
 *
 * This mirrors the database enforcement (`public.mda_lens_write_allowed`,
 * RESTRICTIVE RLS policies + BEFORE-write triggers on the microplanning tables,
 * and the check inside `update_submission_guarded`). The UI guard exists purely
 * for affordance/feedback — the backend is authoritative, so bypassing the UI
 * still fails.
 */
import type { MdaLensGrant } from "./config";

export interface LensWriteContext {
  lens?: MdaLensGrant | null;
  lensEnabled?: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
}

/** Every mutating operation a microplanning screen can offer. */
export type LensWriteOp =
  | "create"
  | "edit"
  | "delete"
  | "bulk-delete"
  | "bulk-edit"
  | "delete-request"
  | "import"
  | "submit";

export const LENS_READONLY_MESSAGE =
  "MDA Lens access is read-only — you cannot create, edit or delete submissions.";

/** True when the caller must be treated as read-only. */
export function isLensReadOnly(ctx: LensWriteContext): boolean {
  const enabled = ctx.lensEnabled ?? Boolean(ctx.lens?.enabled);
  if (!enabled) return false;
  return !ctx.isAdmin && !ctx.isOwner;
}

export interface LensWriteDecision {
  allowed: boolean;
  op: LensWriteOp;
  reason?: string;
}

/** Decide whether a mutating operation may proceed. */
export function guardLensWrite(ctx: LensWriteContext, op: LensWriteOp): LensWriteDecision {
  if (isLensReadOnly(ctx)) return { allowed: false, op, reason: LENS_READONLY_MESSAGE };
  return { allowed: true, op };
}
