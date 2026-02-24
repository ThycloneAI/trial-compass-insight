

# Improve AI Analysis Speed and Reliability

## Problem Analysis

From the logs, the basic mode analysis took **45 seconds** and advanced mode sometimes exceeds the 120s timeout. Root causes:

1. **Claude Sonnet 4.5 is slow** for large payloads with a 188-line prompt + full trial JSON
2. **No fallback** -- if Claude is slow or fails, the request just times out
3. **No progress feedback** -- user sees a static spinner with no indication of progress
4. **Payload still too large** -- `briefSummary` (200 chars x 48 trials) and `secondaryOutcomes` add unnecessary tokens

## Solution

### 1. Add Lovable AI Gateway as fast fallback (Edge Function)

**File:** `supabase/functions/external-ai-analyze/index.ts`

When the Anthropic call exceeds **60 seconds**, abort it and automatically retry with the Lovable AI Gateway (Gemini 2.5 Flash), which is much faster. This uses `LOVABLE_API_KEY` (already available as a built-in secret).

```text
Flow:
  Claude (60s timeout) --[timeout]--> Gemini 2.5 Flash (60s timeout) --[timeout]--> Error
                       --[success]--> Return result
```

- First attempt: Claude with 60s timeout
- If timeout: automatic fallback to Gemini via Lovable gateway with 60s timeout
- Response includes which model actually served the request

### 2. More aggressive payload trimming (Edge Function)

**File:** `supabase/functions/external-ai-analyze/index.ts`

- Remove `briefSummary` entirely (it adds no PICO value beyond what `conditions` + `arms` provide)
- Remove `officialTitle` (redundant with `briefTitle`)
- For `secondaryOutcomes`: keep only `measure` (drop `timeFrame` and `classification` to save tokens)
- Limit trials to max 50 in the payload sent to AI

### 3. Add elapsed time indicator in UI

**File:** `src/components/ExternalAIAnalysisDrawer.tsx`

- Show a live elapsed timer during analysis: "Analizando... 15s"
- Add a progress message that updates: "Conectando con IA..." -> "Procesando datos..." -> "Generando informe..."
- Show estimated time based on mode: "Tiempo estimado: ~30-60s (basico) / ~60-90s (avanzado)"

### 4. Client-side timeout with retry option

**File:** `src/lib/api.ts`

- Add `AbortController` with 130s client-side timeout to the `analyzeWithExternalAI` function
- On timeout, throw a clear error so the UI can offer a "Reintentar" button

## Technical Summary

| File | Changes |
|------|---------|
| `supabase/functions/external-ai-analyze/index.ts` | Add Gemini fallback on timeout, trim payload more aggressively, reduce Claude timeout to 60s |
| `src/components/ExternalAIAnalysisDrawer.tsx` | Add elapsed time counter, progress messages, estimated time display |
| `src/lib/api.ts` | Add client-side AbortController timeout (130s) |

