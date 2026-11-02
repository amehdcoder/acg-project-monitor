import { aggregate, t, totals, vaTotal, type EyeReportRow } from "./definition";

/** Ratios of summed measured outcomes, never averages of facility percentages or coverage proxies. */
export function routineMilestones(rows: EyeReportRow[]) {
  const a = aggregate(rows), s = a.summary, c = a.csom, sums = totals(s);
  const measured = vaTotal(c.followup.presenting);
  const good = measured > 0 ? c.followup.presenting.good / measured * 100 : null;
  return {
    reports: a.reports, facilities: a.facilities, cataract: t(s.surgery.cataract),
    glasses: t(sums.glasses), lenses: t(sums.lenses), tt: t(s.screen.tt), ttReferrals: t(s.referOut.tt),
    goodFollowup: good, goodCount: c.followup.presenting.good, measuredFollowup: measured,
    poorFollowup: measured > 0 ? c.followup.presenting.poor / measured * 100 : null,
  };
}