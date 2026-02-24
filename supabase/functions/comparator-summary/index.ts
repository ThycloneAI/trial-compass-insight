import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
const armDataSchema = z.object({
  label: z.string().max(500),
  interventions: z.array(z.string().max(500)).max(50),
  controlType: z.string().max(100).optional(),
})

const trialDataSchema = z.object({
  nctId: z.string().regex(/^NCT\d{8}$/, 'Invalid NCT ID format'),
  phase: z.string().max(50),
  arms: z.array(armDataSchema).max(20),
})

const requestBodySchema = z.object({
  mode: z.enum(['basic', 'advanced']),
  trials: z.array(trialDataSchema).min(1, 'At least one trial is required').max(100, 'Maximum 100 trials allowed'),
})

const LLM_TIMEOUT_MS = 60_000 // 60 seconds for LLM calls

interface ArmData {
  label: string;
  interventions: string[];
  controlType?: string;
}

interface TrialData {
  nctId: string;
  phase: string;
  arms: ArmData[];
}

interface RequestBody {
  mode: 'basic' | 'advanced';
  trials: TrialData[];
}

interface Stats {
  totalTrials: number;
  countsByControlType: Record<string, number>;
  hasActiveComparator: boolean;
  hasHeterogeneity: boolean;
  countsByPhase?: Record<string, Record<string, number>>;
  hasAddOn: boolean;
  addOnProportion?: string;
  hasMultipleComparatorsInSingleTrial: boolean;
  phasesPresent: string[];
}

const controlTypeLabels: Record<string, string> = {
  'placebo': 'placebo',
  'sham': 'placebo',
  'standard_of_care': 'tratamiento estándar (SOC)',
  'active_comparator': 'comparador activo',
  'add_on': 'add-on sobre SOC',
  'other': 'otros diseños',
  'experimental': 'experimental',
  'no_intervention': 'sin intervención',
};

function getProportionLabel(count: number, total: number): string {
  if (total === 0) return 'ninguno';
  const ratio = count / total;
  if (ratio < 0.2) return 'una minoría de ensayos';
  if (ratio <= 0.5) return 'una parte relevante de ensayos';
  return 'la mayoría de ensayos';
}

function normalizeControlType(type: string | undefined): string {
  if (!type) return 'other';
  const normalized = type.toLowerCase().replace(/\s+/g, '_');
  if (normalized.includes('placebo') || normalized.includes('sham')) return 'placebo';
  if (normalized.includes('standard') || normalized.includes('soc')) return 'standard_of_care';
  if (normalized.includes('active')) return 'active_comparator';
  if (normalized.includes('add') && normalized.includes('on')) return 'add_on';
  if (normalized.includes('experimental')) return 'experimental';
  if (normalized.includes('no_intervention') || normalized.includes('no intervention')) return 'no_intervention';
  return 'other';
}

function normalizePhase(phase: string): string {
  if (!phase) return 'Unknown';
  const lower = phase.toLowerCase();
  if (lower.includes('1') && lower.includes('2')) return 'Phase 1/2';
  if (lower.includes('2') && lower.includes('3')) return 'Phase 2/3';
  if (lower.includes('3')) return 'Phase 3';
  if (lower.includes('2')) return 'Phase 2';
  if (lower.includes('1')) return 'Phase 1';
  if (lower.includes('4')) return 'Phase 4';
  return phase;
}

function calculateStats(trials: TrialData[]): Stats {
  const totalTrials = trials.length;
  const countsByControlType: Record<string, number> = {};
  const countsByPhase: Record<string, Record<string, number>> = {};
  let hasActiveComparator = false;
  let hasAddOn = false;
  let addOnCount = 0;
  let hasMultipleComparatorsInSingleTrial = false;
  const phasesSet = new Set<string>();

  for (const trial of trials) {
    const phase = normalizePhase(trial.phase);
    phasesSet.add(phase);

    if (!countsByPhase[phase]) {
      countsByPhase[phase] = {};
    }

    const trialControlTypes = new Set<string>();

    for (const arm of trial.arms) {
      const controlType = normalizeControlType(arm.controlType);
      trialControlTypes.add(controlType);

      countsByControlType[controlType] = (countsByControlType[controlType] || 0) + 1;
      countsByPhase[phase][controlType] = (countsByPhase[phase][controlType] || 0) + 1;

      if (controlType === 'active_comparator') {
        hasActiveComparator = true;
      }
      if (controlType === 'add_on') {
        hasAddOn = true;
        addOnCount++;
      }
    }

    const relevantTypes = [...trialControlTypes].filter(t => 
      t !== 'experimental' && t !== 'other'
    );
    if (relevantTypes.length > 1) {
      hasMultipleComparatorsInSingleTrial = true;
    }
  }

  const uniqueControlTypes = Object.keys(countsByControlType).filter(t => 
    t !== 'experimental' && t !== 'other' && countsByControlType[t] > 0
  );
  const hasHeterogeneity = uniqueControlTypes.length > 1;

  return {
    totalTrials,
    countsByControlType,
    hasActiveComparator,
    hasHeterogeneity,
    countsByPhase,
    hasAddOn,
    addOnProportion: hasAddOn ? getProportionLabel(addOnCount, totalTrials) : undefined,
    hasMultipleComparatorsInSingleTrial,
    phasesPresent: [...phasesSet].sort(),
  };
}

