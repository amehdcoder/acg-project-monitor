// external-api: REST API for external/donor systems to read Amehnities data.
// Auth: `Authorization: Bearer amk_...` API key (hashed server-side, project-scoped).
//
// Routes (all GET):
//   /external-api/v1/projects
//   /external-api/v1/beneficiaries?updated_since=&cursor=&limit=
//   /external-api/v1/beneficiaries/{case_id}
//   /external-api/v1/services?from=&to=&component_key=a,b&cursor=
//   /external-api/v1/aggregates?period=YYYY-MM
//   /external-api/v1/reports
//   /external-api/v1/components
// Routes (POST, records:write): /v1/beneficiaries (upsert by case_id), /v1/services
import { inbound, outbound, cleanMaps, inboundForm, outboundForm } from '../_shared/connectionTransform.ts'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseCursor } from './cursor.ts'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

type ApiKey = { key_id: string; project_id: string; scopes: string[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/external-api\/?/, '').replace(/\/$/, '')
  const parts = path.split('/').filter(Boolean)
  const q = url.searchParams
  // Donor dashboards use the caller's session and existing donor-only RLS/RPCs.
  // Integration keys are never required in, or exposed to, the browser.
  if (parts.join('/') === 'v1/dashboard') {
    if (!auth.startsWith('Bearer ') || auth.startsWith('Bearer amk_')) return json({ error: 'Donor sign-in required' }, 401)
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await client.auth.getUser()
    if (!user) return json({ error: 'Please sign in again' }, 401)
    const projectId = q.get('project_id')
    if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return json({ error: 'Valid project required' }, 400)
    const { data: aggregates, error: denied } = await client.rpc('donor_project_aggregates', { _project_id: projectId })
    if (denied) return json({ error: 'No donor access to this project' }, 403)
    const [activity, reports, logframe] = await Promise.all([
      client.rpc('donor_field_activity', { _project_id: projectId, _limit: 30 }),
      client.from('programme_reports').select('id, period_label, report_year, notes, status, created_at, entries:programme_report_entries(indicator_code, value, disaggregation, risk)').eq('project_id', projectId).in('status', ['submitted', 'resolved']).order('created_at', { ascending: false }),
      client.from('programme_logframes').select('data').eq('project_id', projectId).maybeSingle(),
    ])
    if (activity.error || reports.error || logframe.error) return json({ error: 'Could not load programme data' }, 500)
    return json({ data: { aggregates, activity: activity.data ?? [], reports: reports.data ?? [], logframe: logframe.data?.data ?? null } })
  }
  if (!auth.startsWith('Bearer amk_')) return json({ error: 'Missing or invalid API key. Use Authorization: Bearer amk_...' }, 401)
  const rawKey = auth.replace('Bearer ', '').trim()

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const hash = await sha256Hex(rawKey)
  const { data: keyRows, error: keyErr } = await supabase.rpc('validate_api_key', { _key_hash: hash })
  if (keyErr || !keyRows || keyRows.length === 0) return json({ error: 'Invalid or revoked API key' }, 401)
  const key = keyRows[0] as ApiKey


  const needScope = (scope: string) => key.scopes.includes(scope) || key.scopes.includes('*')

  try {
    if (parts[1] === 'connection' && parts[2] === 'records' && parts.length === 3) return await handleConnection(supabase, key, req, q)
    if (req.method === 'POST') return await handleWrite(supabase, key, parts, req)
    if (parts.length === 2 && parts[1] === 'components') {
      const { data, error } = await supabase.from('programme_modules').select('id, name, config').eq('project_id', key.project_id)
      if (error) return json({ error: 'Could not load components' }, 500)
      return json({ data: (data ?? []).map((m: any) => ({ module_id: m.id, module_name: m.name, components: (m.config?.components ?? []).filter((c: any) => !c.hidden).map((c: any) => ({ key: c.key, label: c.label, services: c.services ?? [] })) })) })
    }
    // /v1/projects
    if (parts.length === 2 && parts[1] === 'projects') {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, description, status, start_date, end_date, scope_states, scope_lgas')
        .eq('id', key.project_id)
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ data: [data] })
    }

    // /v1/beneficiaries and /v1/beneficiaries/{case_id}
    if (parts[1] === 'beneficiaries') {
      if (!needScope('records:read')) return json({ error: 'Key lacks records:read scope' }, 403)

      if (parts.length === 3) {
        const caseId = decodeURIComponent(parts[2])
        if (caseId.length > 64) return json({ error: 'Invalid case id' }, 400)
        const { data, error } = await supabase
          .from('beneficiaries')
          .select('id, case_id, full_name, status, risk_level, state, lga, ward, village, profile, next_follow_up_date, version, created_at, updated_at')
          .eq('project_id', key.project_id)
          .eq('case_id', caseId)
          .maybeSingle()
        if (error) return json({ error: error.message }, 500)
        if (!data) return json({ error: 'Not found' }, 404)
        return json({ data })
      }

      const limit = Math.min(Math.max(parseInt(q.get('limit') ?? '100', 10) || 100, 1), 100)
      const cursor = q.get('cursor')
      const updatedSince = q.get('updated_since')
      let query = supabase
        .from('beneficiaries')
        .select('id, case_id, full_name, status, risk_level, state, lga, ward, village, profile, next_follow_up_date, version, created_at, updated_at')
        .eq('project_id', key.project_id)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit + 1)
      if (updatedSince && !Number.isNaN(Date.parse(updatedSince))) query = query.gte('updated_at', updatedSince)
      if (cursor) {
        const parsed = parseCursor(cursor)
        if (!parsed) return json({ error: 'Invalid cursor' }, 400)
        query = query.or(`updated_at.gt.${parsed.timestamp},and(updated_at.eq.${parsed.timestamp},id.gt.${parsed.id})`)
      }
      const { data, error } = await query
      if (error) return json({ error: error.message }, 500)
      const rows = data ?? []
      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const last = page[page.length - 1]
      return json({
        data: page,
        next_cursor: hasMore && last ? `${last.updated_at}|${last.id}` : null,
      })
    }

    // /v1/services
    if (parts.length === 2 && parts[1] === 'services') {
      if (!needScope('records:read')) return json({ error: 'Key lacks records:read scope' }, 403)
      const limit = Math.min(Math.max(parseInt(q.get('limit') ?? '100', 10) || 100, 1), 100)
      const cursor = q.get('cursor')
      const from = q.get('from')
      const to = q.get('to')
      let query = supabase
        .from('beneficiary_services')
        .select('id, beneficiary_id, component_key, service_name, service_date, result, status, data, created_at')
        .eq('project_id', key.project_id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit + 1)
      const comps = (q.get('component_key') ?? '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 50)
      if (comps.length) query = query.in('component_key', comps)
      if (from && !Number.isNaN(Date.parse(from))) query = query.gte('service_date', from)
      if (to && !Number.isNaN(Date.parse(to))) query = query.lte('service_date', to)
      if (cursor) {
        const parsed = parseCursor(cursor)
        if (!parsed) return json({ error: 'Invalid cursor' }, 400)
        query = query.or(`created_at.gt.${parsed.timestamp},and(created_at.eq.${parsed.timestamp},id.gt.${parsed.id})`)
      }
      const { data, error } = await query
      if (error) return json({ error: error.message }, 500)
      const rows = data ?? []
      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const last = page[page.length - 1]
      return json({ data: page, next_cursor: hasMore && last ? `${last.created_at}|${last.id}` : null })
    }

    // /v1/aggregates?period=YYYY-MM
    if (parts.length === 2 && parts[1] === 'aggregates') {
      if (!needScope('aggregates:read')) return json({ error: 'Key lacks aggregates:read scope' }, 403)
      const period = q.get('period') ?? new Date().toISOString().slice(0, 7)
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return json({ error: 'period must be YYYY-MM' }, 400)
      const start = `${period}-01`
      const endDate = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5), 1))
      const end = endDate.toISOString().slice(0, 10)

      const [registrations, services, visits, referrals] = await Promise.all([
        supabase.from('beneficiaries').select('id', { count: 'exact', head: true })
          .eq('project_id', key.project_id).gte('created_at', start).lt('created_at', end),
        supabase.from('beneficiary_services').select('component_key, service_name')
          .eq('project_id', key.project_id).gte('service_date', start).lt('service_date', end).limit(10000),
        supabase.from('beneficiary_home_visits').select('id', { count: 'exact', head: true })
          .eq('project_id', key.project_id).gte('visited_at', start).lt('visited_at', end),
        supabase.from('beneficiary_referrals').select('id', { count: 'exact', head: true })
          .eq('project_id', key.project_id).gte('created_at', start).lt('created_at', end),
      ])

      const byComponent: Record<string, number> = {}
      const byService: Record<string, number> = {}
      for (const s of services.data ?? []) {
        const c = s.component_key || 'general'
        byComponent[c] = (byComponent[c] ?? 0) + 1
        byService[s.service_name] = (byService[s.service_name] ?? 0) + 1
      }

      return json({
        data: {
          project_id: key.project_id,
          period,
          registrations: registrations.count ?? 0,
          home_visits_completed: visits.count ?? 0,
          referrals: referrals.count ?? 0,
          services_total: services.data?.length ?? 0,
          services_by_component: byComponent,
          services_by_name: byService,
        },
      })
    }

    // /v1/reports
    if (parts.length === 2 && parts[1] === 'reports') {
      if (!needScope('reports:read')) return json({ error: 'Key lacks reports:read scope' }, 403)
      const { data, error } = await supabase
        .from('programme_reports')
        .select('id, period_label, report_year, status, notes, created_at, reviewed_at, resolution_note, entries:programme_report_entries(indicator_code, value, disaggregation, risk, over_target_comment)')
        .eq('project_id', key.project_id)
        .in('status', ['submitted', 'resolved'])
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return json({ error: error.message }, 500)
      return json({ data })
    }

    return json({
      error: 'Unknown route',
      routes: [
        'GET /external-api/v1/projects',
        'GET /external-api/v1/beneficiaries?updated_since=&cursor=&limit=',
        'GET /external-api/v1/beneficiaries/{case_id}',
        'GET /external-api/v1/services?from=&to=&cursor=',
        'GET /external-api/v1/aggregates?period=YYYY-MM',
        'GET /external-api/v1/reports',
        'GET /external-api/v1/components',
        'POST /external-api/v1/beneficiaries',
        'POST /external-api/v1/services',
        'GET /external-api/v1/connection/records  (your field names)',
        'POST /external-api/v1/connection/records (your field names)',
      ],
    }, 404)
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})

