import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: credentials.token_uri,
    iat: now,
    exp: expiry
  };

  // Create JWT
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key and sign
  const privateKey = credentials.private_key.replace(/\\n/g, '\n');
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey.substring(
    privateKey.indexOf(pemHeader) + pemHeader.length,
    privateKey.indexOf(pemFooter)
  ).replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsignedToken}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    console.error("Token response:", tokenData);
    throw new Error("Failed to get access token from Google");
  }

  return tokenData.access_token;
}

async function appendToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: any[][]
): Promise<any> {
  const range = `${sheetName}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Sheets API error:", errorText);
    throw new Error(`Failed to append to sheet: ${response.status}`);
  }

  return response.json();
}

async function getSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<any[][]> {
  const range = `${sheetName}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Sheets API error:", errorText);
    throw new Error(`Failed to read sheet: ${response.status}`);
  }

  const data = await response.json();
  return data.values || [];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const credentialsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!credentialsJson) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret is not configured");
    }

    const credentials: ServiceAccountCredentials = JSON.parse(credentialsJson);
    const accessToken = await getAccessToken(credentials);

    const { action, spreadsheetId, sheetName, formId, submissions } = await req.json();

    console.log(`Processing action: ${action} for sheet: ${spreadsheetId}`);

    if (action === "sync") {
      // Sync form submissions to Google Sheets
      if (!submissions || !Array.isArray(submissions) || submissions.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No submissions to sync" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build rows from submissions
      const headers = new Set<string>(["submission_id", "submitted_at", "user_id", "status", "location", "within_geofence"]);
      
      // Collect all field names from submissions
      submissions.forEach((sub: any) => {
        if (sub.data && typeof sub.data === 'object') {
          Object.keys(sub.data).forEach(key => headers.add(key));
        }
      });

      const headerArray = Array.from(headers);
      const rows: any[][] = [headerArray];

      submissions.forEach((sub: any) => {
        const row = headerArray.map(header => {
          switch (header) {
            case "submission_id":
              return sub.id || "";
            case "submitted_at":
              return sub.submitted_at || sub.created_at || "";
            case "user_id":
              return sub.user_id || "";
            case "status":
              return sub.status || "";
            case "location":
              return sub.location ? JSON.stringify(sub.location) : "";
            case "within_geofence":
              return sub.within_geofence ? "Yes" : "No";
            default:
              return sub.data?.[header] !== undefined ? String(sub.data[header]) : "";
          }
        });
        rows.push(row);
      });

      const result = await appendToSheet(accessToken, spreadsheetId, sheetName || "Sheet1", rows);

      console.log(`Synced ${submissions.length} submissions to Google Sheets`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Synced ${submissions.length} submissions`,
          updatedRange: result.updates?.updatedRange
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === "read") {
      // Read data from Google Sheets
      const data = await getSheetData(accessToken, spreadsheetId, sheetName || "Sheet1");
      
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'sync' or 'read'" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in sync-google-sheets function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
