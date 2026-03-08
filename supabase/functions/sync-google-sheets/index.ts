import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: credentials.token_uri,
    iat: now,
    exp: expiry
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${headerB64}.${payloadB64}`;

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

// Clear a range then write fresh data (avoids duplicate headers on re-sync)
async function clearAndWriteSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  range: string | undefined,
  values: any[][]
): Promise<any> {
  const targetRange = range ? `${sheetName}!${range}` : `${sheetName}!A:ZZ`;

  // Step 1: Clear existing data
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetRange)}:clear`;
  const clearResp = await fetch(clearUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!clearResp.ok) {
    const errText = await clearResp.text();
    console.error("Clear error:", errText);
    // Don't throw — sheet might not exist yet, continue to write
  } else {
    await clearResp.text(); // consume
  }

  // Step 2: Write data starting at A1 (or the provided range start)
  const writeRange = range ? `${sheetName}!${range.split(':')[0]}` : `${sheetName}!A1`;
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`;

  const response = await fetch(writeUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Sheets API error:", errorText);
    throw new Error(`Failed to write to sheet: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function getSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  range?: string
): Promise<any[][]> {
  const targetRange = range ? `${sheetName}!${range}` : `${sheetName}!A:ZZ`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`;

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

// Flatten nested objects for spreadsheet format
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      const value = obj[key];

      if (value === null || value === undefined) {
        result[newKey] = '';
      } else if (Array.isArray(value)) {
        result[newKey] = value.map(v =>
          typeof v === 'object' ? JSON.stringify(v) : String(v)
        ).join(', ');
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        const nested = flattenObject(value, newKey);
        Object.assign(result, nested);
      } else if (typeof value === 'boolean') {
        result[newKey] = value ? 'Yes' : 'No';
      } else {
        result[newKey] = String(value);
      }
    }
  }

  return result;
}

function formatDateForExcel(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch {
    return dateString;
  }
}

function formatLocation(location: any): { latitude: string; longitude: string } {
  if (!location) return { latitude: '', longitude: '' };
  if (typeof location === 'string') {
    try { location = JSON.parse(location); } catch { return { latitude: '', longitude: '' }; }
  }
  return {
    latitude: location.lat?.toString() || location.latitude?.toString() || '',
    longitude: location.lng?.toString() || location.longitude?.toString() || ''
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT in-code since gateway verification is disabled for ES256 compatibility
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body first (before credentials, to fail fast on bad input)
    const body = await req.json().catch((e: Error) => {
      throw new Error(`Invalid request body: ${e.message}`);
    });
    const { action, spreadsheetId, sheetName, range, formId, projectId } = body;
    let { submissions } = body;

    const credentialsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!credentialsJson) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret is not configured");
    }

    let credentials: ServiceAccountCredentials;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (e) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e);
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON contains invalid JSON. Please update the secret with a valid service account JSON.");
    }

    const accessToken = await getAccessToken(credentials);

    console.log(`Processing action: ${action}, sheet: ${spreadsheetId}, form: ${formId}, project: ${projectId}`);

    if (action === "sync") {
      // If no submissions provided, fetch them server-side using formId or projectId
      if ((!submissions || submissions.length === 0) && (formId || projectId)) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        if (formId) {
          // Fetch all submitted submissions for a specific form
          const { data, error } = await supabase
            .from("form_submissions")
            .select("*")
            .eq("form_id", formId)
            .in("status", ["sent", "submitted", "draft"])
            .order("submitted_at", { ascending: true });

          if (error) throw new Error(`Failed to fetch submissions: ${error.message}`);
          submissions = data || [];
          console.log(`Fetched ${submissions.length} submissions for form ${formId}`);
        } else if (projectId) {
          // Fetch all forms for the project, then all their submissions
          const { data: forms, error: formsError } = await supabase
            .from("forms")
            .select("id, name")
            .eq("project_id", projectId);

          if (formsError) throw new Error(`Failed to fetch forms: ${formsError.message}`);

          const formIds = (forms || []).map((f: any) => f.id);
          if (formIds.length === 0) {
            return new Response(
              JSON.stringify({ success: true, message: "No forms found in this project" }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Build form name map for including in rows
          const formNameMap: Record<string, string> = {};
          (forms || []).forEach((f: any) => { formNameMap[f.id] = f.name; });

          const { data, error } = await supabase
            .from("form_submissions")
            .select("*")
            .in("form_id", formIds)
            .in("status", ["sent", "submitted", "draft"])
            .order("submitted_at", { ascending: true });

          if (error) throw new Error(`Failed to fetch submissions: ${error.message}`);

          // Annotate each submission with its form name
          submissions = (data || []).map((s: any) => ({
            ...s,
            _form_name: formNameMap[s.form_id] || s.form_id
          }));
          console.log(`Fetched ${submissions.length} submissions across ${formIds.length} forms in project ${projectId}`);
        }
      }

      if (!submissions || submissions.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No submissions to sync" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Determine if we have multi-form data (project-level sync)
      const hasFormName = submissions.some((s: any) => s._form_name);

      // Collect all headers
      const allFlattenedData: Array<{ original: any; cleaned: Record<string, any> }> = [];
      const headerSet = new Set<string>([
        "Submission ID",
        ...(hasFormName ? ["Form Name"] : []),
        "Submitted At",
        "Synced At",
        "Status",
        "Latitude",
        "Longitude",
        "Within Geofence"
      ]);

      submissions.forEach((sub: any) => {
        const flatData = sub.data ? flattenObject(sub.data) : {};
        const cleanedData: Record<string, any> = {};
        Object.keys(flatData).forEach(key => {
          const cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          headerSet.add(cleanKey);
          cleanedData[cleanKey] = flatData[key];
        });
        allFlattenedData.push({ original: sub, cleaned: cleanedData });
      });

      const metaHeaders = [
        "Submission ID",
        ...(hasFormName ? ["Form Name"] : []),
        "Submitted At",
        "Synced At",
        "Status",
        "Latitude",
        "Longitude",
        "Within Geofence"
      ];

      const formHeaders = Array.from(headerSet).filter(h => !metaHeaders.includes(h)).sort();
      const headerArray = [...metaHeaders, ...formHeaders];

      const rows: any[][] = [headerArray];

      allFlattenedData.forEach(({ original: sub, cleaned }) => {
        const location = formatLocation(sub.location);
        const row = headerArray.map(header => {
          switch (header) {
            case "Submission ID": return sub.id || "";
            case "Form Name": return sub._form_name || "";
            case "Submitted At": return formatDateForExcel(sub.submitted_at || sub.created_at);
            case "Synced At": return formatDateForExcel(new Date().toISOString());
            case "Status": return sub.status === 'sent' ? 'Synced' : (sub.status || 'Pending');
            case "Latitude": return location.latitude;
            case "Longitude": return location.longitude;
            case "Within Geofence":
              return sub.within_geofence === true ? 'Yes' :
                     sub.within_geofence === false ? 'No' : 'N/A';
            default: return cleaned[header] !== undefined ? String(cleaned[header]) : "";
          }
        });
        rows.push(row);
      });

      // Use clear-and-write instead of append to avoid duplicates
      const result = await clearAndWriteSheet(accessToken, spreadsheetId, sheetName || "Sheet1", range, rows);

      console.log(`Synced ${submissions.length} submissions to Google Sheets (clear & write)`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Synced ${submissions.length} submissions to Google Sheets`,
          updatedRange: result.updatedRange,
          columns: headerArray.length,
          rows: rows.length - 1
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === "read") {
      const data = await getSheetData(accessToken, spreadsheetId, sheetName || "Sheet1", range);
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
