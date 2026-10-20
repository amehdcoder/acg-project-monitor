// webhook-dispatch: delivers queued webhook events to subscribed endpoints.
// Woken on enqueue by the emit_webhook_event trigger and hourly as a retry
// backstop. Also serves admin "test event" sends.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { guardRequest } from '../_shared/authGuard.ts'
import { retryEvent } from './retry.ts'
import { publicDestination } from './destination.ts'

const MAX_ATTEMPTS = 5

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Endpoint = {
  id: string
  project_id: string
  url: string
  secret: string
  events: string[]
  is_active: boolean
}

async function deliver(
  supabase: ReturnType<typeof createClient>,
  endpoint: Endpoint,
  event: { id: string | null; event: string; payload: unknown; project_id: string },
  retry?: { id: string; attempts: number },
) {
  const deliveryId = retry?.id ?? crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const body = JSON.stringify({
    id: deliveryId,
    event: event.event,
    project_id: event.project_id,
    created_at: timestamp,
    data: event.payload,
  })
  const signature = await hmacSha256(endpoint.secret, body)

  const attempts = retry ? retry.attempts + 1 : 1
  const delivery = retry ?? (await supabase
    .from('webhook_deliveries')
    .insert({ id: deliveryId, endpoint_id: endpoint.id, event_id: event.id, event: event.event, status: 'pending', attempts })
    .select('id')
    .single()).data
  if (!delivery?.id) return false

  const started = Date.now()
  let httpStatus: number | null = null
  let snippet = ''
  let ok = false
  try {
    const destination = await publicDestination(endpoint.url)
    const res = await fetch(destination, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Amehnities-Webhooks/1.0',
        'X-Amehnities-Event': event.event,
        'X-Amehnities-Delivery': deliveryId,
        'X-Amehnities-Timestamp': timestamp,
        'X-Amehnities-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(15000),
    })
    httpStatus = res.status
    snippet = (await res.text()).slice(0, 500)
    ok = res.status >= 200 && res.status < 300
  } catch (e) {
    snippet = String(e).slice(0, 500)
  }
  const duration = Date.now() - started

  if (delivery?.id) {
    await supabase
      .from('webhook_deliveries')
      .update({
        status: ok ? 'success' : 'failed',
        attempts,
        http_status: httpStatus,
        response_snippet: snippet,
        duration_ms: duration,
        delivered_at: ok ? new Date().toISOString() : null,
        next_retry_at: ok || attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + Math.min(2 ** (attempts - 1), 60) * 60_000).toISOString(),
      })
      .eq('id', delivery.id)
  }
  return ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { action?: string; endpoint_id?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  // Admin-triggered test event
  if (body.action === 'test' && body.endpoint_id) {
    const guard = await guardRequest(req, corsHeaders, { requireAdmin: true })
    if (guard.response) return guard.response
    const { data: ep } = await supabase.from('webhook_endpoints').select('*').eq('id', body.endpoint_id).single()
    if (!ep) return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const ok = await deliver(supabase, ep as Endpoint, {
      id: null,
      event: 'test.ping',
      project_id: ep.project_id,
      payload: { message: 'Amehnities test webhook', sent_at: new Date().toISOString() },
    })
    return new Response(JSON.stringify({ ok }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Cron / trigger path
  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false })
  if (guard.response || !guard.viaService) {
    return guard.response ?? new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 1. Retry due failed deliveries
  const { data: dueRetries } = await supabase
    .from('webhook_deliveries')
    .select('id, endpoint_id, event_id, event, attempts, webhook_endpoints(*), webhook_events(payload, project_id)')
    .eq('status', 'failed')
    .lt('attempts', MAX_ATTEMPTS)
    .lte('next_retry_at', new Date().toISOString())
    .limit(20)

  for (const d of dueRetries ?? []) {
    const ep = (d as Record<string, unknown>).webhook_endpoints as Endpoint | null
    if (!ep || !ep.is_active) continue
    const original = (d as Record<string, unknown>).webhook_events as { payload: unknown } | null
    const event = retryEvent(d, original, ep.project_id)
    if (!event) continue
    await deliver(supabase, ep, event, { id: d.id, attempts: d.attempts })
  }

  // 2. Deliver new unprocessed events
  const { data: events } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(25)

  let delivered = 0
  for (const ev of events ?? []) {
    const { data: endpoints } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('project_id', ev.project_id)
      .eq('is_active', true)
    const matching = (endpoints ?? []).filter(
      (e) => e.events.includes(ev.event) || e.events.includes('*'),
    )
    for (const ep of matching) {
      await deliver(supabase, ep as Endpoint, ev)
      delivered++
    }
    await supabase.from('webhook_events').update({ processed: true }).eq('id', ev.id)
  }

  return new Response(
    JSON.stringify({ processed: events?.length ?? 0, delivered, retries: dueRetries?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
