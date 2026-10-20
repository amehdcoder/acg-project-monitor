// external-api: REST API for external/donor systems to read Amehnities data.
// Auth: `Authorization: Bearer amk_...` API key (hashed server-side, project-scoped).
//
// Routes (all GET):
//   /external-api/v1/projects
//   /external-api/v1/beneficiaries?updated_since=&cursor=&limit=
//   /external-api/v1/beneficiaries/{case_id}
//   /external-api/v1/services?from=&to=&cursor=
//   /external-api/v1/aggregates?period=YYYY-MM
//   /external-api/v1/reports
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
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

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
      ],
    }, 404)
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
