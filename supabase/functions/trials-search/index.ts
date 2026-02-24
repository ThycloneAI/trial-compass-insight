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

// Input validation schemas - both drug and condition are optional but at least one required
const searchParamsSchema = z.object({
  drug: z.string().max(200, 'Drug name too long').optional().default(''),
  condition: z.string().max(500, 'Condition too long').optional().default(''),
  biomarker: z.string().max(200, 'Biomarker too long').optional().default(''),
  phase: z.array(z.string().max(20)).max(10).optional().default([]),
  status: z.array(z.string().max(30)).max(10).optional().default([]),
  studyType: z.string().max(50).optional().default(''),
  minDate: z.string().max(20).optional().default(''),
  maxDate: z.string().max(20).optional().default(''),
  maxResults: z.number().min(1).max(500).optional().default(50),
  pageToken: z.string().max(2000, 'Page token too long').optional().default(''),
  searchMode: z.enum(['drug', 'condition', 'combined']).optional().default('combined'),
}).refine(
  (data) => (data.drug && data.drug.trim().length > 0) || (data.condition && data.condition.trim().length > 0),
  { message: 'At least one of drug or condition is required' }
)

const CT_GOV_TIMEOUT_MS = 30_000 // 30 seconds per API page call

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req)
  }

  const traceId = newTraceId()
  const log = createLogger('trials-search', traceId)
  const startTime = Date.now()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check rate limit
  const { allowed, headers: rlHeaders } = await checkRateLimit(supabase, req, 'trials-search', log)

  if (!allowed) {
    return buildRateLimitResponse(corsHeaders, rlHeaders)
  }

  try {
    const url = new URL(req.url)

    // Parse and validate input parameters
    const rawParams = {
      drug: url.searchParams.get('drug') || '',
      condition: url.searchParams.get('condition') || '',
      biomarker: url.searchParams.get('biomarker') || '',
      phase: url.searchParams.getAll('phase'),
      status: url.searchParams.getAll('status'),
      studyType: url.searchParams.get('studyType') || '',
      minDate: url.searchParams.get('minDate') || '',
      maxDate: url.searchParams.get('maxDate') || '',
      maxResults: parseInt(url.searchParams.get('maxResults') || '50') || 50,
      searchMode: url.searchParams.get('searchMode') || 'combined',
      pageToken: url.searchParams.get('pageToken') || '',
    }

    // Validate with Zod schema
    const validationResult = searchParamsSchema.safeParse(rawParams)

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => e.message).join(', ')
      return buildValidationErrorResponse(errors, corsHeaders, log)
    }

    const { drug, condition, biomarker, phase, status, studyType, minDate, maxDate, maxResults, searchMode, pageToken } = validationResult.data

    log.info('search_start', { drug, condition, biomarker, searchMode, maxResults })

    // Build cache key (include pageToken for paginated requests)
    const cacheKey = JSON.stringify({ drug, condition, phase, status, studyType, minDate, maxDate, maxResults, biomarker, searchMode, pageToken })

    // Check cache first
    const { data: cached } = await supabase
      .from('trial_cache')
      .select('payload_json, fetched_at, ttl_hours')
      .eq('cache_key', cacheKey)
      .single()

    if (cached) {
      const fetchedAt = new Date(cached.fetched_at)
      const ttlMs = cached.ttl_hours * 60 * 60 * 1000
      if (Date.now() - fetchedAt.getTime() < ttlMs) {
        log.info('cache_hit', { durationMs: Date.now() - startTime })
        return new Response(
          JSON.stringify(cached.payload_json),
          { headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Build ClinicalTrials.gov API v2 query
    const queryParts: string[] = []

    if (drug && drug.trim()) {
      queryParts.push(`AREA[InterventionName]${drug}`)
    }

    if (condition && condition.trim()) {
      queryParts.push(`AREA[Condition]${condition}`)
    }

    if (biomarker && biomarker.trim()) {
      queryParts.push(`AREA[EligibilityCriteria]${biomarker}`)
    }

    const queryString = queryParts.join(' AND ')

    // Helper: build the base API URL with all filters
    function buildApiUrl(pageSize: number, token?: string): URL {
      const apiUrl = new URL('https://clinicaltrials.gov/api/v2/studies')
      apiUrl.searchParams.set('query.term', queryString)
      apiUrl.searchParams.set('pageSize', pageSize.toString())

      if (token) {
        apiUrl.searchParams.set('pageToken', token)
      }

      // Phase filter
      if (phase.length > 0) {
        const phaseMapping: Record<string, string> = {
          '1': 'Phase 1', '2': 'Phase 2', '3': 'Phase 3', '4': 'Phase 4',
          'early_1': 'Early Phase 1', 'na': 'Not Applicable'
        }
        const phaseQueries = phase.map(p => `AREA[Phase]"${phaseMapping[p] || p}"`)
        const currentQuery = apiUrl.searchParams.get('query.term') || ''
        const phaseFilter = phaseQueries.length > 1 ? `(${phaseQueries.join(' OR ')})` : phaseQueries[0]
        apiUrl.searchParams.set('query.term', `${currentQuery} AND ${phaseFilter}`)
      }

      // Status filter
      if (status.length > 0) {
        const statusMapping: Record<string, string> = {
          'recruiting': 'RECRUITING', 'active_not_recruiting': 'ACTIVE_NOT_RECRUITING',
          'completed': 'COMPLETED', 'terminated': 'TERMINATED', 'withdrawn': 'WITHDRAWN',
          'suspended': 'SUSPENDED', 'not_yet_recruiting': 'NOT_YET_RECRUITING',
          'enrolling_by_invitation': 'ENROLLING_BY_INVITATION'
        }
        apiUrl.searchParams.set('filter.overallStatus', status.map(s => statusMapping[s] || s).join(','))
      }

      if (studyType) {
        apiUrl.searchParams.set('filter.studyType', studyType.toUpperCase())
      }

      if (minDate || maxDate) {
        apiUrl.searchParams.set('filter.lastUpdatePostDate', `${minDate || 'MIN'}:${maxDate || 'MAX'}`)
      }

      apiUrl.searchParams.set('fields', [
        'NCTId', 'BriefTitle', 'OfficialTitle', 'Phase', 'OverallStatus',
        'LeadSponsorName', 'LastUpdatePostDate', 'StartDate', 'CompletionDate',
        'EnrollmentCount', 'Condition', 'InterventionName', 'InterventionType',
        'ArmGroupLabel', 'ArmGroupType', 'ArmGroupDescription', 'ArmGroupInterventionName',
        'PrimaryOutcomeMeasure', 'PrimaryOutcomeTimeFrame', 'SecondaryOutcomeMeasure',
        'SecondaryOutcomeTimeFrame', 'StudyType', 'BriefSummary'
      ].join(','))

      return apiUrl
    }

    // Transform a single study into our Trial format
    function transformStudy(study: any) {
      const protocol = study.protocolSection || {}
      const identification = protocol.identificationModule || {}
      const statusMod = protocol.statusModule || {}
      const sponsor = protocol.sponsorCollaboratorsModule || {}
      const design = protocol.designModule || {}
      const armsModule = protocol.armsInterventionsModule || {}
      const outcomes = protocol.outcomesModule || {}
      const conditions = protocol.conditionsModule || {}
      const description = protocol.descriptionModule || {}

      return {
        nctId: identification.nctId || '',
        briefTitle: identification.briefTitle || '',
        officialTitle: identification.officialTitle || '',
        phase: design.phases?.join(', ') || 'N/A',
        overallStatus: statusMod.overallStatus || 'Unknown',
        leadSponsor: sponsor.leadSponsor?.name || 'Unknown',
        lastUpdatePostDate: statusMod.lastUpdatePostDateStruct?.date || '',
        startDate: statusMod.startDateStruct?.date || '',
        completionDate: statusMod.completionDateStruct?.date || '',
        enrollmentCount: design.enrollmentInfo?.count || null,
        conditions: conditions.conditions || [],
        studyType: design.studyType || '',
        briefSummary: description.briefSummary || '',
        arms: (armsModule.armGroups || []).map((arm: any) => ({
          label: arm.label || '', type: arm.type || '',
          description: arm.description || '', interventions: arm.interventionNames || []
        })),
        interventions: (armsModule.interventions || []).map((int: any) => ({
          name: int.name || '', type: int.type || '', description: int.description || ''
        })),
        primaryOutcomes: (outcomes.primaryOutcomes || []).map((o: any) => ({
          measure: o.measure || '', timeFrame: o.timeFrame || '', description: o.description || ''
        })),
        secondaryOutcomes: (outcomes.secondaryOutcomes || []).map((o: any) => ({
          measure: o.measure || '', timeFrame: o.timeFrame || '', description: o.description || ''
        }))
      }
    }

    // Fetch with pagination: ClinicalTrials.gov API max is 100 per page
    // We fetch in pages of up to 100 until we reach maxResults
    const API_PAGE_SIZE = 100
    const allTrials: any[] = []
    const dataSourceCalls: any[] = []
    let currentToken = pageToken || undefined
    let totalCount = 0
    let nextPageToken: string | undefined = undefined

    const pagesToFetch = Math.ceil(maxResults / API_PAGE_SIZE)
    const MAX_PAGES = 5 // Safety cap: max 500 trials per request

    for (let page = 0; page < Math.min(pagesToFetch, MAX_PAGES); page++) {
      const remaining = maxResults - allTrials.length
      const thisPageSize = Math.min(remaining, API_PAGE_SIZE)

      const apiUrl = buildApiUrl(thisPageSize, currentToken)
      log.info('ct_gov_fetch', { page: page + 1, pageSize: thisPageSize })

      const response = await fetchWithTimeout(apiUrl.toString(), {
        headers: { 'Accept': 'application/json' },
        timeoutMs: CT_GOV_TIMEOUT_MS,
      })

      if (!response.ok) {
        log.error('ct_gov_api_error', { status: response.status })
        throw new Error(`ClinicalTrials.gov API error: ${response.status}`)
      }

      const data = await response.json()
      totalCount = data.totalCount || totalCount

      dataSourceCalls.push({
        source: 'ClinicalTrials.gov API v2',
        url: apiUrl.toString(),
        timestamp: new Date().toISOString(),
        resultCount: (data.studies || []).length,
        page: page + 1
      })

      const pageTrials = (data.studies || []).map(transformStudy)
      allTrials.push(...pageTrials)

      // Check if there are more pages
      if (data.nextPageToken && allTrials.length < maxResults) {
        currentToken = data.nextPageToken
      } else {
        // Save nextPageToken for client-side "load more"
        nextPageToken = data.nextPageToken || undefined
        break
      }
    }

    // Fallback: if API returned totalCount=0 but we have trials, use actual count
    if (totalCount === 0 && allTrials.length > 0) {
      totalCount = allTrials.length
    }

    const result = {
      totalCount,
      trials: allTrials,
      nextPageToken: nextPageToken || null,
      trace: {
        query: { drug, condition, biomarker, phase, status, studyType, minDate, maxDate, maxResults, searchMode },
        timestamp: new Date().toISOString(),
        traceId,
        searchMode,
        dataSourceCalls,
        pagesLoaded: dataSourceCalls.length
      }
    }

    // Log the search (fire-and-forget, don't block response)
    supabase.from('searches').insert({
      drug: drug || null,
      indication: condition || null,
      biomarker: biomarker || null,
      filters_json: { phase, status, studyType, minDate, maxDate, maxResults, searchMode }
    }).then(() => {})

    // Cache the result
    await supabase.from('trial_cache').upsert({
      cache_key: cacheKey,
      payload_json: result,
      fetched_at: new Date().toISOString(),
      ttl_hours: 24
    }, { onConflict: 'cache_key' })

    log.info('search_complete', { totalCount, trialsReturned: allTrials.length, durationMs: Date.now() - startTime })

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    // Distinguish timeout from other errors
    if (error instanceof Error && error.name === 'AbortError') {
      log.error('ct_gov_timeout', { durationMs: Date.now() - startTime })
      return buildErrorResponse(error, {
        status: 504,
        publicMessage: 'ClinicalTrials.gov request timed out. Please try again.',
        errorCode: 'UPSTREAM_TIMEOUT',
        corsHeaders,
        log,
        context: 'ct_gov_timeout',
      })
    }

    return buildErrorResponse(error, {
      status: 500,
      corsHeaders,
      log,
      context: 'search_error',
    })
  }
})
