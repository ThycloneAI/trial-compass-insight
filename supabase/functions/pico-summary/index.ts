import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import {
  getCorsHeaders,
  handleCorsPreflightResponse,
  checkRateLimit,
  createLogger,
  newTraceId,
  buildErrorResponse,
  buildValidationErrorResponse,
  buildRateLimitResponse,
  fetchWithTimeout,
} from '../_shared/mod.ts'

// Input validation schemas
const comparatorAnalysisSchema = z.object({
  predominantComparator: z.enum(['placebo', 'soc', 'active', 'add-on', 'mixed', 'not_evaluable']),
  hasDirectActiveComparator: z.boolean().nullable(),
  addOnDesigns: z.enum(['not_present', 'minority', 'relevant', 'predominant', 'not_evaluable']),
  phaseConsistency: z.enum(['consistent', 'changes', 'not_evaluable']),
  structuralNote: z.string().max(2000),
})

const endpointAnalysisSchema = z.object({
  dominantPrimaryEndpoint: z.enum(['OS', 'PFS', 'ORR', 'other_surrogate', 'PRO', 'safety', 'mixed', 'not_evaluable']),
  hasHardClinicalPrimary: z.boolean().nullable(),
  surrogateUsage: z.enum(['no', 'secondary', 'primary_predominant', 'not_evaluable']),
  prosPresence: z.enum(['not_present', 'secondary', 'relevant', 'not_evaluable']),
  endpointConsistency: z.enum(['high', 'moderate', 'low', 'not_evaluable']),
  structuralNote: z.string().max(2000),
})

const picoAnalysisSchema = z.object({
  comparator: comparatorAnalysisSchema,
  endpoint: endpointAnalysisSchema,
  totalTrials: z.number().min(0).max(1000),
})

const requestBodySchema = z.object({
  mode: z.enum(['basic', 'advanced']).optional().default('basic'),
  analysis: picoAnalysisSchema,
  drugName: z.string().max(200).optional(),
  indication: z.string().max(500).optional(),
})

const LLM_TIMEOUT_MS = 60_000 // 60 seconds for LLM calls

interface ComparatorAnalysis {
  predominantComparator: 'placebo' | 'soc' | 'active' | 'add-on' | 'mixed' | 'not_evaluable';
  hasDirectActiveComparator: boolean | null;
  addOnDesigns: 'not_present' | 'minority' | 'relevant' | 'predominant' | 'not_evaluable';
  phaseConsistency: 'consistent' | 'changes' | 'not_evaluable';
  structuralNote: string;
}

interface EndpointAnalysis {
  dominantPrimaryEndpoint: 'OS' | 'PFS' | 'ORR' | 'other_surrogate' | 'PRO' | 'safety' | 'mixed' | 'not_evaluable';
  hasHardClinicalPrimary: boolean | null;
  surrogateUsage: 'no' | 'secondary' | 'primary_predominant' | 'not_evaluable';
  prosPresence: 'not_present' | 'secondary' | 'relevant' | 'not_evaluable';
  endpointConsistency: 'high' | 'moderate' | 'low' | 'not_evaluable';
  structuralNote: string;
}

interface PicoAnalysis {
  comparator: ComparatorAnalysis;
  endpoint: EndpointAnalysis;
  totalTrials: number;
}

interface RequestBody {
  mode: 'basic' | 'advanced';
  analysis: PicoAnalysis;
  drugName?: string;
  indication?: string;
}

// Labels for building prompts
const COMPARATOR_LABELS: Record<string, string> = {
  placebo: 'placebo',
  soc: 'tratamiento estándar (SOC)',
  active: 'comparador activo directo',
  'add-on': 'diseño add-on sobre SOC',
  mixed: 'comparadores mixtos',
  not_evaluable: 'no evaluable',
};

const ADDON_LABELS: Record<string, string> = {
  not_present: 'no presentes',
  minority: 'minoritarios (<20%)',
  relevant: 'relevantes (20-50%)',
  predominant: 'predominantes (>50%)',
  not_evaluable: 'no evaluable',
};

const CONSISTENCY_LABELS: Record<string, string> = {
  consistent: 'consistente entre fases',
  changes: 'variable entre fases',
  high: 'alta (>75%)',
  moderate: 'moderada (40-75%)',
  low: 'baja (<40%)',
  not_evaluable: 'no evaluable',
};

const ENDPOINT_LABELS: Record<string, string> = {
  OS: 'supervivencia global (OS)',
  PFS: 'supervivencia libre de progresión (PFS)',
  ORR: 'tasa de respuesta objetiva (ORR)',
  other_surrogate: 'otros endpoints subrogados',
  PRO: 'resultados reportados por pacientes (PRO)',
  safety: 'seguridad',
  mixed: 'mixto',
  not_evaluable: 'no evaluable',
};

const SURROGATE_LABELS: Record<string, string> = {
  no: 'no utilizados',
  secondary: 'como endpoints secundarios',
  primary_predominant: 'como primarios predominantes',
  not_evaluable: 'no evaluable',
};

