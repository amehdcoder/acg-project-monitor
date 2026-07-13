import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Fetches rows from an external data source (Google Sheet / REST-JSON) server-side.
// Avoids browser CORS issues and keeps optional auth headers off the client.
//
// Body: { kind: 'google_sheet' | 'rest_api', config: {...} }
//   google_sheet: { url, gid?, range? }
//   rest_api:     { url, method?, headers?, jsonPath? }
// Returns: { columns: [{id,label,type}], rows: [ {..} ], sample: [...] }

type Field = { id: string; label: string; type: string }

function inferType(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'text'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  const s = String(v).trim()
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'number'
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) return 'date'
  return 'text'
}

function buildFields(sample: Record<string, unknown>): Field[] {
  return Object.keys(sample).map((k) => ({ id: k, label: k, type: inferType(sample[k]) }))
}

// Minimal CSV parser (handles quoted fields, commas, newlines)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows.filter((r) => r.some((c) => c !== ''))
}

function extractSheetId(url: string): { id: string; gid?: string } | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) return null
  const gidM = url.match(/[#&?]gid=(\d+)/)
  return { id: m[1], gid: gidM ? gidM[1] : undefined }
}

function getByPath(obj: unknown, path?: string): unknown {
  if (!path) return obj
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

// --- SSRF protection -------------------------------------------------------
// Reject URLs that resolve/point to private, loopback, link-local or otherwise
// internal address ranges to prevent server-side request forgery against
// internal services or the cloud metadata endpoint.
function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) {
    return true
  }
  // IPv6 loopback / link-local / unique-local
  if (h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) {
    return true
  }
  // IPv4 literal checks
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
    if (a >= 224) return true // multicast / reserved
  }
  return false
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid API URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Requests to internal or private addresses are not allowed')
  }
  // Resolve DNS and re-check to defend against hostnames that map to internal IPs.
  try {
    const records = await Deno.resolveDns(parsed.hostname, 'A').catch(() => [])
    const records6 = await Deno.resolveDns(parsed.hostname, 'AAAA').catch(() => [])
    for (const ip of [...records, ...records6]) {
      if (isPrivateHostname(ip)) {
        throw new Error('Requests to internal or private addresses are not allowed')
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('internal or private')) throw e
    // DNS resolution failures fall through; fetch will surface a normal error.
  }
  return parsed
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Require an authenticated dashboard editor.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData } = await authed.auth.getUser()
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: canEdit } = await authed.rpc('can_edit_dashboards', { _user_id: userData.user.id })
    if (!canEdit) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const kind = body?.kind as string
    const config = (body?.config ?? {}) as Record<string, unknown>

    let columns: Field[] = []
    let rows: Record<string, unknown>[] = []

    if (kind === 'google_sheet') {
      const rawUrl = String(config.url ?? '')
      const parsed = extractSheetId(rawUrl)
      if (!parsed) throw new Error('Invalid Google Sheet URL')
      const gid = String(config.gid ?? parsed.gid ?? '0')
      const csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv&gid=${gid}`
      const resp = await fetch(csvUrl)
      if (!resp.ok) throw new Error(`Sheet fetch failed (${resp.status}). Ensure the sheet is shared as "Anyone with the link".`)
      const text = await resp.text()
      const grid = parseCsv(text)
      if (grid.length === 0) throw new Error('Sheet is empty')
      const header = grid[0]
      rows = grid.slice(1).map((r) => {
        const o: Record<string, unknown> = {}
        header.forEach((h, i) => { o[h || `col_${i}`] = r[i] ?? '' })
        return o
      })
      columns = header.map((h, i) => ({
        id: h || `col_${i}`, label: h || `Column ${i + 1}`,
        type: inferType(rows[0]?.[h || `col_${i}`]),
      }))
    } else if (kind === 'rest_api') {
      const url = String(config.url ?? '')
      if (!/^https?:\/\//.test(url)) throw new Error('Invalid API URL')
      const safeUrl = await assertSafeUrl(url)
      const method = (String(config.method ?? 'GET').toUpperCase())
      // Only allow safe read methods and a minimal, controlled set of headers.
      if (method !== 'GET' && method !== 'HEAD') {
        throw new Error('Only GET/HEAD requests are permitted for REST sources')
      }
      const rawHeaders = (config.headers ?? {}) as Record<string, string>
      const ALLOWED_HEADERS = new Set(['authorization', 'accept', 'x-api-key'])
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (ALLOWED_HEADERS.has(k.toLowerCase())) headers[k] = String(v)
      }
      const resp = await fetch(safeUrl.toString(), { method, headers, redirect: 'error' })
      if (!resp.ok) throw new Error(`API request failed (${resp.status})`)
      const json = await resp.json()
      let arr = getByPath(json, config.jsonPath as string | undefined)
      if (!Array.isArray(arr)) {
        // Try to find first array property
        if (json && typeof json === 'object') {
          const found = Object.values(json).find((v) => Array.isArray(v))
          arr = found ?? [json]
        } else arr = [json]
      }
      rows = (arr as unknown[]).map((r) =>
        r && typeof r === 'object' ? (r as Record<string, unknown>) : { value: r },
      )
      if (rows.length === 0) throw new Error('No rows returned from API')
      columns = buildFields(rows[0])
    } else {
      throw new Error('Unsupported source kind')
    }

    return new Response(
      JSON.stringify({ columns, rows, sample: rows.slice(0, 20), rowCount: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
