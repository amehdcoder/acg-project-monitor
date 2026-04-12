const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mediaData, mediaType, fileName, mimeType } = await req.json();

    if (!mediaData || !mediaType) {
      return new Response(
        JSON.stringify({ error: "Missing mediaData or mediaType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let prompt = "";
    if (mediaType === "image") {
      prompt = `Analyze this image for field data collection quality. Extract:
1. Any visible text, numbers, names, or labels
2. GPS coordinates if visible (from signs, metadata overlays)
3. Environmental context (indoor/outdoor, urban/rural, time of day)
4. Any data quality concerns (blurriness, obstruction, staging)
5. Key objects/features relevant to health/survey data collection

Return a JSON object with:
- "extractedData": object of key-value pairs of extracted information
- "qualityFlags": array of {label: string, severity: "ok"|"warning"|"error"}
- "summary": brief analysis summary
- "confidence": number 0-1`;
    } else if (mediaType === "audio") {
      prompt = `Analyze this audio recording from a field data collection interview. Extract:
1. Transcription of speech content
2. Number of speakers detected
3. Language(s) spoken
4. Audio quality assessment
5. Any signs of coaching, reading from script, or irregular patterns

Return JSON with:
- "extractedData": {transcript, speakerCount, languages, duration_estimate}
- "qualityFlags": array of {label: string, severity: "ok"|"warning"|"error"}
- "summary": brief analysis summary
- "confidence": number 0-1`;
    } else {
      prompt = `Analyze this video from field data collection. Extract:
1. Scene description and location context
2. Any visible text, signage, or data
3. People count and activity description
4. Video quality assessment
5. Data quality concerns

Return JSON with:
- "extractedData": object with relevant findings
- "qualityFlags": array of {label: string, severity: "ok"|"warning"|"error"}
- "summary": brief analysis summary
- "confidence": number 0-1`;
    }

    const base64Content = mediaData.includes(",") ? mediaData.split(",")[1] : mediaData;
    const actualMime = mimeType || (mediaType === "image" ? "image/jpeg" : mediaType === "audio" ? "audio/webm" : "video/mp4");

    // For images, use GPT-4o vision capabilities
    const messages: any[] = [
      { role: "system", content: "You are a field data quality analyst. Return only valid JSON." },
    ];

    if (mediaType === "image") {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${actualMime};base64,${base64Content}` } },
        ],
      });
    } else {
      // For audio/video, describe what we have and analyze
      messages.push({
        role: "user",
        content: `${prompt}\n\n[Media type: ${actualMime}, file: ${fileName || "unknown"}. Note: Audio/video binary analysis is limited. Provide best analysis based on available metadata.]`,
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded", fallback: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}`, fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const textContent = aiData.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      parsed = {
        extractedData: { raw: textContent },
        qualityFlags: [{ label: "Parsing incomplete", severity: "warning" }],
        summary: textContent.slice(0, 200),
        confidence: 0.6,
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