const PRO_LABELS: Record<string, string> = {
  not_present: 'no presentes',
  secondary: 'como endpoints secundarios',
  relevant: 'con presencia relevante',
  not_evaluable: 'no evaluable',
};

function buildAnalysisContext(analysis: PicoAnalysis, drugName?: string, indication?: string): string {
  const { comparator, endpoint, totalTrials } = analysis;
  
  let context = `Análisis PICO de ${totalTrials} ensayo(s) clínico(s)`;
  if (drugName) context += ` para ${drugName}`;
  if (indication) context += ` en ${indication}`;
  context += '.\n\n';

  context += 'COMPARADORES:\n';
  context += `- Comparador predominante: ${COMPARATOR_LABELS[comparator.predominantComparator]}\n`;
  context += `- Comparador activo directo: ${comparator.hasDirectActiveComparator === null ? 'no evaluable' : (comparator.hasDirectActiveComparator ? 'sí' : 'no')}\n`;
  context += `- Diseños add-on: ${ADDON_LABELS[comparator.addOnDesigns]}\n`;
  context += `- Consistencia entre fases: ${CONSISTENCY_LABELS[comparator.phaseConsistency]}\n`;
  context += '\n';

  context += 'ENDPOINTS:\n';
  context += `- Endpoint primario dominante: ${ENDPOINT_LABELS[endpoint.dominantPrimaryEndpoint]}\n`;
  context += `- Endpoint clínico duro como primario: ${endpoint.hasHardClinicalPrimary === null ? 'no evaluable' : (endpoint.hasHardClinicalPrimary ? 'sí' : 'no')}\n`;
  context += `- Uso de subrogados: ${SURROGATE_LABELS[endpoint.surrogateUsage]}\n`;
  context += `- PROs: ${PRO_LABELS[endpoint.prosPresence]}\n`;
  context += `- Consistencia de endpoints: ${CONSISTENCY_LABELS[endpoint.endpointConsistency]}\n`;

  return context;
}

async function generateWithLLM(analysis: PicoAnalysis, mode: 'basic' | 'advanced', drugName?: string, indication?: string): Promise<string> {
  // Try Claude API first, then Lovable gateway, then deterministic fallback
  const ANTHROPIC_API_KEY = Deno.env.get('EXTERNAL_AI_KEY');
  const ANTHROPIC_MODEL = Deno.env.get('EXTERNAL_AI_MODEL') || 'claude-sonnet-4-5';
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  const context = buildAnalysisContext(analysis, drugName, indication);

  const systemPrompt = `Eres un experto senior en evaluación de tecnologías sanitarias (HTA) con experiencia en agencias europeas (EUnetHTA, NICE, G-BA, HAS). Tu rol es generar resúmenes narrativos PICO de alta calidad profesional, listos para integrar en dossiers de valor o informes de posicionamiento terapéutico.

REGLAS CRÍTICAS:
1. Analiza EXCLUSIVAMENTE los datos estructurados proporcionados.
2. NO interpretes eficacia, seguridad ni valor clínico del medicamento.
3. NO inventes información que no esté en los datos.
4. Usa terminología HTA precisa en español neutro (comparador, subrogado, PRO, etc.).
5. Mantén tono objetivo y descriptivo, sin recomendaciones.
6. Si un dato no está presente, indícalo explícitamente como "no disponible".

El resumen debe permitir a un evaluador HTA responder rápidamente:
- P: ¿Qué población se estudia y con qué criterios?
- I: ¿Cuál es la intervención evaluada?
- C: ¿Contra qué se compara? ¿Hay comparador activo directo?
- O: ¿Qué endpoints se miden? ¿Son duros, subrogados o PRO?
- ¿La evidencia es consistente entre fases de desarrollo?
- ¿Qué gaps existen para la decisión HTA?`;

  const userPrompt = mode === 'basic'
    ? `Genera un resumen narrativo PICO BÁSICO (6-8 frases) basado en estos datos:

${context}

El resumen debe:
- Integrar comparadores y endpoints en una narrativa fluida
- Destacar el patrón dominante y la presencia/ausencia de evidencia directa
- Señalar una observación clave para el evaluador HTA
- Ser conciso pero técnicamente preciso`
    : `Genera un resumen narrativo PICO AVANZADO (10-14 frases) basado en estos datos:

${context}

El resumen debe cubrir en detalle:
1. Visión global del programa de desarrollo (n ensayos, fases)
2. Patrón de comparadores: tipo dominante, proporciones, consistencia entre fases
3. Presencia y relevancia de comparadores activos directos (implicación para ITC/NMA)
4. Diseños add-on: proporción y significado para la interpretación
5. Endpoints: primario dominante, uso de subrogados vs. duros
6. PROs: presencia y nivel (primario, secundario, ausente)
7. Consistencia de endpoints entre ensayos
8. Gaps de evidencia y puntos de atención para el evaluador HTA
9. Transferibilidad al contexto regulatorio europeo`;

  // Try Claude API (Anthropic direct)
  if (ANTHROPIC_API_KEY) {
    try {
      const maxTokens = mode === 'advanced' ? 2500 : 1200;

      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        }),
        timeoutMs: LLM_TIMEOUT_MS,
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');

        if (content) {
          return content.trim();
        }
      }
    } catch (_error) {
      // Fall through to next provider
    }
  }

  // Fallback: Lovable gateway (Gemini)
  if (LOVABLE_API_KEY) {
    try {
      const response = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: mode === 'advanced' ? 2500 : 1200,
        }),
        timeoutMs: LLM_TIMEOUT_MS,
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }
    } catch (_error) {
      // Fall through to deterministic
    }
  }

  // Final fallback: deterministic
  return generateDeterministicSummary(analysis, mode);
}