const STATUSES = ['active', 'on_hold', 'exited', 'completed', 'deceased']
const SERVICE_STATUSES = ['on_track', 'due', 'overdue', 'at_risk', 'needs_follow_up', 'completed', 'suspended', 'exited', 'not_applicable']
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// deno-lint-ignore no-explicit-any
async function handleWrite(supabase: any, key: ApiKey, parts: string[], req: Request) {
  if (!(key.scopes.includes('records:write') || key.scopes.includes('*'))) return json({ error: 'Key lacks records:write scope' }, 403)
  if (parts.length !== 2 || !['beneficiaries', 'services'].includes(parts[1])) return json({ error: 'Unknown route' }, 404)
  let body: Record<string, unknown>
  try { const b = await req.json(); if (!isObj(b)) throw 0; body = b } catch { return json({ error: 'Body must be a JSON object' }, 400) }
  const r = await writeRecord(supabase, key, parts[1] as 'beneficiaries' | 'services', body)
  return json(r.body, r.status)
}

type WriteResult = { status: number; body: Record<string, unknown> }
const res = (body: Record<string, unknown>, status = 200): WriteResult => ({ status, body })

// deno-lint-ignore no-explicit-any
async function writeRecord(supabase: any, key: ApiKey, kind: 'beneficiaries' | 'services', body: Record<string, unknown>): Promise<WriteResult> {
  const { data: keyRow } = await supabase.from('api_keys').select('created_by').eq('id', key.key_id).maybeSingle()
  if (!keyRow?.created_by) return res({ error: 'Key has no responsible issuer; reissue the key' }, 403)
  const { data: modules } = await supabase.from('programme_modules').select('id').eq('project_id', key.project_id)
  const wanted = str(body.module_id, 40)
  const mod = wanted ? (modules ?? []).find((m: { id: string }) => m.id === wanted) : (modules ?? []).length === 1 ? modules[0] : null
  if (!mod) return res({ error: (modules ?? []).length > 1 ? 'module_id required (see GET /v1/components)' : 'Unknown module_id' }, 400)
  const caseId = str(body.case_id, 64)
  if (!caseId) return res({ error: 'case_id is required' }, 400)

  if (kind === 'beneficiaries') {
    const fullName = str(body.full_name, 200)
    const status = body.status == null ? undefined : String(body.status)
    if (status && !STATUSES.includes(status)) return res({ error: 'Invalid status' }, 400)
    if (body.profile != null && !isObj(body.profile)) return res({ error: 'profile must be an object' }, 400)
    const { data: existing } = await supabase.from('beneficiaries').select('id, version, profile').eq('module_id', mod.id).eq('case_id', caseId).maybeSingle()
    const fields: Record<string, unknown> = {}
    for (const f of ['state', 'lga', 'ward', 'village']) { const v = str(body[f], 120); if (v) fields[f] = v }
    if (body.risk_level != null) { if (!['low', 'medium', 'high'].includes(String(body.risk_level))) return res({ error: 'Invalid risk_level' }, 400); fields.risk_level = body.risk_level }
    if (body.next_follow_up_date != null) { if (Number.isNaN(Date.parse(String(body.next_follow_up_date)))) return res({ error: 'Invalid next_follow_up_date' }, 400); fields.next_follow_up_date = String(body.next_follow_up_date).slice(0, 10) }
    if (status) fields.status = status
    if (fullName) fields.full_name = fullName
    if (existing) {
      if (body.profile) fields.profile = { ...(existing.profile ?? {}), ...(body.profile as object) }
      fields.version = (existing.version ?? 1) + 1; fields.updated_at = new Date().toISOString()
      const { data, error } = await supabase.from('beneficiaries').update(fields).eq('id', existing.id).select('id, case_id, version, updated_at').single()
      if (error) return res({ error: 'Could not update beneficiary' }, 400)
      return res({ data, operation: 'updated' })
    }
    if (!fullName) return res({ error: 'full_name is required for new beneficiaries' }, 400)
    const { data, error } = await supabase.from('beneficiaries').insert({ ...fields, profile: body.profile ?? {}, case_id: caseId, module_id: mod.id, project_id: key.project_id, created_by: keyRow.created_by }).select('id, case_id, version, updated_at').single()
    if (error) return res({ error: 'Could not create beneficiary' }, 400)
    return res({ data, operation: 'created' }, 201)
  }

  const componentKey = str(body.component_key, 80); const serviceName = str(body.service_name, 200)
  if (!componentKey || !serviceName) return res({ error: 'component_key and service_name are required' }, 400)
  const status = body.status == null ? 'on_track' : String(body.status)
  if (!SERVICE_STATUSES.includes(status)) return res({ error: 'Invalid status' }, 400)
  const serviceDate = body.service_date == null ? new Date().toISOString().slice(0, 10) : String(body.service_date).slice(0, 10)
  if (Number.isNaN(Date.parse(serviceDate))) return res({ error: 'Invalid service_date' }, 400)
  if (body.data != null && !isObj(body.data)) return res({ error: 'data must be an object' }, 400)
  const { data: ben } = await supabase.from('beneficiaries').select('id').eq('module_id', mod.id).eq('case_id', caseId).maybeSingle()
  if (!ben) return res({ error: 'Beneficiary not found for case_id' }, 404)
  const ext = str(body.external_id, 120)
  const row = { beneficiary_id: ben.id, module_id: mod.id, project_id: key.project_id, component_key: componentKey, service_name: serviceName, service_date: serviceDate, result: str(body.result, 2000), status, data: { ...((body.data as object) ?? {}), ...(ext ? { external_id: ext } : {}) }, recorded_by: keyRow.created_by }
  if (ext) {
    const { data: dup } = await supabase.from('beneficiary_services').select('id, created_at').eq('beneficiary_id', ben.id).eq('data->>external_id', ext).maybeSingle()
    if (dup) return res({ data: dup, operation: 'duplicate' })
  }
  const { data, error } = await supabase.from('beneficiary_services').insert(row).select('id, beneficiary_id, component_key, created_at').single()
  if (error) return res({ error: 'Could not record service' }, 400)
  return res({ data, operation: 'created' }, 201)
}

