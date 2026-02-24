

# Fix: Trial Counter Showing 0 and AI Analysis Timeout

## Problem 1: "0 Trials Found" despite 25 results

The ClinicalTrials.gov API v2 does not always return a `totalCount` field (or returns 0). The current code on line 251 of `trials-search/index.ts` does:

```
totalCount = data.totalCount || totalCount
```

Since `totalCount` starts at 0 and the API returns 0 or omits it, the value stays at 0 even though trials are returned. The fix is to fall back to the actual number of trials fetched when `totalCount` is 0.

### Changes

**`supabase/functions/trials-search/index.ts`**
- After the pagination loop, if `totalCount` is still 0 but we have trials, set `totalCount = allTrials.length`.

---

## Problem 2: AI Analysis Timeout

The `external-ai-analyze` edge function sends the full trial JSON (all 25 trials with arms, endpoints, summaries, etc.) to Claude with a 60-second timeout. With `advanced` mode (3000 max tokens) and a large payload, Claude may not finish in time. Two fixes:

### Changes

**`supabase/functions/external-ai-analyze/index.ts`**
- Increase default timeout from 60s to 120s (`EXTERNAL_AI_TIMEOUT_MS`).
- Trim the payload before sending to the AI: strip verbose fields like `briefSummary`, `detailedDescription`, and `secondaryOutcomes` descriptions to reduce token count. Keep only structurally relevant data (arms, primary outcomes, conditions, phase, status).
- Increase `max_tokens` for advanced mode from 3000 to 4096.

**Payload trimming logic** (new helper function in the edge function):
- For each trial in `payload.data`, keep: `nctId`, `briefTitle`, `phase`, `overallStatus`, `conditions`, `arms`, `interventions`, `primaryOutcomes`, `enrollmentCount`.
- Remove or truncate: `briefSummary` (first 200 chars), `secondaryOutcomes` (keep measure + timeFrame only, drop description), `officialTitle`.
- This significantly reduces the token count sent to Claude without losing analytical value for PICO analysis.

---

## Summary of files to modify

| File | Change |
|------|--------|
| `supabase/functions/trials-search/index.ts` | Fallback `totalCount` to `allTrials.length` when API returns 0 |
| `supabase/functions/external-ai-analyze/index.ts` | Increase timeout to 120s, trim payload, increase max_tokens for advanced mode |

