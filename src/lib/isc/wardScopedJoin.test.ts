/**
 * Ward-scoped joining of forward movement (Level 0–3) and reverse logistics
 * (Level 4). Cross-ward records must never be joined, whatever the community,
 * medicine or batch says.
 */
import { describe, it, expect } from "vitest";
import {
  joinLogisticsByWard, matchReturnsToForward, sameWardScope, wardScopeKey, txWardScope,
} from "./wardScopedJoin";
import type { CddTx, LogisticsDataset, ReturnTx } from "./medicineAccountability";

const base = (over: Partial<CddTx> = {}) => ({
  submissionId: "s1", uuid: "u1", date: "2026-08-20",
  state: "Kano", lga: "Dala", ward: "Gwammaja", submittedBy: "slo", barcode: "",
  ...over,
});

const cdd = (over: Partial<CddTx> = {}): CddTx => ({
  ...(base() as any), level: "level_3", medicine: "ivermectin", batch: "B1", expiry: "",
  facility: "PHC", community: "Yakasai", cddName: "Hauwa", cddPhone: "",
  inCharge: "Musa", inChargePhone: "", qtyIssued: 100, hasPhoto: false,
  ...over,
});

const ret = (over: Partial<ReturnTx> = {}): ReturnTx => ({
  ...(base() as any), level: "level_4", medicine: "ivermectin", batch: "B1", expiry: "",
  leg: "cdd_to_flhf", returnedFrom: "Hauwa", returnedTo: "PHC",
  qtyReturned: 30, qtyUsable: 30, qtyDamaged: 0, qtyExpired: 0,
  condition: "usable", reason: "unused", returnedBy: "Hauwa", receivedBy: "Musa",
  facility: "PHC", community: "Yakasai", waybill: "",
  hasWaybill: false, hasSignature: false, hasPhoto: false,
  ...over,
});

const ds = (over: Partial<LogisticsDataset> = {}): LogisticsDataset => ({
  dispatches: [], receipts: [], issues: [], cddIssues: [], returns: [], submissions: 1, ...over,
});

describe("ward scope keys", () => {
  it("normalises case, spacing and punctuation", () => {
    expect(wardScopeKey("Kano", "Dala", "Gwammaja"))
      .toBe(wardScopeKey(" kano ", "DALA", "Gwammaja "));
  });

  it("is empty when the LGA or Ward chain is incomplete", () => {
    expect(wardScopeKey("Kano", "Dala", "")).toBe("");
    expect(wardScopeKey("Kano", "", "Gwammaja")).toBe("");
  });

  it("distinguishes identical ward names in different LGAs or States", () => {
    expect(wardScopeKey("Kano", "Dala", "Central"))
      .not.toBe(wardScopeKey("Kano", "Gwale", "Central"));
    expect(wardScopeKey("Kano", "Dala", "Central"))
      .not.toBe(wardScopeKey("Jigawa", "Dala", "Central"));
  });

  it("sameWardScope is false for records without a full chain", () => {
    expect(sameWardScope(cdd(), ret())).toBe(true);
    expect(sameWardScope(cdd({ ward: "" }), ret({ ward: "" }))).toBe(false);
  });
});

describe("forward ↔ reverse joining at ward scope", () => {
  it("nets returns against forward movement inside the same ward", () => {
    const groups = joinLogisticsByWard(ds({ cddIssues: [cdd({ qtyIssued: 100 })], returns: [ret({ qtyReturned: 30 })] }));
    expect(groups).toHaveLength(1);
    expect(groups[0].forwardQty).toBe(100);
    expect(groups[0].returnedQty).toBe(30);
    expect(groups[0].netQty).toBe(70);
  });

  it("never nets a return recorded in a different ward", () => {
    const groups = joinLogisticsByWard(ds({
      cddIssues: [cdd({ qtyIssued: 100 })],
      returns: [ret({ ward: "Kabuwaya", qtyReturned: 30 })],
    }));
    const gwammaja = groups.find((g) => g.ward === "Gwammaja")!;
    expect(gwammaja.returnedQty).toBe(0);
    expect(gwammaja.netQty).toBe(100);
    expect(groups.find((g) => g.ward === "Kabuwaya")!.forwardQty).toBe(0);
  });

  it("keeps same-named wards in different LGAs and States apart", () => {
    const groups = joinLogisticsByWard(ds({
      cddIssues: [
        cdd({ ward: "Central", lga: "Dala", qtyIssued: 100 }),
        cdd({ ward: "Central", lga: "Gwale", qtyIssued: 50 }),
        cdd({ ward: "Central", lga: "Dala", state: "Jigawa", qtyIssued: 20 }),
      ],
      returns: [ret({ ward: "Central", lga: "Gwale", qtyReturned: 15 })],
    }));
    expect(groups).toHaveLength(3);
    const byScope = Object.fromEntries(groups.map((g) => [g.scope, g]));
    expect(byScope[txWardScope({ state: "Kano", lga: "Dala", ward: "Central" })].returnedQty).toBe(0);
    expect(byScope[txWardScope({ state: "Kano", lga: "Gwale", ward: "Central" })].returnedQty).toBe(15);
    expect(byScope[txWardScope({ state: "Jigawa", lga: "Dala", ward: "Central" })].returnedQty).toBe(0);
  });

  it("counts records without a full ward chain as unscoped instead of guessing", () => {
    const groups = joinLogisticsByWard(ds({
      cddIssues: [cdd(), cdd({ ward: "" })],
      returns: [ret({ lga: "" })],
    }));
    expect(groups).toHaveLength(1);
    expect(groups[0].forwardQty).toBe(100);
    expect(groups[0].unscopedForward).toBe(1);
    expect(groups[0].unscopedReturns).toBe(1);
  });

  it("aggregates every forward level of the cascade", () => {
    const groups = joinLogisticsByWard(ds({
      dispatches: [{ ...(base() as any), level: "level_0", qtyDispatched: 500 } as any],
      receipts: [{ ...(base() as any), level: "level_1", qtyReceived: 480 } as any],
      issues: [{ ...(base() as any), level: "level_2", qtyIssued: 300 } as any],
      cddIssues: [cdd({ qtyIssued: 100 })],
    }));
    expect(groups[0].forwardQty).toBe(1380);
    expect(groups[0].forward).toHaveLength(4);
  });

  it("handles a null dataset", () => {
    expect(joinLogisticsByWard(null)).toEqual([]);
  });
});

describe("matchReturnsToForward", () => {
  it("matches only same-ward, same-medicine returns", () => {
    const forward = cdd();
    const candidates = [
      ret({ uuid: "same-ward" }),
      ret({ uuid: "other-ward", ward: "Kabuwaya" }),
      ret({ uuid: "other-lga", lga: "Gwale" }),
      ret({ uuid: "other-state", state: "Jigawa" }),
      ret({ uuid: "other-medicine", medicine: "albendazole" }),
    ];
    expect(matchReturnsToForward(forward, candidates).map((r) => r.uuid)).toEqual(["same-ward"]);
  });

  it("returns nothing for a forward record with no ward chain", () => {
    expect(matchReturnsToForward(cdd({ ward: "" }), [ret()])).toEqual([]);
  });
});
