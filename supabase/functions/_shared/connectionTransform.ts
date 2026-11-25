// Mirrored in src/lib/integrations/connectionTransform.ts — keep both identical.
// Translates records between an external system's shape and Amehnities
// Longitudinal Beneficiary Records using a saved connection's field mappings.
export type ConnMap = { external: string; internal: string }
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const SAFE = /^[A-Za-z0-9_\- .\/:]{1,120}$/
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor'])

export function getPath(o: unknown, path: string): unknown {
  // Kobo/ODK send flat group paths such as "respondent/name" — exact keys win.
  if (isObj(o) && !BLOCKED.has(path) && Object.prototype.hasOwnProperty.call(o, path)) return o[path]
  let cur: unknown = o
  for (const p of path.split('.')) {
    if (BLOCKED.has(p)) return undefined
    // DHIS2-style lists: attributes.First name → item whose attribute/code/displayName matches.
    if (Array.isArray(cur)) { const hit = cur.find((x) => isObj(x) && [x.attribute, x.code, x.displayName, x.dataElement].includes(p)); cur = isObj(hit) ? hit.value : undefined; continue }
    if (!isObj(cur)) return undefined; cur = cur[p]
  }
  return cur
}
export function setPath(o: Obj, path: string, v: unknown) {
  const parts = path.split('.')
  if (parts.some((p) => !p || BLOCKED.has(p))) return
  let cur = o
  for (const p of parts.slice(0, -1)) { if (!isObj(cur[p])) cur[p] = {}; cur = cur[p] as Obj }
  cur[parts[parts.length - 1]] = v
}
export function cleanMaps(raw: unknown): ConnMap[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((m): m is ConnMap => isObj(m) && typeof m.external === 'string' && typeof m.internal === 'string'
    && SAFE.test(m.external) && SAFE.test(m.internal) && ![m.external, m.internal].some((x) => x.split('.').some((p) => BLOCKED.has(p)))).slice(0, 500)
}

const CORE = ['case_id', 'full_name', 'status', 'risk_level', 'state', 'lga', 'ward', 'village', 'next_follow_up_date']
const scalar = (v: unknown) => v == null ? undefined : typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : undefined) : v

/** External record → { beneficiary, service } in Amehnities API shape. */
export function inbound(record: Obj, maps: ConnMap[]): { beneficiary: Obj; service: Obj | null } {
  const beneficiary: Obj = {}; const profile: Obj = {}; const service: Obj = {}; const data: Obj = {}
  for (const m of maps) {
    const v = scalar(getPath(record, m.external)); if (v === undefined || v === '') continue
    const k = m.internal
    if (k.startsWith('service.data.')) data[k.slice(13)] = v
    else if (k.startsWith('service.')) service[k.slice(8)] = v
    else if (k.startsWith('profile.')) profile[k.slice(8)] = v
    else if (CORE.includes(k)) beneficiary[k] = typeof v === 'string' ? v : String(v)
  }
  if (Object.keys(profile).length) beneficiary.profile = profile
  if (Object.keys(data).length) service.data = data
  if (beneficiary.status) beneficiary.status = String(beneficiary.status).toLowerCase().replace(/[\s-]+/g, '_')
  if (beneficiary.risk_level) beneficiary.risk_level = String(beneficiary.risk_level).toLowerCase()
  return { beneficiary, service: Object.keys(service).length ? service : null }
}

/** Amehnities beneficiary (+ optional service) → external system's shape. */
export function outbound(ben: Obj, service: Obj | null, maps: ConnMap[]): Obj {
  const out: Obj = {}
  for (const m of maps) {
    const k = m.internal
    const v = k.startsWith('service.') ? (service ? getPath(service, k.slice(8)) : undefined) : getPath(ben, k)
    if (v !== undefined && v !== null) setPath(out, m.external, v)
  }
  return out
}
