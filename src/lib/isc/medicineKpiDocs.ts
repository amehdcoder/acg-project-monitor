/**
 * Professional KPI documentation for the Medicine Accountability dashboard —
 * definitions, formulas, interpretation bands and data-quality caveats.
 *
 * Rendered inline as tooltips on each KPI card and in full in the
 * documentation drawer, and appended to PDF exports so supervision meetings
 * work from the same definitions as the dashboard.
 */
export interface KpiDoc {
  id: string;
  label: string;
  definition: string;
  formula: string;
  interpretation: string;
  quality: string[];
  group: "flow" | "integrity" | "readiness" | "assurance";
}

export const KPI_DOCS: KpiDoc[] = [
  {
    id: "received-distributed",
    label: "Received vs distributed",
    group: "flow",
    definition:
      "Total units logged as received at LGA stores (Level 1) against the total dispatched onward to health facilities (Level 2) and community drug distributors (Level 3).",
    formula: "Received = Σ l1_qty_received · Distributed = Σ qty issued to FLHF · Onward = Σ qty issued to CDDs",
    interpretation:
      "Distributed should converge on net usable stock as the campaign progresses. A widening gap late in the round means stock is stranded upstream.",
    quality: [
      "Repeat lines with a blank quantity are read as 0, not skipped, so a partially completed roster does not silently inflate averages.",
      "Submissions missing a transaction date fall back to the Kobo submission timestamp for period filtering.",
    ],
  },
  {
    id: "wastage",
    label: "Wastage / stock loss rate",
    group: "flow",
    definition: "Share of stock received at the LGA that was recorded as damaged, expired or otherwise unusable on arrival.",
    formula: "Wastage % = Σ l1_qty_damaged ÷ Σ l1_qty_received × 100",
    interpretation: "Below 2% is normal handling loss; above 5% warrants a packaging, transport and storage review.",
    quality: [
      "Where nothing has been received the rate is reported as 0% rather than dividing by zero.",
      "Damage discovered after arrival (at facility level) is not captured by this indicator — it appears as transit shrinkage on the downstream leg.",
    ],
  },
  {
    id: "balances",
    label: "Tiered stock balance",
    group: "readiness",
    definition: "Live stock still held at each tier of the cascade.",
    formula: "LGA balance = Σ net usable − Σ issued to FLHF · Facility balance = Σ issued to FLHF − Σ issued to CDDs",
    interpretation: "Balances should fall steadily through the campaign window. Flat balances signal a stalled cascade.",
    quality: [
      "Balances are floored at zero; a tier reporting more issued than received shows 0 and surfaces instead as transit shrinkage.",
      "Facilities that have not yet submitted a Level 3 form are counted as still holding their full issue.",
    ],
  },
  {
    id: "stockout",
    label: "Stockout vulnerability index",
    group: "readiness",
    definition: "Health facilities at or near zero inventory ahead of the MDA round.",
    formula: "At risk = facilities with balance ≤ 0 or balance < 15% of quantity received ÷ total reporting facilities × 100",
    interpretation: "Any facility at zero stock during an active round is a service-delivery failure requiring same-day resupply.",
    quality: [
      "Only facilities that appear in at least one Level 2 transaction are counted; silent facilities are invisible to this index.",
      "The 15% low-stock threshold is configurable in code and applied uniformly across medicines.",
    ],
  },
  {
    id: "push-rate",
    label: "Downstream push rate",
    group: "flow",
    definition: "Proportion of usable LGA stock actually disbursed to frontline facilities, with the share moved inside the target window.",
    formula: "Push rate % = Σ issued to FLHF ÷ Σ net usable × 100",
    interpretation: "Target is ≥ 80% before campaign kickoff. Below 60% means facilities will start the round under-supplied.",
    quality: [
      "The on-time component uses the transaction date; consignments with no date are excluded from the timeliness split but still counted in the rate.",
    ],
  },
  {
    id: "lead-time",
    label: "Cascade lead time",
    group: "flow",
    definition: "Average number of days a consignment takes to move between tiers of the cascade.",
    formula: "Lead time = mean(date received at tier N+1 − date dispatched from tier N), in days",
    interpretation: "Each leg should complete within 3–7 days. Long LGA → facility legs are the usual cause of late campaign starts.",
    quality: [
      "The State → LGA leg depends on the dispatch date captured with the manual allocation; without it the leg shows '—' rather than an assumed value.",
      "Negative or implausible intervals (downstream date before upstream date) are excluded as data-entry errors.",
    ],
  },
  {
    id: "expiry-exposure",
    label: "Expiry exposure",
    group: "assurance",
    definition: "Batches already expired or expiring within 90 days, with the units still un-dispatched in those batches.",
    formula: "Counts of batches by days-to-expiry band, with units at risk = Σ batch balance for expired and ≤90-day batches",
    interpretation: "Expired stock must be quarantined and reported; short-dated stock should be issued first (FEFO).",
    quality: ["Batches with no expiry date recorded cannot be classified and are reported separately as 'unknown'."],
  },
  {
    id: "pod",
    label: "Proof-of-delivery compliance",
    group: "assurance",
    definition: "Share of transactions carrying verifiable delivery evidence at each level.",
    formula: "POD % = (L1 waybill/EDO or Logistic Officer signature + L2 facility signature + L3 CDD receipt photo present) ÷ total transactions × 100",
    interpretation: "Below 85% weakens audit defensibility; each missing proof is an unverifiable transfer.",
    quality: [
      "Attachment fields are treated as present when Kobo stores any non-empty filename — the image itself is not inspected for legibility.",
    ],
  },
  {
    id: "shrinkage",
    label: "Transit shrinkage rate",
    group: "integrity",
    definition:
      "Discrepancy between quantities shipped by the upstream tier and quantities confirmed received by the downstream recipient, aggregated across every cascade leg.",
    formula: "Transit loss % = (Qty issued upstream − Qty received downstream) ÷ Qty issued upstream × 100",
    interpretation: "Tolerance is 2%. Above 5% indicates systematic diversion, mis-recording or unreported damage requiring physical verification.",
    quality: [
      "Legs with no matched consignment are excluded rather than being scored as total loss.",
      "Negative variance (more confirmed downstream than dispatched) points to an unlogged consignment, not a surplus.",
      "The State → LGA leg can only be measured for medicines that have a manually entered allocation.",
    ],
  },
  {
    id: "expiry-risk",
    label: "Expiry risk index",
    group: "integrity",
    definition: "Proportion of current stock at LGA or health-facility stores that sits in batches within the configured expiry horizon (default 60 days).",
    formula: "Expiry risk % = Units on hand in batches expiring ≤ N days ÷ Total units on hand × 100",
    interpretation: "Above 5% requires an FEFO redistribution plan; above 15% means material write-off risk within the quarter.",
    quality: [
      "Batches missing an expiry date are excluded from the numerator, so the index is a lower bound on true exposure.",
      "With no stock on hand the index reports 0% instead of dividing by zero.",
    ],
  },
  {
    id: "buffer",
    label: "Buffer retention ratio",
    group: "readiness",
    definition: "Stock retained at LGA and facility warehouses relative to stock already deployed to CDDs, optionally measured up to campaign kickoff.",
    formula: "Buffer ratio = (LGA balance + facility balance) ÷ quantity deployed to CDDs",
    interpretation:
      "A ratio above 1.5 (retained share > 60%) means medicines are still in stores when CDDs should be mobilised; below 0.25 leaves no contingency for resupply.",
    quality: [
      "Setting a campaign kickoff date restricts the calculation to transactions on or before that date so post-kickoff resupply does not mask a late start.",
      "The ratio is undefined (shown as —) until at least one CDD issue is recorded.",
    ],
  },
  {
    id: "equity",
    label: "Facility equity index (CV)",
    group: "integrity",
    definition: "Dispersion of drug allocation across facilities within the same LGA, identifying over-served and under-served catchment areas.",
    formula: "CV = σ(units issued per facility) ÷ mean(units issued per facility) within each LGA, volume-weighted across LGAs. Gini reported alongside.",
    interpretation: "CV ≤ 0.25 is equitable, 0.25–0.50 moderate, above 0.50 inequitable. Facilities below 0.5× the LGA mean are flagged under-served.",
    quality: [
      "LGAs with a single reporting facility are excluded because dispersion is undefined.",
      "The index measures volume dispersion, not need — interpret alongside catchment population where available.",
    ],
  },
];

export const DOC_GROUPS: { id: KpiDoc["group"]; label: string; blurb: string }[] = [
  { id: "flow", label: "Flow & throughput", blurb: "How much medicine moved, how fast, and how much was lost to handling." },
  { id: "integrity", label: "Supply chain integrity & equity", blurb: "Whether what left the upstream tier arrived, and whether it was shared fairly." },
  { id: "readiness", label: "Readiness & availability", blurb: "Whether frontline points hold enough stock at the moment of need." },
  { id: "assurance", label: "Assurance & traceability", blurb: "Whether every transfer is evidenced and every batch traceable." },
];

export const kpiDoc = (id: string) => KPI_DOCS.find((d) => d.id === id);

/** Compact tooltip string: definition + formula + the leading data-quality note. */
export const kpiHint = (id: string) => {
  const d = kpiDoc(id);
  if (!d) return "";
  return `${d.definition}\n\nFormula: ${d.formula}\n\nReading it: ${d.interpretation}${d.quality[0] ? `\n\nData quality: ${d.quality[0]}` : ""}`;
};
