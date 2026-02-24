import { useState, useRef } from "react";
import { Search, Database, FileSpreadsheet, FlaskConical } from "lucide-react";
import { SearchForm } from "@/components/SearchForm";
import { TrialResultsList } from "@/components/TrialResultsList";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { searchTrials, searchTrialsNextPage, SearchParams, SearchResult } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastSearchParams = useRef<SearchParams | null>(null);
  const { toast } = useToast();

  const handleSearch = async (params: SearchParams) => {
    setIsLoading(true);
    lastSearchParams.current = params;

    try {
      const data = await searchTrials(params);
      setResults(data);

      if (data.trials.length === 0) {
        toast({
          title: "No results found",
          description: "Try adjusting your search criteria.",
        });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        variant: "destructive",
        title: "Search failed",
        description: error.message || "An error occurred while searching trials.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!results?.nextPageToken || !lastSearchParams.current) return;
    setIsLoadingMore(true);

    try {
      const moreData = await searchTrialsNextPage(lastSearchParams.current, results.nextPageToken);
      setResults(prev => {
        if (!prev) return moreData;
        return {
          totalCount: prev.totalCount,
          trials: [...prev.trials, ...moreData.trials],
          nextPageToken: moreData.nextPageToken,
          trace: {
            ...prev.trace,
            dataSourceCalls: [
              ...prev.trace.dataSourceCalls,
              ...moreData.trace.dataSourceCalls,
            ],
          },
        };
      });
    } catch (error: any) {
      console.error('Load more error:', error);
      toast({
        variant: "destructive",
        title: "Failed to load more",
        description: error.message || "An error occurred loading more trials.",
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="container py-8 flex-1">
        {/* Hero Section */}
        {!results && (
          <div className="mb-12 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
              <FlaskConical className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              Clinical Trial Comparator IA powered
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Search interventional clinical trials and analyze comparators and endpoints
              for HTA/regulatory research purposes.
            </p>
            
            {/* Feature highlights */}
            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-12">
              <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                <Search className="h-8 w-8 text-accent mb-2" />
                <h3 className="font-semibold mb-1">Smart Search</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Query ClinicalTrials.gov by drug, condition, or both
                </p>
              </div>
              <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                <Database className="h-8 w-8 text-accent mb-2" />
                <h3 className="font-semibold mb-1">Rich Analysis</h3>
                <p className="text-sm text-muted-foreground text-center">
                  View comparator arms and classified endpoints
                </p>
              </div>
              <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                <FileSpreadsheet className="h-8 w-8 text-accent mb-2" />
                <h3 className="font-semibold mb-1">Export Data</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Download CSV/JSON with full audit trace
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search Form */}
        <div className="glass-card rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Clinical Trials
          </h2>
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {/* Results */}
        {results && (
          <div className="animate-fade-in">
            <TrialResultsList
              trials={results.trials}
              totalCount={results.totalCount}
              trace={results.trace}
              nextPageToken={results.nextPageToken}
              onLoadMore={handleLoadMore}
              isLoadingMore={isLoadingMore}
            />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Index;
