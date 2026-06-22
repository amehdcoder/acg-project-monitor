import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ALL_CLASSES, NOT_FOUND_REASONS, OPERATIONAL_STATUS } from "@/lib/bloomberg/definition";
import { buildAccountability, type ProfileLite } from "@/lib/accountability";
import { prettyAdminLabel } from "@/lib/formLabelUtils";
import { meanConfidenceInterval, oneWayAnova } from "@/lib/statisticalInference";

export interface ValidationVerification {
  school_exists?: "yes" | "no" | "";
  not_found_reason?: string;
  operational_status?: string;
  head_teacher?: string;
  head_phone?: string;
  date_of_visit?: string;
  register_available?: boolean;
}

export interface ValidationRow {
  id: string;
  validator_id: string | null;
  school_key: string | null;
  school_name: string | null;
  school_type: string | null;
  school_code: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  total_male: number | null;
  total_female: number | null;
  grand_total: number | null;
  verification: ValidationVerification | null;
  status: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface BaselineRow {
  school_key: string;
  total_male: number | null;
  total_female: number | null;
  grand_total: number | null;
}

export interface LocalAuditRow {
  user_id: string;
  device_id: string;
  device_label: string | null;
  drafts: number | null;
  ready_to_send: number | null;
  submitted: number | null;
  last_activity_at: string | null;
  updated_at: string | null;
}

const REASON_LABEL = new Map(NOT_FOUND_REASONS.map((r) => [r.value, r.label]));
const OP_STATUS_LABEL = new Map(OPERATIONAL_STATUS.map((r) => [r.value, r.label]));

const isReportedValidation = (v: Pick<ValidationRow, "status" | "submitted_at">) =>
  ["sent", "submitted", "finalized"].includes(String(v.status || "").toLowerCase()) ||
  (!!v.submitted_at && String(v.status || "").toLowerCase() !== "draft");

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}

export interface SchoolLite {
  school_key: string;
  school_name: string | null;
  school_type: string | null;
  school_code: string | null;
  state: string | null;
  lga: string | null;
  state_label?: string | null;
  lga_label?: string | null;
  ward_label?: string | null;
  location_label?: string | null;
  ward?: string | null;
  location?: string | null;
}

