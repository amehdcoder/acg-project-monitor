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

// Helper function to flatten nested objects for Excel format
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      const value = obj[key];
      
      if (value === null || value === undefined) {
        result[newKey] = '';
      } else if (Array.isArray(value)) {
        // Convert arrays to comma-separated strings for Excel
        result[newKey] = value.map(v => 
          typeof v === 'object' ? JSON.stringify(v) : String(v)
        ).join(', ');
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Recursively flatten nested objects
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

// Format date for Excel
function formatDateForExcel(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return dateString;
  }
}

// Format location for Excel (lat, lng as separate columns or readable string)
function formatLocation(location: any): { latitude: string; longitude: string } {
  if (!location) return { latitude: '', longitude: '' };
  if (typeof location === 'string') {
    try {
      location = JSON.parse(location);
    } catch {
      return { latitude: '', longitude: '' };
    }
  }
  return {
    latitude: location.lat?.toString() || location.latitude?.toString() || '',
    longitude: location.lng?.toString() || location.longitude?.toString() || ''
  };
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
      // Sync form submissions to Google Sheets in Excel-friendly format
      if (!submissions || !Array.isArray(submissions) || submissions.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No submissions to sync" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Collect all headers by flattening all form data first
      const allFlattenedData: Array<Record<string, any>> = [];
      const headerSet = new Set<string>([
        "Submission ID",
        "Submitted At", 
        "Synced At",
        "Status",
        "Latitude",
        "Longitude", 
        "Within Geofence"
      ]);
      
      submissions.forEach((sub: any) => {
        // Flatten the form data
        const flatData = sub.data ? flattenObject(sub.data) : {};
        
        // Clean up header names (replace underscores with spaces, capitalize)
        const cleanedData: Record<string, any> = {};
        Object.keys(flatData).forEach(key => {
          const cleanKey = key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          headerSet.add(cleanKey);
          cleanedData[cleanKey] = flatData[key];
        });
        
        allFlattenedData.push({
          original: sub,
          cleaned: cleanedData
        });
      });

      // Convert headers to ordered array (metadata first, then form fields alphabetically)
      const metaHeaders = [
        "Submission ID",
        "Submitted At",
        "Synced At", 
        "Status",
        "Latitude",
        "Longitude",
        "Within Geofence"
      ];
      
      const formHeaders = Array.from(headerSet)
        .filter(h => !metaHeaders.includes(h))
        .sort();
      
      const headerArray = [...metaHeaders, ...formHeaders];
      
      // Build rows with headers
      const rows: any[][] = [headerArray];

      allFlattenedData.forEach(({ original: sub, cleaned }) => {
        const location = formatLocation(sub.location);
        
        const row = headerArray.map(header => {
          switch (header) {
            case "Submission ID":
              return sub.id || "";
            case "Submitted At":
              return formatDateForExcel(sub.submitted_at || sub.created_at);
            case "Synced At":
              return formatDateForExcel(sub.synced_at);
            case "Status":
              return sub.status === 'sent' ? 'Synced' : (sub.status || 'Pending');
            case "Latitude":
              return location.latitude;
            case "Longitude":
              return location.longitude;
            case "Within Geofence":
              return sub.within_geofence === true ? 'Yes' : 
                     sub.within_geofence === false ? 'No' : 'N/A';
            default:
              return cleaned[header] !== undefined ? String(cleaned[header]) : "";
          }
        });
        rows.push(row);
      });

      const result = await appendToSheet(accessToken, spreadsheetId, sheetName || "Sheet1", rows);

      console.log(`Synced ${submissions.length} submissions to Google Sheets in Excel format`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Synced ${submissions.length} submissions`,
          updatedRange: result.updates?.updatedRange,
          columns: headerArray.length
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
