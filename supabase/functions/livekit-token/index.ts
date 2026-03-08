import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = claimsData.claims.sub as string;

    // Get user profile for display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .single();

    const participantName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'User';

    // Parse request body
    const { roomName, callType } = await req.json();
    if (!roomName) {
      return new Response(JSON.stringify({ error: 'roomName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get LiveKit credentials
    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    let livekitUrl = Deno.env.get('LIVEKIT_URL');

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error('Missing LiveKit config:', { hasKey: !!apiKey, hasSecret: !!apiSecret, hasUrl: !!livekitUrl });
      return new Response(JSON.stringify({ error: 'LiveKit not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize URL - ensure it starts with wss://
    livekitUrl = livekitUrl.trim();
    if (!livekitUrl.startsWith('wss://') && !livekitUrl.startsWith('ws://')) {
      livekitUrl = `wss://${livekitUrl}`;
    }

    console.log('Generating token for room:', roomName, 'identity:', userId, 'url:', livekitUrl, 'apiKey:', apiKey.substring(0, 6) + '...');

    // Generate access token with no expiry limit (very long TTL for unlimited calls)
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: participantName,
      ttl: '24h', // 24 hours - effectively unlimited for a single call session
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await at.toJwt();

    console.log('Token generated successfully, length:', jwt.length);

    return new Response(JSON.stringify({
      token: jwt,
      url: livekitUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate token', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