// Connection-mapped exchange: records travel in the other system's own field names,
// translated with the saved field matching of the connection that issued this key.
// deno-lint-ignore no-explicit-any
async function handleConnection(supabase: any, key: ApiKey, req: Request, q: URLSearchParams) {
  const { data: conn } = await supabase.from('integration_connections')
    .select('id, project_id, target_type, target_id, mappings, is_active, direction')
    .eq('api_key_id', key.key_id).eq('project_id', key.project_id).maybeSingle()
  if (!conn) return json({ error: 'This key is not linked to a connection. Create one under Integrations → Connect any app.' }, 404)
  if (!conn.is_active) return json({ error: 'This connection is switched off in Amehnities' }, 403)
  const maps = cleanMaps(conn.mappings)
  if (!maps.length) return json({ error: 'The connection has no matched fields yet' }, 400)
  if (conn.target_type === 'form') return handleFormConnection(supabase, key, req, q, conn, maps)

  if (req.method === 'GET') {
    if (!(key.scopes.includes('records:read') || key.scopes.includes('*'))) return json({ error: 'Key lacks records:read scope' }, 403)
    const limit = Math.min(Math.max(parseInt(q.get('limit') ?? '100', 10) || 100, 1), 100)
    let query = supabase.from('beneficiaries')
      .select('id, case_id, full_name, status, risk_level, state, lga, ward, village, profile, next_follow_up_date, updated_at')
      .eq('project_id', key.project_id).eq('module_id', conn.target_id)
      .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit + 1)
    const since = q.get('updated_since'); if (since && !Number.isNaN(Date.parse(since))) query = query.gte('updated_at', since)
    const cursor = q.get('cursor')
    if (cursor) { const p = parseCursor(cursor); if (!p) return json({ error: 'Invalid cursor' }, 400); query = query.or(`updated_at.gt.${p.timestamp},and(updated_at.eq.${p.timestamp},id.gt.${p.id})`) }
    const { data, error } = await query
    if (error) return json({ error: 'Could not load records' }, 500)
    const rows = data ?? []; const more = rows.length > limit; const page = more ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    return json({ data: page.map((b: Record<string, unknown>) => outbound(b, null, maps)), next_cursor: more && last ? `${last.updated_at}|${last.id}` : null })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!(key.scopes.includes('records:write') || key.scopes.includes('*'))) return json({ error: 'Key lacks records:write scope' }, 403)
  let raw: unknown
  try { raw = await req.json() } catch { return json({ error: 'Body must be JSON' }, 400) }
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.records) ? raw.records : [raw]
  if (list.length === 0 || list.length > 100) return json({ error: 'Send between 1 and 100 records' }, 400)
  const results: Record<string, unknown>[] = []
  for (const [index, rec] of list.entries()) {
    if (!isObj(rec)) { results.push({ index, ok: false, error: 'Record must be an object' }); continue }
    const { beneficiary, service } = inbound(rec, maps)
    if (!beneficiary.case_id) { results.push({ index, ok: false, error: 'No value for the field matched to Case ID' }); continue }
    const out: Record<string, unknown> = { index, case_id: beneficiary.case_id }
    const b = await writeRecord(supabase, key, 'beneficiaries', { ...beneficiary, module_id: conn.target_id })
    out.beneficiary = b.body.operation ?? b.body.error
    let ok = b.status < 300
    if (ok && service) {
      const s = await writeRecord(supabase, key, 'services', { ...service, case_id: beneficiary.case_id, module_id: conn.target_id })
      out.service = s.body.operation ?? s.body.error; ok = s.status < 300
    }
    results.push({ ...out, ok })
  }
  const failed = results.filter((r) => !r.ok).length
  return json({ received: list.length, saved: list.length - failed, failed, results }, failed === list.length ? 400 : 200)
}

