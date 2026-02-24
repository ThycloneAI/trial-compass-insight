-- Create searches table to log search queries
CREATE TABLE public.searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  drug TEXT NOT NULL,
  indication TEXT,
  biomarker TEXT,
  filters_json JSONB DEFAULT '{}'::jsonb
);

-- Create trial_cache table for caching ClinicalTrials.gov responses
CREATE TABLE public.trial_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ttl_hours INTEGER NOT NULL DEFAULT 24
);

-- Create pubmed_cache table for caching PubMed responses
CREATE TABLE public.pubmed_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ttl_hours INTEGER NOT NULL DEFAULT 24
);

-- Create indexes for cache lookups
CREATE INDEX idx_trial_cache_key ON public.trial_cache(cache_key);
CREATE INDEX idx_trial_cache_fetched ON public.trial_cache(fetched_at);
CREATE INDEX idx_pubmed_cache_key ON public.pubmed_cache(cache_key);
CREATE INDEX idx_pubmed_cache_fetched ON public.pubmed_cache(fetched_at);
CREATE INDEX idx_searches_created ON public.searches(created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pubmed_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for searches (no auth required for MVP)
CREATE POLICY "Allow public insert on searches" ON public.searches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on searches" ON public.searches FOR SELECT USING (true);

-- Allow public read/write for cache tables (used by edge functions)
CREATE POLICY "Allow public operations on trial_cache" ON public.trial_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on pubmed_cache" ON public.pubmed_cache FOR ALL USING (true) WITH CHECK (true);