function buildStatsDescription(stats: Stats, mode: 'basic' | 'advanced'): string {
  const lines: string[] = [];

  lines.push(`Total de ensayos: ${stats.totalTrials}`);

  const relevantTypes = Object.entries(stats.countsByControlType)
    .filter(([type]) => type !== 'experimental')
    .sort((a, b) => b[1] - a[1]);

  if (relevantTypes.length > 0) {
    const countsStr = relevantTypes
      .map(([type, count]) => `${controlTypeLabels[type] || type}: ${count}`)
      .join(', ');
    lines.push(`Conteos por tipo de comparador: ${countsStr}`);
  }

  lines.push(`¿Hay comparador activo directo?: ${stats.hasActiveComparator ? 'Sí' : 'No'}`);
  lines.push(`¿Hay heterogeneidad (múltiples tipos de comparador)?: ${stats.hasHeterogeneity ? 'Sí' : 'No'}`);

  if (mode === 'advanced') {
    lines.push(`Fases presentes: ${stats.phasesPresent.join(', ')}`);

    for (const phase of stats.phasesPresent) {
      const phaseCounts = stats.countsByPhase?.[phase] || {};
      const phaseStr = Object.entries(phaseCounts)
        .filter(([type]) => type !== 'experimental')
        .map(([type, count]) => `${controlTypeLabels[type] || type}: ${count}`)
        .join(', ');
      if (phaseStr) {
        lines.push(`Desglose ${phase}: ${phaseStr}`);
      }
    }

    lines.push(`¿Hay diseños add-on?: ${stats.hasAddOn ? `Sí, en ${stats.addOnProportion}` : 'No'}`);
    lines.push(`¿Hay múltiples comparadores en un mismo ensayo?: ${stats.hasMultipleComparatorsInSingleTrial ? 'Sí' : 'No'}`);
  }

  return lines.join('\n');
}

async function generateSummaryWithLLM(stats: Stats, mode: 'basic' | 'advanced'): Promise<string> {
  // Try Claude API first, then Lovable gateway, then deterministic fallback
  const ANTHROPIC_API_KEY = Deno.env.get('EXTERNAL_AI_KEY');
  const ANTHROPIC_MODEL = Deno.env.get('EXTERNAL_AI_MODEL') || 'claude-sonnet-4-5';
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  const statsDescription = buildStatsDescription(stats, mode);

  const systemPrompt = `Eres un experto senior en evaluación de tecnologías sanitarias (HTA) y regulación farmacéutica. Tu rol es analizar patrones de comparadores en ensayos clínicos para informar decisiones de acceso al mercado.

REGLAS CRÍTICAS:
1. Analiza EXCLUSIVAMENTE los datos estructurados proporcionados.
2. NO inventes información ni hagas inferencias sobre eficacia o seguridad.
3. NO menciones endpoints — este análisis se centra SOLO en comparadores.
4. Si un dato no está disponible, indícalo explícitamente.
5. Usa terminología HTA precisa en español neutro.
6. Destaca implicaciones para la transferibilidad y la validez externa.
7. Señala heterogeneidad y posibles gaps de evidencia comparativa.`;

  const userPrompt = mode === 'basic'
    ? `Redacta un resumen técnico HTA de comparadores en 5-7 frases.

Debe cubrir:
- Patrón dominante de comparador y su proporción
- Presencia/ausencia de comparador activo directo (implicación para HTA)
- Grado de heterogeneidad en los diseños
- Una observación clave para evaluadores HTA

Datos estructurados:
${statsDescription}`
    : `Redacta un resumen técnico HTA de comparadores en 8-12 frases.

Debe cubrir:
- Patrón dominante de comparador con proporciones exactas
- Análisis detallado de comparadores activos directos vs. indirectos
- Desglose por fase y cambios de estrategia entre fases
- Presencia y relevancia de diseños add-on sobre SOC
- Heterogeneidad intra-ensayo (múltiples comparadores)
- Implicaciones para ITC/NMA (comparaciones indirectas)
- Gaps de evidencia comparativa relevantes para la decisión HTA
- Transferibilidad al contexto regulatorio europeo

Datos estructurados:
${statsDescription}`;

  // Try Claude API (Anthropic direct)
  if (ANTHROPIC_API_KEY) {
    try {
      const maxTokens = mode === 'advanced' ? 2000 : 1000;

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
          return content;
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
        }),
        timeoutMs: LLM_TIMEOUT_MS,
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (_error) {
      // Fall through to deterministic
    }
  }

  // Final fallback: deterministic
  return generateDeterministicSummary(stats, mode);
}

