import { supabase } from "@/integrations/supabase/client";

export type SearchMode = "drug" | "condition" | "combined";

export interface Trial {
  nctId: string;
  briefTitle: string;
  officialTitle?: string;
  phase: string;
  overallStatus: string;
  leadSponsor: string;
  lastUpdatePostDate: string;
  startDate?: string;
  completionDate?: string;
  enrollmentCount?: number;
  conditions: string[];
  studyType?: string;
  briefSummary?: string;
  arms?: Arm[];
  interventions?: Intervention[];
  primaryOutcomes?: Outcome[];
  secondaryOutcomes?: Outcome[];
}

export interface Arm {
  label: string;
  type: string;
  description: string;
  interventions: string[];
  isControl?: boolean;
  controlType?: string;
}

export interface Intervention {
  name: string;
  type: string;
  description: string;
  armGroupLabels?: string[];
}

export interface Outcome {
  measure: string;
  timeFrame: string;
  description?: string;
  classification?: string;
}

export interface TrialDetail extends Trial {
  collaborators?: string[];
  enrollmentType?: string;
  keywords?: string[];
  detailedDescription?: string;
  eligibilityCriteria?: string;
  healthyVolunteers?: boolean;
  sex?: string;
  minimumAge?: string;
  maximumAge?: string;
  comparatorSummary?: string;
  locations?: Location[];
  trace?: TraceInfo;
}

export interface Location {
  facility: string;
  city: string;
  state: string;
  country: string;
  status: string;
}

export interface Publication {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  pubmedUrl: string;
}

export interface TraceInfo {
  query?: Record<string, any>;
  nctId?: string;
  timestamp: string;
  dataSourceCalls: DataSourceCall[];
  searchMode?: SearchMode;
}

export interface DataSourceCall {
  source: string;
  url: string;
  timestamp: string;
  resultCount?: number;
}

export interface SearchParams {
  drug?: string;
  condition?: string;
  biomarker?: string;
  phase?: string[];
  status?: string[];
  studyType?: string;
  minDate?: string;
  maxDate?: string;
  maxResults?: number;
  searchMode?: SearchMode;
}

export interface SearchResult {
  totalCount: number;
  trials: Trial[];
  nextPageToken?: string | null;
  trace: TraceInfo;
}

export interface PubMedResult {
  nctId: string;
  publications: Publication[];
  totalCount: number;
  trace: TraceInfo;
}

export interface ComparatorSummaryStats {
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

export interface ComparatorSummaryRequest {
  mode: 'basic' | 'advanced';
  trials: {
    nctId: string;
    phase: string;
    arms: {
      label: string;
      interventions: string[];
      controlType?: string;
    }[];
  }[];
}

export interface ComparatorSummaryResult {
  summaryText: string;
  stats: ComparatorSummaryStats;
  mode: 'basic' | 'advanced';
}

export async function searchTrials(params: SearchParams): Promise<SearchResult> {
  const queryParams = new URLSearchParams();
  
  // Only add drug if provided
  if (params.drug) queryParams.set('drug', params.drug);
  if (params.condition) queryParams.set('condition', params.condition);
  if (params.biomarker) queryParams.set('biomarker', params.biomarker);
  if (params.studyType) queryParams.set('studyType', params.studyType);
  if (params.minDate) queryParams.set('minDate', params.minDate);
  if (params.maxDate) queryParams.set('maxDate', params.maxDate);
  if (params.maxResults) queryParams.set('maxResults', params.maxResults.toString());
  if (params.searchMode) queryParams.set('searchMode', params.searchMode);
  
  params.phase?.forEach(p => queryParams.append('phase', p));
  params.status?.forEach(s => queryParams.append('status', s));

  // Use direct fetch since we need query params
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trials-search?${queryParams.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to search trials');
  }

  return response.json();
}

export async function searchTrialsNextPage(params: SearchParams, pageToken: string): Promise<SearchResult> {
  const queryParams = new URLSearchParams();

  if (params.drug) queryParams.set('drug', params.drug);
  if (params.condition) queryParams.set('condition', params.condition);
  if (params.biomarker) queryParams.set('biomarker', params.biomarker);
  if (params.studyType) queryParams.set('studyType', params.studyType);
  if (params.minDate) queryParams.set('minDate', params.minDate);
  if (params.maxDate) queryParams.set('maxDate', params.maxDate);
  if (params.maxResults) queryParams.set('maxResults', params.maxResults.toString());
  if (params.searchMode) queryParams.set('searchMode', params.searchMode);
  queryParams.set('pageToken', pageToken);

  params.phase?.forEach(p => queryParams.append('phase', p));
  params.status?.forEach(s => queryParams.append('status', s));

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trials-search?${queryParams.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to load more trials');
  }

  return response.json();
}

export async function getTrialDetail(nctId: string): Promise<TrialDetail> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trial-detail?nctId=${encodeURIComponent(nctId)}`,
    {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get trial details');
  }

  return response.json();
}

export async function searchPubMed(nctId: string): Promise<PubMedResult> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pubmed-search?nctId=${encodeURIComponent(nctId)}`,
    {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to search PubMed');
  }

  return response.json();
}

export function exportToCSV(data: Record<string, any>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportToJSON(data: any, filename: string, trace?: TraceInfo): void {
  const exportData = {
    data,
    trace: trace || {
      timestamp: new Date().toISOString(),
      dataSourceCalls: []
    }
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function generateComparatorSummary(
  request: ComparatorSummaryRequest
): Promise<ComparatorSummaryResult> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comparator-summary`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate comparator summary');
  }

  return response.json();
}

export interface PicoSummaryRequest {
  mode: 'basic' | 'advanced';
  analysis: {
    comparator: any;
    endpoint: any;
    totalTrials: number;
  };
  drugName?: string;
  indication?: string;
}

export async function generatePicoSummary(request: PicoSummaryRequest): Promise<{ summaryText: string }> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pico-summary`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate PICO summary');
  }

  return response.json();
}

// External AI Analysis types and functions
export interface ExternalAIAnalysisRequest {
  source: 'pubmed_json' | 'trial_json' | 'custom';
  mode: 'basic' | 'advanced';
  payload: any;
  user_instructions?: string;
}

export interface ExternalAIAnalysisResult {
  analysisText: string;
  analysisJson?: any;
  aiName?: string;
  model?: string;
  cached?: boolean;
  cachedAt?: string;
  userInstructionsUsed?: string | null;
  trace: {
    calledAt: string;
    endpoint: string;
    status: number;
    durationMs: number;
  };
}

export async function checkExternalAIConfigured(): Promise<{ configured: boolean; aiName?: string; model?: string }> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-ai-analyze`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config_check: true }),
      }
    );
    
    const data = await response.json();
    return {
      configured: data.configured === true,
      aiName: data.aiName,
      model: data.model
    };
  } catch {
    return { configured: false };
  }
}

export async function analyzeWithExternalAI(
  request: ExternalAIAnalysisRequest
): Promise<ExternalAIAnalysisResult> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-ai-analyze`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    // Enhanced error with status and source
    const error = new Error(data.message || data.error || 'Failed to analyze with external AI') as any;
    error.status = response.status;
    error.errorSource = data.errorSource || 'unknown';
    error.externalErrorSnippet = data.externalErrorSnippet;
    throw error;
  }

  return data;
}
