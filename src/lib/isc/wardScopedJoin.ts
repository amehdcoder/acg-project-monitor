/**
 * Ward-scoped joining of the medicine logistics cascade.
 *
 * Forward movement (Level 0 → 3) and reverse logistics (Level 4) are only ever
 * reconciled against each other INSIDE the same Ward of the same LGA and State.
 * A return recorded in a neighbouring ward — even with the same medicine, batch
 * and community name — is never allowed to offset a forward issue.
 */
import type { BaseTx, LogisticsDataset, ReturnTx } from "./medicineAccountability";

const n = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Composite "state|lga|ward" scope key. Empty when the chain is incomplete. */
export function wardScopeKey(state: unknown, lga: unknown, ward: unknown): string {
  const l = n(lga), w = n(ward);
  if (!l || !w) return "";
  return `${n(state)}|${l}|${w}`;
}

export const txWardScope = (tx: Pick<BaseTx, "state" | "lga" | "ward">) =>
  wardScopeKey(tx.state, tx.lga, tx.ward);

/** True only when both records sit in the same Ward of the same LGA and State. */
export function sameWardScope(
  a: Pick<BaseTx, "state" | "lga" | "ward">,
  b: Pick<BaseTx, "state" | "lga" | "ward">,
): boolean {
  const ka = txWardScope(a);
  return !!ka && ka === txWardScope(b);
}

export interface WardScopedGroup {
  scope: string;
  state: string;
  lga: string;
  ward: string;
  forwardQty: number;
  returnedQty: number;
  /** forward − returned, floored at zero for display. */
  netQty: number;
  forward: BaseTx[];
  returns: ReturnTx[];
  /** Records dropped because they carried no full State/LGA/Ward chain. */
  unscopedForward: number;
  unscopedReturns: number;
}

const qtyOf = (tx: any): number => {
  const v = tx?.qtyIssued ?? tx?.qtyReceived ?? tx?.qtyDispatched ?? 0;
  return Number.isFinite(v) ? Number(v) : 0;
};

/**
 * Group forward and reverse transactions by ward scope. Only records carrying a
 * complete LGA + Ward chain participate; everything else is counted as unscoped
 * rather than being folded into an arbitrary ward.
 */
export function joinLogisticsByWard(ds: LogisticsDataset | null): WardScopedGroup[] {
  const groups = new Map<string, WardScopedGroup>();
  let unscopedForward = 0;
  let unscopedReturns = 0;

  const ensure = (tx: BaseTx): WardScopedGroup | null => {
    const scope = txWardScope(tx);
    if (!scope) return null;
    let g = groups.get(scope);
    if (!g) {
      g = {
        scope, state: tx.state, lga: tx.lga, ward: tx.ward,
        forwardQty: 0, returnedQty: 0, netQty: 0,
        forward: [], returns: [], unscopedForward: 0, unscopedReturns: 0,
      };
      groups.set(scope, g);
    }
    return g;
  };

  const forward: BaseTx[] = [
    ...(ds?.dispatches ?? []),
    ...(ds?.receipts ?? []),
    ...(ds?.issues ?? []),
    ...(ds?.cddIssues ?? []),
  ];

  for (const tx of forward) {
    const g = ensure(tx);
    if (!g) { unscopedForward += 1; continue; }
    g.forward.push(tx);
    g.forwardQty += qtyOf(tx);
  }

  for (const tx of ds?.returns ?? []) {
    const g = ensure(tx);
    if (!g) { unscopedReturns += 1; continue; }
    g.returns.push(tx);
    g.returnedQty += Number.isFinite(tx.qtyReturned) ? tx.qtyReturned : 0;
  }

  const out = Array.from(groups.values());
  for (const g of out) {
    g.netQty = Math.max(0, g.forwardQty - g.returnedQty);
    g.unscopedForward = unscopedForward;
    g.unscopedReturns = unscopedReturns;
  }
  return out.sort((a, b) => b.forwardQty - a.forwardQty || a.scope.localeCompare(b.scope));
}

/**
 * Returns that can legitimately be matched to a forward record: same ward
 * scope AND same medicine. Cross-ward candidates are always excluded.
 */
export function matchReturnsToForward(
  forward: BaseTx & { medicine?: string },
  returns: ReturnTx[],
): ReturnTx[] {
  const scope = txWardScope(forward);
  if (!scope) return [];
  const med = n((forward as any).medicine);
  return returns.filter(
    (r) => txWardScope(r) === scope && (!med || !n(r.medicine) || n(r.medicine) === med),
  );
}
