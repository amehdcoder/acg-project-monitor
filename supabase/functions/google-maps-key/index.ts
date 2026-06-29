import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Returns the Google Maps browser API key so the frontend can load the
// Maps JavaScript API (Street View). Google browser keys are referrer-safe.
Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const key = Deno.env.get('GOOGLE_API_KEY') ?? ''
  return new Response(JSON.stringify({ key }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
    status: 200,
  })
})