// Form-linked connections: entries arrive as form submissions (attributed to the
// connection owner) and leave in the other system's field names.
// deno-lint-ignore no-explicit-any
async function handleFormConnection(supabase: any, key: ApiKey, req: Request, q: URLSearchParams, conn: any, maps: ReturnType<typeof cleanMaps>) {
  const { data: form } = await supabase.from('forms').select('id, project_id').eq('id', conn.target_id).maybeSingle()
  if (!form || form.project_id !== key.project_id) return json({ error: 'The linked form is no longer in this project' }, 404)
  if (req.method === 'GET') {
    if (!(key.scopes.includes('records:read') || key.scopes.includes('*'))) return json({ error: 'Key lacks records:read scope' }, 403)
    const limit = Math.min(Math.max(parseInt(q.get('limit') ?? '100', 10) || 100, 1), 100)
    let query = supabase.from('form_submissions').select('id, data, submitted_at, updated_at')
      .eq('form_id', form.id).neq('status', 'draft')
      .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit + 1)
    const since = q.get('updated_since'); if (since && !Number.isNaN(Date.parse(since))) query = query.gte('updated_at', since)
    const cursor = q.get('cursor')
    if (cursor) { const p = parseCursor(cursor); if (!p) return json({ error: 'Invalid cursor' }, 400); query = query.or(`updated_at.gt.${p.timestamp},and(updated_at.eq.${p.timestamp},id.gt.${p.id})`) }
    const { data, error } = await query
    if (error) return json({ error: 'Could not load entries' }, 500)
    const rows = data ?? []; const more = rows.length > limit; const page = more ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    return json({ data: page.map((r: Record<string, unknown>) => outboundForm(r, maps)), next_cursor: more && last ? `${last.updated_at}|${last.id}` : null })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!(key.scopes.includes('records:write') || key.scopes.includes('*'))) return json({ error: 'Key lacks records:write scope' }, 403)
  let raw: unknown
  try { raw = await req.json() } catch { return json({ error: 'Body must be JSON' }, 400) }
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.records) ? raw.records : [raw]
  if (list.length === 0 || list.length > 100) return json({ error: 'Send between 1 and 100 records' }, 400)
  const { data: owner } = await supabase.from('api_keys').select('created_by').eq('id', key.key_id).maybeSingle()
  if (!owner?.created_by) return json({ error: 'This key has no owner; recreate the connection' }, 403)
  const results: Record<string, unknown>[] = []
  for (const [index, rec] of list.entries()) {
    if (!isObj(rec)) { results.push({ index, ok: false, error: 'Record must be an object' }); continue }
    const { data, externalId } = inboundForm(rec, maps)
    if (!Object.keys(data).filter((k) => k !== '_external_id').length) { results.push({ index, ok: false, error: 'No answers matched this form' }); continue }
    if (JSON.stringify(data).length > 200_000) { results.push({ index, ok: false, error: 'Entry too large' }); continue }
    const now = new Date().toISOString()
    if (externalId) {
      const { data: dup } = await supabase.from('form_submissions').select('id').eq('form_id', form.id).eq('data->>_external_id', externalId).maybeSingle()
      if (dup) {
        const { error } = await supabase.from('form_submissions').update({ data, updated_at: now }).eq('id', dup.id)
        results.push({ index, ok: !error, external_id: externalId, entry: error ? 'Could not update entry' : 'updated', id: dup.id }); continue
      }
    }
    const { data: row, error } = await supabase.from('form_submissions').insert({
      form_id: form.id, user_id: owner.created_by, data, status: 'sent', submitted_at: now, synced_at: now,
      collector_label: 'External connection',
    }).select('id').single()
    results.push({ index, ok: !error, external_id: externalId, entry: error ? 'Could not save entry' : 'created', id: row?.id })
  }
  const failed = results.filter((r) => !r.ok).length
  return json({ received: list.length, saved: list.length - failed, failed, results }, failed === list.length ? 400 : 200)
}