function generateDeterministicSummary(analysis: PicoAnalysis, mode: 'basic' | 'advanced'): string {
  const { comparator, endpoint, totalTrials } = analysis;
  const parts: string[] = [];

  // Introduction
  parts.push(`El análisis incluye ${totalTrials} ensayo${totalTrials !== 1 ? 's' : ''} clínico${totalTrials !== 1 ? 's' : ''}.`);

  // Comparator section
  if (comparator.predominantComparator !== 'not_evaluable') {
    parts.push(comparator.structuralNote);
    
    if (mode === 'advanced') {
      if (comparator.hasDirectActiveComparator) {
        parts.push('Se identifican comparaciones activas directas en la evidencia disponible.');
      }
      if (comparator.addOnDesigns === 'relevant' || comparator.addOnDesigns === 'predominant') {
        parts.push(`Los diseños add-on sobre terapia estándar son ${ADDON_LABELS[comparator.addOnDesigns]}.`);
      }
      if (comparator.phaseConsistency === 'changes') {
        parts.push('La estrategia de comparador varía entre las diferentes fases de desarrollo.');
      }
    }
  } else {
    parts.push('Los datos de comparadores no son suficientes para establecer un patrón claro.');
  }

  // Endpoint section
  if (endpoint.dominantPrimaryEndpoint !== 'not_evaluable') {
    parts.push(endpoint.structuralNote);
    
    if (mode === 'advanced') {
      if (endpoint.hasHardClinicalPrimary && endpoint.dominantPrimaryEndpoint !== 'OS') {
        parts.push('Existen ensayos con supervivencia global como endpoint, aunque no es el predominante.');
      }
      if (endpoint.prosPresence === 'relevant') {
        parts.push('Los resultados reportados por pacientes (PROs) tienen presencia relevante en el programa de desarrollo.');
      } else if (endpoint.prosPresence === 'secondary') {
        parts.push('Los PROs se incluyen como endpoints secundarios.');
      }
      if (endpoint.endpointConsistency !== 'not_evaluable') {
        parts.push(`La consistencia de endpoints entre ensayos es ${CONSISTENCY_LABELS[endpoint.endpointConsistency]}.`);
      }
    }
  } else {
    parts.push('Los datos de endpoints no son suficientes para establecer un patrón claro.');
  }

  // HTA positioning (advanced only)
  if (mode === 'advanced') {
    const htaNotes: string[] = [];
    
    if (!endpoint.hasHardClinicalPrimary) {
      htaNotes.push('la ausencia de endpoints clínicos duros como variable primaria');
    }
    if (!comparator.hasDirectActiveComparator) {
      htaNotes.push('la falta de comparaciones activas directas');
    }
    if (endpoint.surrogateUsage === 'primary_predominant') {
      htaNotes.push('el predominio de endpoints subrogados');
    }
    
    if (htaNotes.length > 0) {
      parts.push(`Desde una perspectiva HTA, cabe destacar ${htaNotes.join(', ')}.`);
    }
  }

  return parts.join(' ');
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req)
  }

  const traceId = newTraceId()
  const log = createLogger('pico-summary', traceId)
  const startTime = Date.now()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check rate limit
  const { allowed, headers: rlHeaders } = await checkRateLimit(supabase, req, 'pico-summary', log)

  if (!allowed) {
    return buildRateLimitResponse(corsHeaders, rlHeaders)
  }

  try {
    // Parse and validate request body
    const rawBody = await req.json();
    const validationResult = requestBodySchema.safeParse(rawBody)

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return buildValidationErrorResponse(errors, corsHeaders, log)
    }

    const { mode, analysis, drugName, indication } = validationResult.data;

    log.info('pico_summary_start', { mode, totalTrials: analysis.totalTrials })

    // Generate summary
    const summaryText = await generateWithLLM(
      analysis,
      mode,
      drugName,
      indication
    );

    log.info('pico_summary_complete', { mode, durationMs: Date.now() - startTime })

    return new Response(
      JSON.stringify({
        summaryText,
        mode,
        totalTrials: analysis.totalTrials,
      }),
      {
        headers: {
          ...corsHeaders,
          ...rlHeaders,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    return buildErrorResponse(error, {
      status: 500,
      corsHeaders,
      log,
      context: 'pico_summary_error',
    })
  }
});
