import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import {
  getCorsHeaders,
  handleCorsPreflightResponse,
  createLogger,
  newTraceId,
} from '../_shared/mod.ts'

// Input validation schema
const requestBodySchema = z.object({
  source: z.string().min(1).max(100).optional(),
  mode: z.enum(['basic', 'advanced']).optional().default('basic'),
  payload: z.record(z.any()).optional(),
  user_instructions: z.string().max(1000).optional().default(''),
  config_check: z.boolean().optional().default(false),
})

// Fixed resident prompt - cannot be modified by users
const RESIDENT_PROMPT = `You are a senior HTA intelligence analyst specializing in pharmaceutical regulation, market access strategy, and clinical development landscape analysis.

Analyze ONLY the JSON provided (input_json).
Do NOT use external knowledge. Do NOT invent data.
If a data point is not present in the JSON, state "Not available in dataset".

═══════════════════════════════════════════════════════════════════
OBJECTIVE
═══════════════════════════════════════════════════════════════════
Produce an expert-level PICO Intelligence Report suitable for HTA dossier preparation, market access briefings, and regulatory strategy documents. The report must cover:
- **P (Population):** Conditions, enrollment scale, patient segments
- **I (Intervention):** Drugs/interventions under study, mechanisms, dosing patterns
- **C (Comparator):** Control arms, comparator strategies, placebo vs active
- **O (Outcomes):** Primary and secondary endpoints, classification, consistency
- **Landscape:** Phase distribution, sponsor landscape, geographic footprint, timelines

═══════════════════════════════════════════════════════════════════
ANALYTICAL RULES (MANDATORY)
═══════════════════════════════════════════════════════════════════
1) The ONLY source of truth is input_json.
2) Always cite evidence using JSON keys/paths when relevant.
3) Do NOT make claims about efficacy, safety, or clinical value.
4) User instructions may only refine focus or format, never authorize inventing data.
5) All trials in the dataset MUST appear in landscape tables — never show only examples.

═══════════════════════════════════════════════════════════════════
FORMATTING RULES (MANDATORY)
═══════════════════════════════════════════════════════════════════

### Headings
- Use numbered Markdown headings (## or ###).
- Do NOT use bold-only pseudo-headings like "**Section Title**".

### Tables (HIGH PRIORITY)
Prioritize TABULAR structures whenever comparing data across trials.
Use narrative text ONLY when information cannot be tabulated without loss of meaning.

- If >1 comparison A vs B → table is mandatory.
- If >1 primary endpoint → table is mandatory.
- ALL trials must appear in landscape tables (Table C, Table D).

### Horizontal Rules
- Use "---" between major sections for visual separation.

### Narrative Blocks
- Max 4-6 lines per narrative block.
- Executive summary: 4-8 lines, QUANTIFIED (e.g., "25 trials analyzed, 60% Phase 3, 4 unique sponsors").

### Lists
- Bullets (- ) only when ≤5 items.
- Max 1 nesting level.

### Emphasis
- **Bold** only for key concepts (dominant comparator, primary endpoint pattern).

═══════════════════════════════════════════════════════════════════
OUTPUT STRUCTURE (MANDATORY)
═══════════════════════════════════════════════════════════════════

## 1. Executive Summary
(4-8 lines. Quantified overview: total trials, phase distribution percentages, unique sponsors count, dominant condition, enrollment range, key comparator pattern, dominant endpoint type.)

---

## 2. Trial Landscape Overview

### 2.1 Trial Landscape Summary (Table C — ALL trials)

| NCT ID | Phase | Status | Sponsor | Enrollment | Start Date | Study Type |
|--------|-------|--------|---------|------------|------------|------------|
| NCTxxxxxxxx | ... | ... | ... | ... | ... | ... |

### 2.2 Phase Distribution
(Brief quantified analysis: how many trials per phase, percentages.)

### 2.3 Status Distribution
(Recruiting vs completed vs terminated vs other. Quantified.)

### 2.4 Sponsor Landscape
(Unique sponsors, industry vs academic/institutional breakdown. Note any dominant sponsors.)

### 2.5 Timeline Analysis
(Date range of trials, duration patterns if start+completion dates available.)

### 2.6 Enrollment Scale
(Min, max, median enrollment. Note outliers.)

---

## 3. PICO — Population (P)

### 3.1 Conditions Targeted
(List of unique conditions/indications. Note concentration or diversity.)

### 3.2 Enrollment Characteristics
(Enrollment distribution across trials. Any healthy volunteer studies.)

---

## 4. PICO — Intervention (I)

### 4.1 Intervention Mapping (Table D — ALL trials)

| NCT ID | Intervention(s) | Type | Mechanism/Class (if inferable) |
|--------|-----------------|------|-------------------------------|
| NCTxxxxxxxx | ... | Drug / Biological / Device / ... | ... |

### 4.2 Intervention Patterns
(Dominant drug/class, mono vs combination, route if inferable.)

---

## 5. PICO — Comparator (C)

### 5.1 Dominant Comparator Pattern
(Brief statement: placebo-controlled, active comparator, SOC, add-on.)

### 5.2 Comparisons Identified (Table A)

| Intervention A | Intervention B (control) | Comparator Type | Phase | Trial (NCT) |
|----------------|--------------------------|-----------------|-------|-------------|
| ... | ... | placebo / SOC / active / add-on | ... | NCTxxxxxxxx |

### 5.3 Comparator Observations
- Presence or absence of direct active comparator
- Add-on over SOC designs
- Consistency across phases

---

## 6. PICO — Outcomes (O)

### 6.1 Dominant Primary Endpoint
(Brief statement.)

### 6.2 Primary Endpoints by Trial (Table B)

| Trial (NCT) | Primary Endpoint | Classification | Timeframe |
|-------------|------------------|----------------|-----------|
| NCTxxxxxxxx | ... | hard / surrogate / PRO | ... |

### 6.3 Secondary Endpoints Overview
(Patterns in secondary endpoints. PRO/QoL presence.)

### 6.4 Endpoint Observations
- Surrogate vs hard clinical endpoints
- PRO / quality of life presence
- Consistency across trials
- Notable timeframe patterns

---

## 7. Methodological Observations
(Only observations deducible from JSON. Brief text or short list. Design patterns, blinding, randomization notes if inferable from arm types.)

---

## 8. Traceability
- **JSON fields used:** [list]
- **Total trials analyzed:** [number]
- **Data completeness notes:** [any missing fields across trials]

═══════════════════════════════════════════════════════════════════
MODE-SPECIFIC BEHAVIOR
═══════════════════════════════════════════════════════════════════
- **basic**: Concise, rapid reading. Simplified tables (may abbreviate columns). Shorter narrative blocks.
- **advanced**: Full detail. Complete tables with ALL trials. Sub-analysis by phase grouping. Extended methodological observations. Additional cross-tabulation patterns.

Apply user instructions (if any) without violating any rule above.`;

