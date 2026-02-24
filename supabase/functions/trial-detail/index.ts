import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

const CT_GOV_TIMEOUT_MS = 30_000 // 30 seconds

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req)
  }

  const traceId = newTraceId()
  const log = createLogger('trial-detail', traceId)
  const startTime = Date.now()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check rate limit
  const { allowed, headers: rlHeaders } = await checkRateLimit(supabase, req, 'trial-detail', log)

  if (!allowed) {
    return buildRateLimitResponse(corsHeaders, rlHeaders)
  }

  try {
    const url = new URL(req.url)
    const nctId = url.searchParams.get('nctId')

    if (!nctId) {
      return buildValidationErrorResponse('nctId parameter is required', corsHeaders, log)
    }

    // Validate NCT ID format
    if (!/^NCT\d{8}$/.test(nctId)) {
      return buildValidationErrorResponse('Invalid NCT ID format. Expected NCTxxxxxxxx.', corsHeaders, log)
    }

    log.info('detail_start', { nctId })

    const cacheKey = `trial_detail_${nctId}`

    // Check cache
    const { data: cached } = await supabase
      .from('trial_cache')
      .select('payload_json, fetched_at, ttl_hours')
      .eq('cache_key', cacheKey)
      .single()

    if (cached) {
      const fetchedAt = new Date(cached.fetched_at)
      const ttlMs = cached.ttl_hours * 60 * 60 * 1000
      if (Date.now() - fetchedAt.getTime() < ttlMs) {
        log.info('cache_hit', { nctId, durationMs: Date.now() - startTime })
        return new Response(
          JSON.stringify(cached.payload_json),
          { headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Fetch from ClinicalTrials.gov
    const apiUrl = `https://clinicaltrials.gov/api/v2/studies/${nctId}`

    log.info('ct_gov_fetch', { nctId })

    const response = await fetchWithTimeout(apiUrl, {
      headers: { 'Accept': 'application/json' },
      timeoutMs: CT_GOV_TIMEOUT_MS,
    })

    if (!response.ok) {
      if (response.status === 404) {
        log.warn('trial_not_found', { nctId })
        return buildErrorResponse(new Error('Not found'), {
          status: 404,
          publicMessage: `Trial ${nctId} not found`,
          errorCode: 'TRIAL_NOT_FOUND',
          corsHeaders,
          log,
        })
      }
      log.error('ct_gov_api_error', { nctId, status: response.status })
      throw new Error(`ClinicalTrials.gov API error: ${response.status}`)
    }

    const study = await response.json()
    const protocol = study.protocolSection || {}
    const identification = protocol.identificationModule || {}
    const status = protocol.statusModule || {}
    const sponsor = protocol.sponsorCollaboratorsModule || {}
    const design = protocol.designModule || {}
    const arms = protocol.armsInterventionsModule || {}
    const outcomes = protocol.outcomesModule || {}
    const conditions = protocol.conditionsModule || {}
    const description = protocol.descriptionModule || {}
    const eligibility = protocol.eligibilityModule || {}
    const contacts = protocol.contactsLocationsModule || {}

    // Process arms and interventions for comparator analysis
    const armGroups = (arms.armGroups || []).map((arm: any) => {
      const armType = arm.type?.toLowerCase() || ''
      let controlType = null

      if (armType.includes('placebo')) {
        controlType = 'Placebo'
      } else if (armType.includes('sham')) {
        controlType = 'Sham'
      } else if (armType.includes('no intervention') || armType.includes('no_intervention')) {
        controlType = 'No Intervention'
      } else if (armType.includes('active_comparator') || armType.includes('active comparator')) {
        controlType = 'Active Comparator'
      } else if (armType.includes('experimental')) {
        controlType = 'Experimental'
      }

      // Check description and label for control type hints
      const desc = (arm.description || '').toLowerCase()
      const label = (arm.label || '').toLowerCase()
      const textToCheck = `${desc} ${label}`
      if (!controlType) {
        if (textToCheck.includes('placebo')) controlType = 'Placebo'
        else if (textToCheck.includes('standard of care') || textToCheck.includes('soc') ||
                 textToCheck.includes('best supportive care') || textToCheck.includes('best available therapy') ||
                 textToCheck.includes('usual care') || textToCheck.includes('routine care') ||
                 textToCheck.includes("investigator's choice") || textToCheck.includes("physician's choice") ||
                 textToCheck.includes('standard treatment') || textToCheck.includes('standard therapy') ||
                 textToCheck.includes('current standard')) controlType = 'Standard of Care'
        else if (textToCheck.includes('active comparator') || textToCheck.includes('active control')) controlType = 'Active Comparator'
      }

      return {
        label: arm.label || '',
        type: arm.type || '',
        description: arm.description || '',
        interventions: arm.interventionNames || [],
        isControl: armType.includes('comparator') || armType.includes('placebo') || armType.includes('sham') || armType.includes('no_intervention') || armType.includes('no intervention') || armType.includes('control'),
        controlType
      }
    })

    // Classify endpoints — comprehensive HTA-grade classification
    const classifyEndpoint = (measure: string): string => {
      const m = measure.toLowerCase()

      // Hard clinical endpoints
      if (m.includes('overall survival') || m === 'os' || /\bos\b/.test(m)) {
        return 'OS'
      }

      // Progression/disease-free survival family
      if (m.includes('progression-free') || m.includes('progression free') || /\bpfs\b/.test(m)) {
        return 'PFS'
      }
      if (m.includes('disease-free') || m.includes('disease free') || /\bdfs\b/.test(m)) {
        return 'DFS'
      }
      if (m.includes('event-free') || m.includes('event free') || /\befs\b/.test(m)) {
        return 'EFS'
      }
      if (m.includes('relapse-free') || m.includes('relapse free') || m.includes('recurrence-free') || m.includes('recurrence free') || /\brfs\b/.test(m)) {
        return 'RFS'
      }

      // Response rate endpoints
      if (m.includes('objective response') || m.includes('overall response rate') || /\borr\b/.test(m)) {
        return 'ORR'
      }
      if (m.includes('complete response') || m.includes('complete remission') || /\bcr\b/.test(m) || /\bcri\b/.test(m)) {
        return 'CR'
      }
      if (m.includes('pathologic complete') || m.includes('pathological complete') || /\bpcr\b/.test(m)) {
        return 'pCR'
      }
      if (m.includes('clinical benefit') || /\bcbr\b/.test(m)) {
        return 'CBR'
      }
      if (m.includes('disease control') || /\bdcr\b/.test(m)) {
        return 'DCR'
      }

      // Duration/time-to-event endpoints
      if (m.includes('duration of response') || /\bdor\b/.test(m)) {
        return 'DOR'
      }
      if (m.includes('time to progression') || /\bttp\b/.test(m)) {
        return 'TTP'
      }
      if (m.includes('time to treatment failure') || m.includes('time to next treatment') || /\bttf\b/.test(m) || /\bttnt\b/.test(m)) {
        return 'TTF'
      }
      if (m.includes('time to') && !m.includes('time to progression') && !m.includes('time to treatment') && !m.includes('time to next')) {
        return 'TTP'
      }

      // Minimal residual disease
      if (m.includes('minimal residual') || m.includes('measurable residual') || /\bmrd\b/.test(m)) {
        return 'MRD'
      }

      // PRO / QoL — detect by instrument name or general terms
      if (m.includes('quality of life') || m.includes('qol') || m.includes('hrqol') ||
          m.includes('patient reported') || m.includes('patient-reported') || /\bpro\b/.test(m) ||
          m.includes('eortc') || m.includes('qlq') || m.includes('fact-') || m.includes('eq-5d') || m.includes('eq5d') ||
          m.includes('sf-36') || m.includes('sf36') || m.includes('sf-12') ||
          m.includes('promis') || m.includes('euroqol') || m.includes('bpi') || m.includes('brief pain') ||
          m.includes('mdasi') || m.includes('fisi') || m.includes('symptom burden') ||
          m.includes('health utility') || m.includes('global health status')) {
        return 'QoL/PRO'
      }

      // Safety
      if (m.includes('adverse event') || m.includes('safety') || m.includes('toxicity') ||
          m.includes('tolerability') || m.includes('side effect') || m.includes('dose limiting') ||
          m.includes('dose-limiting') || m.includes('maximum tolerated') || m.includes('mtd') ||
          m.includes('teae') || m.includes('treatment-emergent') || m.includes('treatment emergent') ||
          m.includes('incidence of') || m.includes('aesi')) {
        return 'Safety'
      }

      // Biomarker
      if (m.includes('biomarker') || m.includes('marker level') || m.includes('expression') ||
          m.includes('ctdna') || m.includes('circulating tumor') || m.includes('pd-l1') ||
          m.includes('her2') || m.includes('egfr') || m.includes('alk') || m.includes('braf') ||
          m.includes('tmb') || m.includes('tumor mutational') || m.includes('microsatellite')) {
        return 'Biomarker'
      }

      // Pharmacokinetics / Pharmacodynamics
      if (m.includes('pharmacokinetic') || m.includes('pharmacodynamic') || /\bpk\b/.test(m) || /\bpd\b/.test(m) ||
          m.includes('auc') || m.includes('cmax') || m.includes('trough') || m.includes('clearance') ||
          m.includes('half-life') || m.includes('bioavailability')) {
        return 'PK/PD'
      }

      // Resource use / Health economics
      if (m.includes('cost') || m.includes('resource') || m.includes('hospitalization') || m.includes('hospitalisation') ||
          m.includes('healthcare utilization') || m.includes('healthcare utilisation') || m.includes('length of stay') ||
          m.includes('readmission') || m.includes('emergency department') || m.includes('icu') ||
          m.includes('qaly') || m.includes('icer') || m.includes('cost-effectiveness')) {
        return 'Resource Use'
      }

      return 'Other'
    }

    const primaryOutcomes = (outcomes.primaryOutcomes || []).map((o: any) => ({
      measure: o.measure || '',
      timeFrame: o.timeFrame || '',
      description: o.description || '',
      classification: classifyEndpoint(o.measure || '')
    }))

    const secondaryOutcomes = (outcomes.secondaryOutcomes || []).map((o: any) => ({
      measure: o.measure || '',
      timeFrame: o.timeFrame || '',
      description: o.description || '',
      classification: classifyEndpoint(o.measure || '')
    }))

    // Generate comparator summary
    const experimentalArms = armGroups.filter((a: any) => a.type?.toLowerCase().includes('experimental'))
    const controlArms = armGroups.filter((a: any) => a.isControl)

    let comparatorSummary = ''
    if (experimentalArms.length > 0 && controlArms.length > 0) {
      const expInterventions = experimentalArms.flatMap((a: any) => a.interventions).join(' + ')
      const ctrlTypes = controlArms.map((a: any) => a.controlType || a.interventions.join(' + ')).join(', ')
      comparatorSummary = `${expInterventions} vs ${ctrlTypes}`
    } else if (armGroups.length > 0) {
      comparatorSummary = armGroups.map((a: any) => a.label).join(' vs ')
    }

    const result = {
      nctId: identification.nctId || nctId,
      briefTitle: identification.briefTitle || '',
      officialTitle: identification.officialTitle || '',
      phase: design.phases?.join(', ') || 'N/A',
      overallStatus: status.overallStatus || 'Unknown',
      leadSponsor: sponsor.leadSponsor?.name || 'Unknown',
      collaborators: (sponsor.collaborators || []).map((c: any) => c.name),
      lastUpdatePostDate: status.lastUpdatePostDateStruct?.date || '',
      startDate: status.startDateStruct?.date || '',
      completionDate: status.completionDateStruct?.date || '',
      enrollmentCount: design.enrollmentInfo?.count || null,
      enrollmentType: design.enrollmentInfo?.type || '',
      conditions: conditions.conditions || [],
      keywords: conditions.keywords || [],
      studyType: design.studyType || '',
      briefSummary: description.briefSummary || '',
      detailedDescription: description.detailedDescription || '',
      eligibilityCriteria: eligibility.eligibilityCriteria || '',
      healthyVolunteers: eligibility.healthyVolunteers || false,
      sex: eligibility.sex || '',
      minimumAge: eligibility.minimumAge || '',
      maximumAge: eligibility.maximumAge || '',
      arms: armGroups,
      interventions: (arms.interventions || []).map((int: any) => ({
        name: int.name || '',
        type: int.type || '',
        description: int.description || '',
        armGroupLabels: int.armGroupLabels || []
      })),
      primaryOutcomes,
      secondaryOutcomes,
      comparatorSummary,
      locations: (contacts.locations || []).slice(0, 50).map((loc: any) => ({
        facility: loc.facility || '',
        city: loc.city || '',
        state: loc.state || '',
        country: loc.country || '',
        status: loc.status || ''
      })),
      trace: {
        nctId,
        traceId,
        timestamp: new Date().toISOString(),
        dataSourceCalls: [{
          source: 'ClinicalTrials.gov API v2',
          url: apiUrl,
          timestamp: new Date().toISOString()
        }]
      }
    }

    // Cache the result
    await supabase.from('trial_cache').upsert({
      cache_key: cacheKey,
      payload_json: result,
      fetched_at: new Date().toISOString(),
      ttl_hours: 24
    }, { onConflict: 'cache_key' })

    log.info('detail_complete', { nctId, durationMs: Date.now() - startTime })

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
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
      context: 'detail_error',
    })
  }
})
