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

// NCBI rate limiting - max 3 requests per second without API key, 10 with
const NCBI_RATE_LIMIT_MS = 350
const NCBI_TIMEOUT_MS = 20_000 // 20 seconds per NCBI call
let lastNcbiCall = 0

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const timeSinceLastCall = now - lastNcbiCall

  if (timeSinceLastCall < NCBI_RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, NCBI_RATE_LIMIT_MS - timeSinceLastCall))
  }

  lastNcbiCall = Date.now()
  return fetchWithTimeout(url, { timeoutMs: NCBI_TIMEOUT_MS })
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req)
  }

  const traceId = newTraceId()
  const log = createLogger('pubmed-search', traceId)
  const startTime = Date.now()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check rate limit
  const { allowed, headers: rlHeaders } = await checkRateLimit(supabase, req, 'pubmed-search', log)

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

    log.info('pubmed_search_start', { nctId })

    const cacheKey = `pubmed_${nctId}`

    // Check cache
    const { data: cached } = await supabase
      .from('pubmed_cache')
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

    // NCBI E-utilities parameters
    const tool = Deno.env.get('NCBI_TOOL') || 'comparator-endpoint-finder'
    const email = Deno.env.get('NCBI_EMAIL') || 'support@lovable.dev'
    const apiKey = Deno.env.get('NCBI_API_KEY') || ''

    // Step 1: esearch to find PMIDs
    const esearchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi')
    esearchUrl.searchParams.set('db', 'pubmed')
    esearchUrl.searchParams.set('term', `${nctId}[si]`)
    esearchUrl.searchParams.set('retmode', 'json')
    esearchUrl.searchParams.set('retmax', '50')
    esearchUrl.searchParams.set('tool', tool)
    esearchUrl.searchParams.set('email', email)
    if (apiKey) {
      esearchUrl.searchParams.set('api_key', apiKey)
    }

    log.info('ncbi_esearch', { nctId })

    const esearchResponse = await throttledFetch(esearchUrl.toString())

    if (!esearchResponse.ok) {
      log.error('ncbi_esearch_error', { status: esearchResponse.status })
      throw new Error(`PubMed esearch error: ${esearchResponse.status}`)
    }

    const esearchData = await esearchResponse.json()
    const pmids = esearchData.esearchresult?.idlist || []

    if (pmids.length === 0) {
      const result = {
        nctId,
        publications: [],
        totalCount: 0,
        trace: {
          nctId,
          traceId,
          timestamp: new Date().toISOString(),
          dataSourceCalls: [{
            source: 'NCBI E-utilities esearch',
            url: esearchUrl.toString().replace(apiKey || 'NOKEY', 'REDACTED'),
            timestamp: new Date().toISOString(),
            resultCount: 0
          }]
        }
      }

      await supabase.from('pubmed_cache').upsert({
        cache_key: cacheKey,
        payload_json: result,
        fetched_at: new Date().toISOString(),
        ttl_hours: 24
      }, { onConflict: 'cache_key' })

      log.info('pubmed_search_complete', { nctId, publications: 0, durationMs: Date.now() - startTime })

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: esummary to get article details
    const esummaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi')
    esummaryUrl.searchParams.set('db', 'pubmed')
    esummaryUrl.searchParams.set('id', pmids.join(','))
    esummaryUrl.searchParams.set('retmode', 'json')
    esummaryUrl.searchParams.set('tool', tool)
    esummaryUrl.searchParams.set('email', email)
    if (apiKey) {
      esummaryUrl.searchParams.set('api_key', apiKey)
    }

    const esummaryResponse = await throttledFetch(esummaryUrl.toString())

    if (!esummaryResponse.ok) {
      log.error('ncbi_esummary_error', { status: esummaryResponse.status })
      throw new Error(`PubMed esummary error: ${esummaryResponse.status}`)
    }

    const esummaryData = await esummaryResponse.json()
    const summaryResult = esummaryData.result || {}

    const publications = pmids.map((pmid: string) => {
      const article = summaryResult[pmid] || {}

      let doi = ''
      const articleIds = article.articleids || []
      for (const idObj of articleIds) {
        if (idObj.idtype === 'doi') {
          doi = idObj.value
          break
        }
      }

      const allAuthors = (article.authors || []).map((a: any) => a.name)
      const authors = allAuthors.slice(0, 5)
      const authorString = allAuthors.length > 5
        ? `${authors.join(', ')}, et al.`
        : authors.join(', ')

      const pubDate = article.pubdate || ''
      const yearMatch = pubDate.match(/\d{4}/)
      const year = yearMatch ? yearMatch[0] : ''

      return {
        pmid,
        title: article.title || '',
        authors: authorString,
        journal: article.fulljournalname || article.source || '',
        year,
        volume: article.volume || '',
        issue: article.issue || '',
        pages: article.pages || '',
        doi,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      }
    })

    const result = {
      nctId,
      publications,
      totalCount: publications.length,
      trace: {
        nctId,
        traceId,
        timestamp: new Date().toISOString(),
        dataSourceCalls: [
          {
            source: 'NCBI E-utilities esearch',
            url: esearchUrl.toString().replace(apiKey || 'NOKEY', 'REDACTED'),
            timestamp: new Date().toISOString(),
            resultCount: pmids.length
          },
          {
            source: 'NCBI E-utilities esummary',
            url: esummaryUrl.toString().replace(apiKey || 'NOKEY', 'REDACTED'),
            timestamp: new Date().toISOString(),
            resultCount: publications.length
          }
        ]
      }
    }

    await supabase.from('pubmed_cache').upsert({
      cache_key: cacheKey,
      payload_json: result,
      fetched_at: new Date().toISOString(),
      ttl_hours: 24
    }, { onConflict: 'cache_key' })

    log.info('pubmed_search_complete', { nctId, publications: publications.length, durationMs: Date.now() - startTime })

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return buildErrorResponse(error, {
        status: 504,
        publicMessage: 'PubMed request timed out. Please try again.',
        errorCode: 'UPSTREAM_TIMEOUT',
        corsHeaders,
        log,
        context: 'ncbi_timeout',
      })
    }

    return buildErrorResponse(error, {
      status: 500,
      corsHeaders,
      log,
      context: 'pubmed_search_error',
    })
  }
})