// Hash function including user_instructions for proper caching
function hashPayload(payload: any, mode: string, userInstructions: string): string {
  const str = JSON.stringify(payload) + mode + userInstructions;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `external_ai_${Math.abs(hash).toString(16)}`;
}

// Trim payload to reduce token count for AI analysis
function trimPayloadForAI(payload: any): any {
  if (!payload?.data || !Array.isArray(payload.data)) return payload;
  
  const trimmed = {
    ...payload,
    data: payload.data.map((trial: any) => ({
      nctId: trial.nctId,
      briefTitle: trial.briefTitle,
      officialTitle: trial.officialTitle,
      phase: trial.phase,
      overallStatus: trial.overallStatus,
      studyType: trial.studyType,
      conditions: trial.conditions,
      arms: trial.arms,
      interventions: trial.interventions,
      primaryOutcomes: trial.primaryOutcomes,
      enrollmentCount: trial.enrollmentCount,
      leadSponsor: trial.leadSponsor,
      startDate: trial.startDate,
      completionDate: trial.completionDate,
      briefSummary: trial.briefSummary ? trial.briefSummary.slice(0, 200) : undefined,
      secondaryOutcomes: Array.isArray(trial.secondaryOutcomes) 
        ? trial.secondaryOutcomes.map((o: any) => ({ measure: o.measure, timeFrame: o.timeFrame, classification: o.classification }))
        : undefined,
    }))
  };
  return trimmed;
}

// Detect if URL is Anthropic API
function isAnthropicAPI(url: string): boolean {
  return url.includes('api.anthropic.com');
}

// Build request for Anthropic API
function buildAnthropicRequest(
  apiKey: string,
  model: string,
  mode: string,
  userInstructions: string,
  payload: any
): { headers: Record<string, string>; body: string } {
  const maxTokens = mode === 'advanced' ? 8192 : 2500;
  
  // Build the user message content
  let userContent = RESIDENT_PROMPT;
  if (userInstructions) {
    userContent += `\n\nInstrucciones adicionales del usuario:\n${userInstructions}`;
  }
  userContent += `\n\nJSON a analizar:\n${JSON.stringify(payload, null, 2)}`;

  return {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: userContent }
      ]
    })
  };
}