function generateDeterministicSummary(stats: Stats, mode: 'basic' | 'advanced'): string {
  const lines: string[] = [];

  lines.push(`Se han analizado ${stats.totalTrials} ensayo(s) clínico(s).`);

  const relevantTypes = Object.entries(stats.countsByControlType)
    .filter(([type]) => type !== 'experimental' && type !== 'other')
    .sort((a, b) => b[1] - a[1]);

  if (relevantTypes.length > 0) {
    const predominant = relevantTypes[0];
    lines.push(`El tipo de comparador predominante es ${controlTypeLabels[predominant[0]] || predominant[0]} (${predominant[1]} brazo(s)).`);
  } else {
    lines.push('No se ha identificado un tipo de comparador predominante.');
  }

  if (stats.hasActiveComparator) {
    lines.push('Se identifica al menos un comparador activo directo.');
  } else {
    lines.push('No se identifica un comparador activo directo en los ensayos analizados.');
  }

  if (stats.hasHeterogeneity) {
    lines.push('Existe heterogeneidad en los tipos de comparador utilizados.');
  } else {
    lines.push('Los tipos de comparador son homogéneos.');
  }

  if (mode === 'advanced') {
    if (stats.phasesPresent.length > 1) {
      lines.push(`Los ensayos se distribuyen en las siguientes fases: ${stats.phasesPresent.join(', ')}.`);

      const phase2Types = stats.countsByPhase?.['Phase 2'] || {};
      const phase3Types = stats.countsByPhase?.['Phase 3'] || {};

      if (Object.keys(phase2Types).length > 0 && Object.keys(phase3Types).length > 0) {
        const phase2Predominant = Object.entries(phase2Types)
          .filter(([type]) => type !== 'experimental')
          .sort((a, b) => b[1] - a[1])[0];
        const phase3Predominant = Object.entries(phase3Types)
          .filter(([type]) => type !== 'experimental')
          .sort((a, b) => b[1] - a[1])[0];

        if (phase2Predominant && phase3Predominant && phase2Predominant[0] !== phase3Predominant[0]) {
          lines.push(`Se observa un cambio de patrón: en Fase 2 predomina ${controlTypeLabels[phase2Predominant[0]] || phase2Predominant[0]}, mientras que en Fase 3 predomina ${controlTypeLabels[phase3Predominant[0]] || phase3Predominant[0]}.`);
        }
      }
    } else if (stats.phasesPresent.length === 1) {
      lines.push(`Todos los ensayos corresponden a ${stats.phasesPresent[0]}.`);
    }

    if (stats.hasAddOn && stats.addOnProportion) {
      lines.push(`Se identifican diseños add-on sobre SOC en ${stats.addOnProportion}.`);
    }

    if (stats.hasMultipleComparatorsInSingleTrial) {
      lines.push('Algunos ensayos incluyen múltiples tipos de comparador en su diseño.');
    }
  }

  return lines.join(' ');
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req)
  }

  const traceId = newTraceId()
  const log = createLogger('comparator-summary', traceId)
  const startTime = Date.now()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check rate limit
  const { allowed, headers: rlHeaders } = await checkRateLimit(supabase, req, 'comparator-summary', log)

  if (!allowed) {
    return buildRateLimitResponse(corsHeaders, rlHeaders)
  }

  try {
    const rawBody = await req.json();

    // Validate request body with Zod schema
    const validationResult = requestBodySchema.safeParse(rawBody)

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return buildValidationErrorResponse(errors, corsHeaders, log)
    }

    const { mode, trials } = validationResult.data;

    log.info('summary_start', { mode, trialCount: trials.length })

    if (!trials || trials.length === 0) {
      return buildValidationErrorResponse(
        'No hay información estructurada suficiente para generar el resumen.',
        corsHeaders,
        log,
      )
    }

    const stats = calculateStats(trials);

    const hasArmsData = trials.some(t => t.arms && t.arms.length > 0);
    if (!hasArmsData) {
      return buildValidationErrorResponse(
        'No hay información estructurada suficiente para generar el resumen.',
        corsHeaders,
        log,
      )
    }

    const summaryText = await generateSummaryWithLLM(stats, mode);

    log.info('summary_complete', { mode, durationMs: Date.now() - startTime })

    return new Response(
      JSON.stringify({
        summaryText,
        stats,
        mode
      }),
      {
        headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    return buildErrorResponse(error, {
      status: 500,
      corsHeaders,
      log,
      context: 'comparator_summary_error',
    })
  }
});
