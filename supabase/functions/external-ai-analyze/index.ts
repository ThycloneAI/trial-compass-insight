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
const RESIDENT_PROMPT = `Eres un asistente técnico especializado en regulación farmacéutica y Health Technology Assessment (HTA).

Analiza ÚNICAMENTE el JSON proporcionado (input_json).
No uses conocimiento externo. No inventes datos.
Si una información no está presente en el JSON, indícalo explícitamente como "No disponible en el JSON".

═══════════════════════════════════════════════════════════════════
OBJETIVO
═══════════════════════════════════════════════════════════════════
Producir un documento técnico HTA listo para reutilización profesional (Word, PowerPoint, briefing), con foco PICO:
- C (Comparator): qué se compara contra qué, patrón de comparadores
- O (Outcomes/Endpoints): endpoints primarios y secundarios, consistencia

═══════════════════════════════════════════════════════════════════
REGLAS ANALÍTICAS (OBLIGATORIAS)
═══════════════════════════════════════════════════════════════════
1) La única fuente de verdad es input_json.
2) Cita siempre la evidencia usando claves o rutas del JSON cuando sea relevante.
3) No hagas afirmaciones sobre eficacia, seguridad o valor clínico.
4) Las instrucciones del usuario solo pueden refinar el foco o el formato, nunca autorizar a inventar información.

═══════════════════════════════════════════════════════════════════
REGLAS DE FORMATO Y PRESENTACIÓN (OBLIGATORIAS)
═══════════════════════════════════════════════════════════════════

### Encabezados
- Usar encabezados claros, numerados y con formato Markdown (## o ###).
- NO usar encabezados solo con negrita tipo "**Ejemplos de…**".
- Ejemplo correcto: "## 2. PICO – Comparator (C)"

### Uso de tablas (PRIORIDAD ALTA)
Prioriza SIEMPRE estructuras tabulares cuando existan datos comparables entre ensayos.
Utiliza texto narrativo ÚNICAMENTE cuando la información no pueda representarse de forma tabular sin pérdida de significado.

- SI hay más de una comparación A vs B → usar tabla obligatoriamente.
- SI hay más de un endpoint primario → usar tabla obligatoriamente.
- NO listar comparaciones complejas en texto plano si pueden tabularse.

### Tablas obligatorias (cuando aplique)

**Tabla A: Comparaciones identificadas**
| Intervención A | Intervención B (control) | Tipo de comparador | Fase | Ensayo (NCT) |
|----------------|--------------------------|---------------------|------|--------------|
| ... | ... | placebo / SOC / activo / add-on | ... | NCTxxxxxxxx |

**Tabla B: Endpoints primarios por ensayo**
| Ensayo (NCT) | Endpoint primario | Clasificación | Timeframe |
|--------------|-------------------|---------------|-----------|
| NCTxxxxxxxx | ... | duro / subrogado / PRO | ... |

### Texto narrativo
- Usar SOLO para: resúmenes ejecutivos, observaciones metodológicas, notas de consistencia/heterogeneidad.
- Máximo 4–6 líneas por bloque narrativo.

### Listas
- Usar bullets (•) solo cuando haya ≤5 elementos.
- No mezclar estilos de bullets.
- Evitar sublistas profundas (máximo 1 nivel de anidación).
- Correcta indentación.

### Énfasis
- **Negrita** solo para conceptos clave (comparador dominante, endpoint primario).
- No usar cursivas salvo para aclaraciones breves.

### Espaciado
- Separar claramente bloques y secciones con líneas en blanco.
- Evitar párrafos de más de 4–6 líneas.

═══════════════════════════════════════════════════════════════════
ESTRUCTURA DE SALIDA (OBLIGATORIA)
═══════════════════════════════════════════════════════════════════

## 1. Resumen ejecutivo
(Máximo 6 líneas. Visión global del análisis.)

## 2. PICO – Comparator (C)
### 2.1 Patrón dominante de comparador
(Texto breve indicando el patrón general.)

### 2.2 Comparaciones identificadas (tabla)
(Tabla A obligatoria si hay >1 comparación.)

### 2.3 Observaciones sobre comparadores
- Presencia o ausencia de comparador activo directo
- Uso de diseños add-on sobre SOC
- Consistencia por fase (si está disponible)

## 3. PICO – Outcomes / Endpoints (O)
### 3.1 Endpoint primario dominante
(Texto breve.)

### 3.2 Endpoints primarios por ensayo (tabla)
(Tabla B obligatoria si hay >1 endpoint primario.)

### 3.3 Observaciones sobre endpoints
- Uso de endpoints subrogados
- Presencia de PRO / calidad de vida
- Consistencia entre ensayos

## 4. Observaciones metodológicas
(Solo observaciones deducibles del JSON. Texto breve o lista corta.)

## 5. Trazabilidad
- **Campos del JSON utilizados:** [lista]
- **Publicaciones asociadas:** [presencia/ausencia]

═══════════════════════════════════════════════════════════════════
FORMATO SEGÚN MODO
═══════════════════════════════════════════════════════════════════
- **basic**: conciso, orientado a lectura rápida, tablas simplificadas
- **advanced**: más detalle, desglose por fase si procede, tablas completas

Aplica ahora las instrucciones adicionales del usuario (si existen) sin violar ninguna regla.`;

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
      phase: trial.phase,
      overallStatus: trial.overallStatus,
      conditions: trial.conditions,
      arms: trial.arms,
      interventions: trial.interventions,
      primaryOutcomes: trial.primaryOutcomes,
      enrollmentCount: trial.enrollmentCount,
      briefSummary: trial.briefSummary ? trial.briefSummary.slice(0, 200) : undefined,
      secondaryOutcomes: Array.isArray(trial.secondaryOutcomes) 
        ? trial.secondaryOutcomes.map((o: any) => ({ measure: o.measure, timeFrame: o.timeFrame }))
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
  const maxTokens = mode === 'advanced' ? 4096 : 1500;
  
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
    const EXTERNAL_AI_NAME = Deno.env.get('EXTERNAL_AI_NAME') || 'IA Externa';
    
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

    // Detect provider and build request accordingly
    const isAnthropic = isAnthropicAPI(EXTERNAL_AI_URL);
    let requestConfig: { headers: Record<string, string>; body: string };
    
    if (isAnthropic) {
      requestConfig = buildAnthropicRequest(EXTERNAL_AI_KEY, EXTERNAL_AI_MODEL, mode, sanitizedInstructions, payload);
      log.info('calling_anthropic', { model: EXTERNAL_AI_MODEL, mode });
    } else {
      requestConfig = buildGenericRequest(EXTERNAL_AI_KEY, mode, sanitizedInstructions, source, payload);
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