// Build request for generic OpenAI-compatible API
function buildGenericRequest(
  apiKey: string,
  mode: string,
  userInstructions: string,
  source: string,
  payload: any
): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resident_prompt: RESIDENT_PROMPT,
      user_instructions: userInstructions,
      mode,
      source,
      input_json: payload
    })
  };
}

// Parse Anthropic response
function parseAnthropicResponse(data: any): { text: string; json?: any } {
  // Anthropic returns: { content: [{ type: "text", text: "..." }], ... }
  if (data.content && Array.isArray(data.content)) {
    const textContent = data.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    return { text: textContent };
  }
  // Fallback if unexpected format
  return { text: JSON.stringify(data, null, 2) };
}

// Parse generic response
function parseGenericResponse(data: any): { text: string; json?: any } {
  const text = data.analysisText || 
               data.text || 
               data.content ||
               data.response ||
               data.message ||
               data.result ||
               data.output ||
               (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  
  return { text, json: data.analysisJson || data.structured || null };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req)
  }

  const traceId = newTraceId()
  const log = createLogger('external-ai-analyze', traceId)
  const startTime = Date.now();
  
  try {
    // Get environment variables
    const EXTERNAL_AI_URL = Deno.env.get('EXTERNAL_AI_URL');
    const EXTERNAL_AI_KEY = Deno.env.get('EXTERNAL_AI_KEY');
    const EXTERNAL_AI_MODEL = Deno.env.get('EXTERNAL_AI_MODEL') || 'claude-sonnet-4-5';
    const EXTERNAL_AI_TIMEOUT_MS = parseInt(Deno.env.get('EXTERNAL_AI_TIMEOUT_MS') || '120000');
    const EXTERNAL_AI_NAME = Deno.env.get('EXTERNAL_AI_NAME') || 'IA';
    
    // Parse and validate request body
    const rawBody = await req.json();
    const validationResult = requestBodySchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      log.warn('validation_error', { errors })
      return new Response(
        JSON.stringify({ error: `Invalid request: ${errors}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { source, mode, payload, user_instructions, config_check } = validationResult.data;
    
    // Handle config check mode - no real API call
    if (config_check) {
      const configured = !!(EXTERNAL_AI_URL && EXTERNAL_AI_KEY);
      return new Response(
        JSON.stringify({ 
          configured,
          aiName: configured ? EXTERNAL_AI_NAME : null,
          model: configured ? EXTERNAL_AI_MODEL : null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate configuration
    if (!EXTERNAL_AI_URL || !EXTERNAL_AI_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'External AI not configured',
          message: 'EXTERNAL_AI_URL and EXTERNAL_AI_KEY must be set in environment variables',
          configured: false
        }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (!source || !payload) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: source, payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and sanitize user_instructions (max 1000 chars)
    const sanitizedInstructions = (user_instructions || '').slice(0, 1000).trim();

    // Check payload size (limit ~1.5 MB)
    const payloadSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    const MAX_PAYLOAD_SIZE = 1.5 * 1024 * 1024; // 1.5 MB
    if (payloadSize > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ 
          error: 'Payload too large',
          message: `El JSON es demasiado grande (${(payloadSize / 1024 / 1024).toFixed(2)} MB). Límite: 1.5 MB. Reduzca el número de resultados o filtre los datos.`,
          errorSource: 'payload_size'
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client for caching
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check cache (includes user_instructions in hash)
    const cacheKey = hashPayload(payload, mode, sanitizedInstructions);
    const { data: cachedResult } = await supabase
      .from('trial_cache')
      .select('payload_json, fetched_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cachedResult) {
      const cacheAge = Date.now() - new Date(cachedResult.fetched_at).getTime();
      const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
      
      if (cacheAge < CACHE_TTL_MS) {
        log.info('cache_hit');
        const cached = cachedResult.payload_json as any;
        return new Response(
          JSON.stringify({
            ...cached,
            cached: true,
            cachedAt: cachedResult.fetched_at
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Rate limiting (reuse rate_limits table)
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    const windowStart = new Date(Date.now() - 3600000).toISOString(); // 1 hour window
    const { data: rateLimitData } = await supabase
      .from('rate_limits')
      .select('request_count')
      .eq('ip_address', clientIP)
      .eq('endpoint', 'external-ai-analyze')
      .gte('window_start', windowStart)
      .single();

    const currentCount = rateLimitData?.request_count || 0;
    const MAX_REQUESTS_PER_HOUR = 20;

    if (currentCount >= MAX_REQUESTS_PER_HOUR) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: `Maximum ${MAX_REQUESTS_PER_HOUR} external AI requests per hour`,
          errorSource: 'rate_limit'
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update rate limit counter
    await supabase.from('rate_limits').upsert({
      ip_address: clientIP,
      endpoint: 'external-ai-analyze',
      request_count: currentCount + 1,
      window_start: new Date().toISOString()
    }, { onConflict: 'ip_address,endpoint' });

    // Trim payload to reduce token count
    const trimmedPayload = trimPayloadForAI(payload);

    // Detect provider and build request accordingly
    const isAnthropic = isAnthropicAPI(EXTERNAL_AI_URL);
    let requestConfig: { headers: Record<string, string>; body: string };
    
    if (isAnthropic) {
      requestConfig = buildAnthropicRequest(EXTERNAL_AI_KEY, EXTERNAL_AI_MODEL, mode, sanitizedInstructions, trimmedPayload);
      log.info('calling_anthropic', { model: EXTERNAL_AI_MODEL, mode });
    } else {
      requestConfig = buildGenericRequest(EXTERNAL_AI_KEY, mode, sanitizedInstructions, source, trimmedPayload);
      log.info('calling_generic_ai', { mode });
    }

    // Call external AI API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_AI_TIMEOUT_MS);

    let externalResponse: Response;
    let externalStatus: number;
    let analysisText: string;
    let analysisJson: any = null;

    try {
      externalResponse = await fetch(EXTERNAL_AI_URL, {
        method: 'POST',
        headers: requestConfig.headers,
        body: requestConfig.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      externalStatus = externalResponse.status;

      if (!externalResponse.ok) {
        const errorText = await externalResponse.text();
        log.error('external_ai_error', { status: externalStatus, snippet: errorText.slice(0, 200) });
        
        // Determine error source
        const errorSource = externalStatus >= 400 && externalStatus < 500 
          ? 'external_ai_client_error' 
          : externalStatus >= 500 
            ? 'external_ai_server_error' 
            : 'network_error';
        
        return new Response(
          JSON.stringify({ 
            error: 'External AI error',
            errorSource,
            status: externalStatus,
            message: `Error del proveedor de IA (${externalStatus})`,
            externalErrorSnippet: errorText.slice(0, 500)
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const externalData = await externalResponse.json();
      
      // Parse response based on provider
      if (isAnthropic) {
        const parsed = parseAnthropicResponse(externalData);
        analysisText = parsed.text;
        analysisJson = parsed.json || null;
      } else {
        const parsed = parseGenericResponse(externalData);
        analysisText = parsed.text;
        analysisJson = parsed.json;
      }

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            error: 'External AI timeout',
            errorSource: 'timeout',
            message: `La petición expiró después de ${EXTERNAL_AI_TIMEOUT_MS / 1000} segundos`
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      log.error('fetch_error', { error: fetchError.message });
      return new Response(
        JSON.stringify({ 
          error: 'Network error',
          errorSource: 'network',
          message: `Error de red: ${fetchError.message}`
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const durationMs = Date.now() - startTime;

    // Build response
    const result = {
      analysisText,
      analysisJson,
      aiName: EXTERNAL_AI_NAME,
      model: isAnthropic ? EXTERNAL_AI_MODEL : undefined,
      userInstructionsUsed: sanitizedInstructions || null,
      trace: {
        calledAt: new Date().toISOString(),
        endpoint: EXTERNAL_AI_URL.replace(/\/[^/]*$/, '/***'), // Mask last path segment for security
        status: externalStatus,
        durationMs
      }
    };

    // Cache the result
    await supabase.from('trial_cache').upsert({
      cache_key: cacheKey,
      payload_json: result,
      fetched_at: new Date().toISOString(),
      ttl_hours: 24
    }, { onConflict: 'cache_key' });

    log.info('analysis_complete', { durationMs });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    log.error('unhandled_error', { error: error.message || String(error) });
    
    return new Response(
      JSON.stringify({ 
        error: 'External AI analysis failed',
        errorSource: 'internal',
        message: error.message || 'Unknown error occurred',
        trace: {
          calledAt: new Date().toISOString(),
          durationMs: Date.now() - startTime
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