export const useBloombergDashboard = () => {
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [baselines, setBaselines] = useState<BaselineRow[]>([]);
  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [schoolCount, setSchoolCount] = useState(0);
  const [profileMap, setProfileMap] = useState<Map<string, ProfileLite>>(new Map());
  const [localAuditRows, setLocalAuditRows] = useState<LocalAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Monotonic request id: any async load tags itself with the current value
  // and discards its result if a newer load has started.
  const reqIdRef = useRef(0);
  const reloadTimerRef = useRef<number | null>(null);
  const reload = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const [v, b, s] = await Promise.all([
        fetchAll<ValidationRow>(
          "bloomberg_validations",
          "id,validator_id,school_key,school_name,school_type,school_code,state,lga,ward,gps_lat,gps_lng,total_male,total_female,grand_total,verification,status,submitted_at,updated_at,created_at",
        ),
        fetchAll<BaselineRow>("bloomberg_school_baselines", "school_key,total_male,total_female,grand_total"),
        fetchAll<SchoolLite>(
          "bloomberg_schools",
          "school_key,school_name,school_type,school_code,state,lga,ward,location,state_label,lga_label,ward_label,location_label",
        ),
      ]);
      const count = s.length;

      // Per-device local form audit reported by every user's device.
      const audit = await fetchAll<LocalAuditRow>(
        "bloomberg_local_form_audit",
        "user_id,device_id,device_label,drafts,ready_to_send,submitted,last_activity_at,updated_at",
      ).catch(() => [] as LocalAuditRow[]);

      // Resolve validator names for the accountability table — include both
      // submitters and any user who only has local drafts/ready-to-send.
      const ids = [
        ...new Set([
          ...v.map((r) => r.validator_id).filter(Boolean),
          ...audit.map((r) => r.user_id).filter(Boolean),
        ]),
      ] as string[];
      const pm = new Map<string, ProfileLite>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,first_name,last_name,email")
          .in("user_id", ids);
        (profs || []).forEach((p: any) => {
          const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "User";
          pm.set(p.user_id, { name, email: p.email || "" });
        });
      }

      if (myReq !== reqIdRef.current) return;
      setLocalAuditRows(audit);
      setValidations(v);
      setBaselines(b);
      setSchools(s);
      setSchoolCount(count || 0);
      setProfileMap(pm);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const myReq = ++reqIdRef.current;
    setValidations([]);
    setBaselines([]);
    setSchools([]);
    setSchoolCount(0);
    void reload();
    const scheduleReload = () => {
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        void reload();
      }, 800);
    };
    const onMigrated = () => scheduleReload();
    window.addEventListener("bloomberg:ready-to-send-migrated", onMigrated);
    const channel = supabase
      .channel("bloomberg-validations-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bloomberg_validations" },
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bloomberg_local_form_audit" },
        () => scheduleReload(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("bloomberg:ready-to-send-migrated", onMigrated);
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(channel);
      if (myReq === reqIdRef.current) reqIdRef.current++;
    };
  }, []);


  const baselineByKey = useMemo(() => {
    const m = new Map<string, BaselineRow>();
    baselines.forEach((b) => m.set(b.school_key, b));
    return m;
  }, [baselines]);

  // School register lookup so a submission that is missing its own state/lga
  // codes can still be placed in the correct geography via its school_key.
  // This eliminates spurious "Unknown" rows in the State & LGA table whenever
  // the school itself is known.
  const schoolMetaByKey = useMemo(() => {
    const m = new Map<string, { state: string | null; lga: string | null }>();
    schools.forEach((s) => m.set(s.school_key, { state: s.state ?? null, lga: s.lga ?? null }));
    return m;
  }, [schools]);

  // Resolve a submission's effective state/lga codes: prefer the values stored
  // on the submission, else fall back to the school register by school_key.
  const resolveGeo = (v: Pick<ValidationRow, "state" | "lga" | "school_key">) => {
    let state = v.state;
    let lga = v.lga;
    if ((!state || !lga) && v.school_key) {
      const meta = schoolMetaByKey.get(v.school_key);
      if (meta) {
        state = state || meta.state;
        lga = lga || meta.lga;
      }
    }
    return { state, lga };
  };


  // Human-readable admin-unit labels. Submissions store raw option codes
  // (state="bauchi", lga="bauchi_ganjuwa"); the schools register carries the
  // matching display labels (state_label="Bauchi", lga_label="Ganjuwa"). We
  // build code→label maps from the register so every table on the dashboard
  // renders proper names instead of raw codes. Falls back to a deterministic
  // prettifier for any code not present in the register.
  const labelMaps = useMemo(() => {
    const state = new Map<string, string>();
    const lga = new Map<string, string>();
    const ward = new Map<string, string>();
    const loc = new Map<string, string>();
    schools.forEach((s) => {
      if (s.state && s.state_label) state.set(s.state, s.state_label);
      if (s.lga && s.lga_label) lga.set(s.lga, s.lga_label);
      if (s.ward && s.ward_label) ward.set(s.ward, s.ward_label);
      if (s.location && s.location_label) loc.set(s.location, s.location_label);
    });
    return { state, lga, ward, loc };
  }, [schools]);

  const stateName = (code: string | null | undefined) =>
    (code && labelMaps.state.get(code)) || prettyAdminLabel(code) || "—";
  const lgaName = (stateCode: string | null | undefined, code: string | null | undefined) =>
    (code && labelMaps.lga.get(code)) || prettyAdminLabel(code, stateCode) || "—";
  const wardName = (
    stateCode: string | null | undefined,
    lgaCode: string | null | undefined,
    code: string | null | undefined,
  ) => (code && labelMaps.ward.get(code)) || prettyAdminLabel(code, lgaCode || stateCode) || "—";


  // De-duplicate validated schools: a single school must appear only ONCE on the
  // dashboard, otherwise totals, coverage and discrepancy analysis are inflated
  // and misleading. When the same school has multiple sent submissions we keep
  // the most recent one (by submitted_at → updated_at → created_at). Entries
  // without a school_key cannot be de-duplicated, so each is kept individually.
  const dedupedSent = useMemo(() => {
    const ts = (v: ValidationRow) =>
      new Date(v.submitted_at || v.updated_at || v.created_at).getTime();
    const byKey = new Map<string, ValidationRow>();
    const noKey: ValidationRow[] = [];
    validations
      .filter(isReportedValidation)
      .forEach((v) => {
        if (!v.school_key) {
          noKey.push(v);
          return;
        }
        const existing = byKey.get(v.school_key);
        if (!existing || ts(v) >= ts(existing)) byKey.set(v.school_key, v);
      });
    return [...byKey.values(), ...noKey];
  }, [validations]);

  // Duplicate audit trail: a single school validated more than once. The most
  // recent reported entry is the "survivor" that the dashboard counts; the older
  // copies are superseded duplicates. This explains why the entries table (all
  // rows) shows more records than the validated-schools count (distinct schools).
  // Each copy carries the validator's name and the date it was sent.
  const duplicates = useMemo(() => {
    const ts = (v: ValidationRow) =>
      new Date(v.submitted_at || v.updated_at || v.created_at).getTime();
    const byKey = new Map<string, ValidationRow[]>();
    validations.filter(isReportedValidation).forEach((v) => {
      if (!v.school_key) return;
      const arr = byKey.get(v.school_key) || [];
      arr.push(v);
      byKey.set(v.school_key, arr);
    });
    const nameOf = (v: ValidationRow) =>
      (v.validator_id && profileMap.get(v.validator_id)?.name) || "Unknown user";
    const dateOf = (v: ValidationRow) =>
      v.submitted_at || v.updated_at || v.created_at || null;
    let extraEntries = 0;
    const groups: {
      schoolKey: string;
      school: string;
      code: string;
      state: string;
      lga: string;
      total: number;
      extras: number;
      crossValidator: boolean;
      validators: string[];
      copies: { id: string; validator: string; date: string | null; kept: boolean }[];
    }[] = [];
    // Per-validator tally of how many SUPERSEDED (extra) copies each person produced.
    const validatorExtras = new Map<string, number>();
    let sameValidatorGroups = 0; // school re-validated by the same person
    let crossValidatorGroups = 0; // school validated by different people
    byKey.forEach((arr, key) => {
      if (arr.length < 2) return;
      const sorted = [...arr].sort((a, b) => ts(b) - ts(a)); // newest first = survivor
      extraEntries += arr.length - 1;
      const uniqueValidators = Array.from(new Set(sorted.map((v) => nameOf(v))));
      const crossValidator = uniqueValidators.length > 1;
      if (crossValidator) crossValidatorGroups += 1;
      else sameValidatorGroups += 1;
      // Attribute each superseded copy (all but the kept survivor) to its validator.
      sorted.slice(1).forEach((v) => {
        const n = nameOf(v);
        validatorExtras.set(n, (validatorExtras.get(n) || 0) + 1);
      });
      groups.push({
        schoolKey: key,
        school: sorted[0].school_name || "Unknown",
        code: sorted[0].school_code || key,
        state: stateName(sorted[0].state),
        lga: lgaName(sorted[0].state, sorted[0].lga),
        total: arr.length,
        extras: arr.length - 1,
        crossValidator,
        validators: uniqueValidators,
        copies: sorted.map((v, i) => ({
          id: v.id,
          validator: nameOf(v),
          date: dateOf(v),
          kept: i === 0,
        })),
      });
    });
    groups.sort((a, b) => b.extras - a.extras || a.school.localeCompare(b.school));
    const validatorBreakdown = Array.from(validatorExtras.entries())
      .map(([validator, extras]) => ({ validator, extras }))
      .sort((a, b) => b.extras - a.extras);
    const totalReported = validations.filter(isReportedValidation).length;
    return {
      schoolsWithDuplicates: groups.length,
      extraEntries,
      sameValidatorGroups,
      crossValidatorGroups,
      validatorBreakdown,
      totalReported,
      groups,
    };
  }, [validations, profileMap, labelMaps]);

  const stats = useMemo(() => {
    const submitted = dedupedSent;
    const draft = validations.filter((v) => v.status === "draft");
    const validatedTotal = submitted.reduce((s, v) => s + (v.grand_total ?? 0), 0);
    const validatedMale = submitted.reduce((s, v) => s + (v.total_male ?? 0), 0);
    const validatedFemale = submitted.reduce((s, v) => s + (v.total_female ?? 0), 0);

    // Baseline total only for schools that have been validated (apples to apples).
    let baselineTotal = 0;
    const discrepancies: { school: string; baseline: number; validated: number; diff: number; pct: number }[] = [];
    submitted.forEach((v) => {
      const b = v.school_key ? baselineByKey.get(v.school_key) : undefined;
      const bt = b?.grand_total ?? 0;
      baselineTotal += bt;
      const validated = v.grand_total ?? 0;
      const diff = validated - bt;
      const pct = bt > 0 ? (diff / bt) * 100 : 0;
      if (bt > 0) {
        discrepancies.push({ school: v.school_name || "Unknown", baseline: bt, validated, diff, pct });
      }
    });
    discrepancies.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

    // "Schools Validated" = distinct REGISTERED schools that were validated
    // (those matched to a school_key). Entries without a school_key are not in
    // the schools register, so they cannot count toward coverage.
    const validatedSchools = new Set(
      submitted.map((v) => v.school_key).filter(Boolean) as string[],
    ).size;
    const coveragePct = schoolCount > 0 ? (validatedSchools / schoolCount) * 100 : 0;
    const overallPct = baselineTotal > 0 ? ((validatedTotal - baselineTotal) / baselineTotal) * 100 : 0;

    // --- Single source of truth for the duplicate reconciliation ---
    // Submissions          = every reported entry from all users (raw count).
    // Unique validations    = the de-duplicated set the dashboard counts
    //                         (one survivor per school + each unkeyed entry).
    // Duplicate submissions = superseded copies = Submissions − Unique validations.
    // This is IDENTICAL to duplicates.extraEntries (the exact rows listed in the
    // Duplicate Validation Entries audit), so the KPI card, the audit header and
    // the per-validator breakdown always reconcile to the SAME figure.
    const submittedCount = validations.filter(isReportedValidation).length;
    const uniqueValidations = submitted.length; // dedupedSent
    const duplicateCount = submittedCount - uniqueValidations;

    return {
      totalSchools: schoolCount,
      validatedSchools,
      uniqueValidations,
      schoolsWithDuplicates: duplicates.schoolsWithDuplicates,
      submittedCount,
      duplicateCount,
      draftCount: draft.length,
      validatedTotal,
      validatedMale,
      validatedFemale,
      baselineTotal,
      overallPct,
      coveragePct,
      discrepancies: discrepancies.slice(0, 10),
    };
  }, [dedupedSent, validations, baselineByKey, schoolCount, duplicates]);

  const submittedValidations = useMemo(
    () => dedupedSent,
    [dedupedSent],
  );

  // Per-user accountability: only schools actually visited & reported
  // (submitted or finalized), grouped by the field validator who did the work.
  const accountability = useMemo(() => {
    const reported = validations.filter(isReportedValidation);
    return buildAccountability(
      reported.map((v) => ({
        userId: v.validator_id,
        unitName: v.school_name || "Unnamed school",
        state: stateName(v.state),
        lga: lgaName(v.state, v.lga),
        start: v.created_at,
        end: v.submitted_at || v.updated_at,
        status: v.status || "sent",
      })),
      profileMap,
    );
  }, [validations, profileMap, labelMaps]);

  // Cross-device form audit for the Accountability section. Two sources are
  // combined so every figure is accurate and verifiable:
  //   • Drafts & Ready-to-send live ONLY on each user's device, so they come
  //     from the per-device reports in bloomberg_local_form_audit.
  //   • Successfully submitted is taken from the SERVER (bloomberg_validations),
  //     which is the authoritative record of what actually landed on the
  //     dashboard. This avoids under/over-counting when local "sent" copies are
  //     pruned, re-synced, or submitted from a different device — the submitted
  //     column then reconciles exactly with the Submissions KPI.
  const deviceAudit = useMemo(() => {
    // Authoritative submitted count per validator (raw reported entries).
    const serverSubmitted = new Map<string, number>();
    validations.filter(isReportedValidation).forEach((v) => {
      if (!v.validator_id) return;
      serverSubmitted.set(v.validator_id, (serverSubmitted.get(v.validator_id) || 0) + 1);
    });

    const byUser = new Map<
      string,
      { userId: string; name: string; email: string; drafts: number; readyToSend: number; submitted: number; devices: number; lastActivity: string | null }
    >();
    const ensureRow = (userId: string) => {
      let row = byUser.get(userId);
      if (!row) {
        const prof = profileMap.get(userId);
        row = {
          userId,
          name: prof?.name || "Unknown user",
          email: prof?.email || "",
          drafts: 0,
          readyToSend: 0,
          submitted: 0,
          devices: 0,
          lastActivity: null as string | null,
        };
        byUser.set(userId, row);
      }
      return row;
    };

    // Device-local drafts & ready-to-send.
    localAuditRows.forEach((r) => {
      const row = ensureRow(r.user_id);
      row.drafts += r.drafts ?? 0;
      row.readyToSend += r.ready_to_send ?? 0;
      row.devices += 1;
      const la = r.last_activity_at || r.updated_at;
      if (la && (!row.lastActivity || new Date(la).getTime() > new Date(row.lastActivity).getTime())) {
        row.lastActivity = la;
      }
    });

    // Authoritative submitted count (also surfaces users who submitted but have
    // not yet reported a device audit row).
    serverSubmitted.forEach((count, userId) => {
      ensureRow(userId).submitted = count;
    });

    const rows = [...byUser.values()].sort(
      (a, b) =>
        b.drafts + b.readyToSend + b.submitted - (a.drafts + a.readyToSend + a.submitted) ||
        a.name.localeCompare(b.name),
    );
    const totals = rows.reduce(
      (t, r) => ({
        drafts: t.drafts + r.drafts,
        readyToSend: t.readyToSend + r.readyToSend,
        submitted: t.submitted + r.submitted,
      }),
      { drafts: 0, readyToSend: 0, submitted: 0 },
    );
    return { rows, totals, deviceCount: localAuditRows.length, userCount: rows.length };
  }, [localAuditRows, profileMap, validations]);


  const byState = useMemo(() => {
    const m = new Map<string, number>();
    submittedValidations.forEach((v) => {
      const key = stateName(v.state);
      m.set(key, (m.get(key) || 0) + 1);
    });
    return [...m.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);
  }, [submittedValidations, labelMaps]);

  // State → LGA disaggregation for the Validation Dashboard drill-down.
  // Each state aggregates its LGAs; each level carries submission counts,
  // validated pupils, baseline and variance — plus a 95% confidence interval
  // and a statistical-significance verdict computed from the per-school
  // percent-variance sample within that unit.
  const stateBreakdown = useMemo(() => {
    const submitted = submittedValidations;

    interface Agg {
      submissions: number;
      validatedSchools: Set<string>;
      validated: number;
      baseline: number;
      notFound: number;
      // Per-school percent variance (only schools with a baseline) — the
      // sample used for inference at this level.
      sample: number[];
    }
    const newAgg = (): Agg => ({ submissions: 0, validatedSchools: new Set(), validated: 0, baseline: 0, notFound: 0, sample: [] });

    const states = new Map<string, { agg: Agg; lgas: Map<string, Agg> }>();

    submitted.forEach((v) => {
      const geo = resolveGeo(v);
      const st = (geo.state || "__unspecified__").toString();
      const lga = (geo.lga || "__unspecified__").toString();
      if (!states.has(st)) states.set(st, { agg: newAgg(), lgas: new Map() });
      const node = states.get(st)!;
      if (!node.lgas.has(lga)) node.lgas.set(lga, newAgg());
      const lgaAgg = node.lgas.get(lga)!;

      const b = v.school_key ? baselineByKey.get(v.school_key) : undefined;
      const bt = b?.grand_total ?? 0;
      const val = v.grand_total ?? 0;
      const isNotFound = v.verification?.school_exists === "no";
      const schoolPct = bt > 0 ? ((val - bt) / bt) * 100 : null;

      [node.agg, lgaAgg].forEach((a) => {
        a.submissions += 1;
        if (v.school_key) a.validatedSchools.add(v.school_key);
        a.validated += val;
        a.baseline += bt;
        if (isNotFound) a.notFound += 1;
        if (schoolPct !== null) a.sample.push(schoolPct);
      });
    });

    const variance = (a: Agg) => (a.baseline > 0 ? ((a.validated - a.baseline) / a.baseline) * 100 : 0);
    const ciOf = (a: Agg) => {
      const ci = meanConfidenceInterval(a.sample);
      return {
        sampleSize: a.sample.length,
        ciLow: ci?.ciLow ?? null,
        ciHigh: ci?.ciHigh ?? null,
        significant: ci?.significant ?? false,
        pValue: ci?.pValue ?? null,
      };
    };

    const rows = [...states.entries()]
      .map(([state, node]) => ({
        state: stateName(state),
        submissions: node.agg.submissions,
        validatedSchools: node.agg.validatedSchools.size,
        validated: node.agg.validated,
        baseline: node.agg.baseline,
        notFound: node.agg.notFound,
        variancePct: variance(node.agg),
        ...ciOf(node.agg),
        lgas: [...node.lgas.entries()]
          .map(([lga, a]) => ({
            lga: lgaName(state, lga),
            submissions: a.submissions,
            validatedSchools: a.validatedSchools.size,
            validated: a.validated,
            baseline: a.baseline,
            notFound: a.notFound,
            variancePct: variance(a),
            ...ciOf(a),
          }))
          .sort((x, y) => y.submissions - x.submissions || x.lga.localeCompare(y.lga)),
      }))
      .sort((x, y) => y.submissions - x.submissions || x.state.localeCompare(y.state));

    return rows;
  }, [submittedValidations, baselineByKey, labelMaps]);

  // Overall statistical inference: one-way ANOVA tests whether the enrolment
  // variance genuinely differs across States (and across LGAs) at the 95%
  // confidence level, rather than being random noise.
  const inference = useMemo(() => {
    const stateSamples = new Map<string, number[]>();
    const lgaSamples = new Map<string, number[]>();
    submittedValidations.forEach((v) => {
      const b = v.school_key ? baselineByKey.get(v.school_key) : undefined;
      const bt = b?.grand_total ?? 0;
      if (bt <= 0) return;
      const pct = (((v.grand_total ?? 0) - bt) / bt) * 100;
      const st = (v.state || "Unknown").toString();
      const lga = `${st}::${(v.lga || "Unknown").toString()}`;
      (stateSamples.get(st) || stateSamples.set(st, []).get(st)!).push(pct);
      (lgaSamples.get(lga) || lgaSamples.set(lga, []).get(lga)!).push(pct);
    });
    return {
      byState: oneWayAnova([...stateSamples.values()]),
      byLga: oneWayAnova([...lgaSamples.values()]),
    };
  }, [submittedValidations, baselineByKey]);

  const points = useMemo(
    () =>
      submittedValidations
        .filter((v) => v.gps_lat != null && v.gps_lng != null)
        .map((v) => ({ lat: v.gps_lat as number, lng: v.gps_lng as number, status: v.status || "draft", name: v.school_name || "" })),
    [submittedValidations],
  );

  // Schools reported as not existing / not found during field validation.
  const nonExistent = useMemo(() => {
    const rows = submittedValidations
      .filter((v) => v.verification?.school_exists === "no")
      .map((v) => {
        const reasonVal = v.verification?.not_found_reason || "other";
        return {
          id: v.id,
          school: v.school_name || "Unknown",
          code: v.school_code || v.school_key || "—",
          state: stateName(v.state),
          lga: lgaName(v.state, v.lga),
          ward: wardName(v.state, v.lga, v.ward),
          reasonValue: reasonVal,
          reason: REASON_LABEL.get(reasonVal) || reasonVal || "Other",
          status: v.status || "draft",
          date: v.verification?.date_of_visit || v.submitted_at || v.created_at,
        };
      })
      .sort((a, b) => a.state.localeCompare(b.state) || a.school.localeCompare(b.school));

    // Reason breakdown for the analytics chart.
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.reasonValue, (counts.get(r.reasonValue) || 0) + 1));
    const reasonAnalysis = NOT_FOUND_REASONS
      .map((r) => ({
        key: r.value,
        name: r.label,
        count: counts.get(r.value) || 0,
        pct: rows.length > 0 ? ((counts.get(r.value) || 0) / rows.length) * 100 : 0,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    return { rows, reasonAnalysis, total: rows.length };
  }, [submittedValidations, labelMaps]);

  // Full register of validated schools with status & variance vs baseline.
  const validatedTable = useMemo(() => {
    return submittedValidations
      .filter((v) => v.verification?.school_exists !== "no")
      .map((v) => {
        const b = v.school_key ? baselineByKey.get(v.school_key) : undefined;
        const baseline = b?.grand_total ?? 0;
        const validated = v.grand_total ?? 0;
        const diff = validated - baseline;
        const pct = baseline > 0 ? (diff / baseline) * 100 : 0;
        const hasBaseline = baseline > 0;
        // A material variance is anything beyond ±2% (rounding tolerance).
        const hasVariance = hasBaseline ? Math.abs(pct) >= 2 : diff !== 0;
        const opStatus = v.verification?.operational_status;
        return {
          id: v.id,
          school: v.school_name || "Unknown",
          code: v.school_code || v.school_key || "—",
          state: stateName(v.state),
          lga: lgaName(v.state, v.lga),
          type: v.school_type || "—",
          baseline,
          validated,
          diff,
          pct,
          hasBaseline,
          hasVariance,
          status: v.status || "draft",
          operational: opStatus ? OP_STATUS_LABEL.get(opStatus) || opStatus : null,
          operationalValue: opStatus || null,
        };
      })
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.school.localeCompare(b.school));
  }, [submittedValidations, baselineByKey, labelMaps]);

  // Schools that have NOT been validated yet — every school in the register that
  // has no submitted/validated entry. Baseline enrolment figures are shown;
  // the validated enrolment is intentionally left blank (not yet collected).
  const notValidatedTable = useMemo(() => {
    const validatedKeys = new Set(
      submittedValidations.map((v) => v.school_key).filter(Boolean) as string[],
    );
    return schools
      .filter((s) => !validatedKeys.has(s.school_key))
      .map((s) => {
        const b = baselineByKey.get(s.school_key);
        const baseline = b?.grand_total ?? 0;
        return {
          id: s.school_key,
          school: s.school_name || "Unnamed school",
          code: s.school_code || s.school_key || "—",
          state: stateName(s.state),
          lga: lgaName(s.state, s.lga),
          type: s.school_type || "—",
          baseline,
          hasBaseline: baseline > 0,
          baselineMale: b?.total_male ?? null,
          baselineFemale: b?.total_female ?? null,
        };
      })
      .sort(
        (a, b) =>
          a.state.localeCompare(b.state) ||
          a.lga.localeCompare(b.lga) ||
          a.school.localeCompare(b.school),
      );
  }, [schools, submittedValidations, baselineByKey, labelMaps]);

  // Recovered submissions: entries that were stuck in a device's "Ready to
  // send" tab (old draft/finalize form) and auto-pushed to the server by the
  // client migration. Tagged via verification._recovered_from_ready_to_send.
  // Surfaced as an admin-only indicator so supervisors can see how many
  // entries each validator's device recovered after signing in.
  const recovery = useMemo(() => {
    const recovered = validations.filter(
      (v) => (v.verification as any)?._recovered_from_ready_to_send === true,
    );
    const byValidator = new Map<string, { name: string; count: number; lastAt: number }>();
    recovered.forEach((v) => {
      const id = v.validator_id || "unknown";
      const name = (v.validator_id && profileMap.get(v.validator_id)?.name) || "Unknown user";
      const at = Date.parse((v.verification as any)?._recovered_at || v.created_at) || 0;
      const prev = byValidator.get(id);
      if (prev) {
        prev.count += 1;
        if (at > prev.lastAt) prev.lastAt = at;
      } else {
        byValidator.set(id, { name, count: 1, lastAt: at });
      }
    });
    const validators = [...byValidator.values()]
      .map((r) => ({ ...r, lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return {
      total: recovered.length,
      validatorCount: validators.length,
      validators,
    };
  }, [validations, profileMap]);

  // Owner-only hard delete of validation entries. Removes the rows from the
  // database so they immediately disappear from every dashboard view.
  const deleteValidations = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("bloomberg_validations")
      .delete()
      .in("id", ids);
    if (error) throw error;
    // Optimistically drop locally, then re-sync from server.
    setValidations((prev) => prev.filter((v) => !ids.includes(v.id)));
    await reload();
  };

  return {
    validations, baselines, stats, byState, stateBreakdown, inference, points, nonExistent, validatedTable, notValidatedTable, accountability,
    recovery, duplicates, deviceAudit, loading, reload, deleteValidations, ALL_CLASSES,
  };
};
