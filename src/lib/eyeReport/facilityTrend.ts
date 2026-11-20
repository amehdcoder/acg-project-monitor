import { aggregate, totals, t, type EyeReportRow } from './definition';

export type TrendGrain = 'day' | 'week' | 'month';
export const FACILITY_TREND_DEFAULTS = { state: '', lga: '', facility: '', grain: 'day' as TrendGrain };
export function filterFacilityTrend(rows: EyeReportRow[], state: string, lga: string, facility: string) {
  return rows.filter(r => (!state || r.state === state) && (!lga || r.lga === lga) && (!facility || r.facility_name === facility));
}
const bucket = (iso: string, grain: TrendGrain) => {
  if (grain === 'month') return iso.slice(0, 7);
  if (grain === 'day') return iso;
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10);
};
export function buildFacilityTrend(rows: EyeReportRow[], grain: TrendGrain) {
  const groups = new Map<string, EyeReportRow[]>();
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.report_date) || !Number.isFinite(Date.parse(`${r.report_date}T00:00:00Z`))) continue;
    const key = bucket(r.report_date, grain), list = groups.get(key) ?? []; list.push(r); groups.set(key, list);
  }
  const dates = [...groups.keys()].sort();
  if (!dates.length) return [];
  const out: { date: string; Submissions: number; Consulted: number; Surgeries: number }[] = [];
  for (let key = dates[0]; key <= dates[dates.length - 1];) {
    const list = groups.get(key) ?? [], total = totals(aggregate(list).summary);
    out.push({ date: key, Submissions: list.length, Consulted: t(total.consulted), Surgeries: t(total.surgeries) });
    const d = new Date(`${key}${grain === 'month' ? '-01' : ''}T00:00:00Z`);
    if (grain === 'month') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCDate(d.getUTCDate() + (grain === 'day' ? 1 : 7));
    key = d.toISOString().slice(0, grain === 'month' ? 7 : 10);
  }
  return out;
}