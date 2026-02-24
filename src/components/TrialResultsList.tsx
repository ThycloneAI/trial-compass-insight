import { Download, FileJson, FileSpreadsheet, Pill, Stethoscope, Layers, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrialCard } from "@/components/TrialCard";
import { Trial, TraceInfo, SearchMode, exportToCSV, exportToJSON } from "@/lib/api";
import { ExternalAIAnalysisDrawer } from "@/components/ExternalAIAnalysisDrawer";
import { ConditionOnlySummary } from "@/components/ConditionOnlySummary";

interface TrialResultsListProps {
  trials: Trial[];
  totalCount: number;
  trace: TraceInfo;
  nextPageToken?: string | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function getSearchModeBadge(searchMode?: SearchMode) {
  switch (searchMode) {
    case "drug":
      return (
        <Badge variant="outline" className="gap-1.5">
          <Pill className="h-3 w-3" />
          Drug Search
        </Badge>
      );
    case "condition":
      return (
        <Badge variant="outline" className="gap-1.5">
          <Stethoscope className="h-3 w-3" />
          Condition Search
        </Badge>
      );
    case "combined":
    default:
      return (
        <Badge variant="outline" className="gap-1.5">
          <Layers className="h-3 w-3" />
          Combined Search
        </Badge>
      );
  }
}

export function TrialResultsList({ trials, totalCount, trace, nextPageToken, onLoadMore, isLoadingMore }: TrialResultsListProps) {
  const searchMode = trace.searchMode || (trace.query?.searchMode as SearchMode) || "combined";
  const isConditionOnly = searchMode === "condition" && !trace.query?.drug;

  const handleExportCSV = () => {
    const data = trials.map((trial) => ({
      NCT_ID: trial.nctId,
      Title: trial.briefTitle,
      Phase: trial.phase,
      Status: trial.overallStatus,
      Sponsor: trial.leadSponsor,
      Conditions: trial.conditions?.join('; ') || '',
      Last_Updated: trial.lastUpdatePostDate,
      Enrollment: trial.enrollmentCount || '',
      Study_Type: trial.studyType || '',
      Search_Mode: searchMode,
      Query_Drug: trace.query?.drug || '',
      Query_Condition: trace.query?.condition || '',
      Query_Biomarker: trace.query?.biomarker || '',
    }));
    exportToCSV(data, `trials_search_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportJSON = () => {
    exportToJSON(trials, `trials_search_${new Date().toISOString().split('T')[0]}`, trace);
  };

  const getJsonPayload = () => ({
    data: trials,
    trace: trace || {
      timestamp: new Date().toISOString(),
      dataSourceCalls: [],
      searchMode
    }
  });

  if (trials.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg text-muted-foreground">No trials found matching your criteria.</p>
        <p className="text-sm text-muted-foreground mt-2">Try adjusting your search terms or filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with count, search mode badge, and exports */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">
              {totalCount.toLocaleString()} Trial{totalCount !== 1 ? 's' : ''} Found
            </h2>
            {getSearchModeBadge(searchMode)}
          </div>
          <p className="text-sm text-muted-foreground">
            Showing {trials.length} results
            {trace.query?.drug && <span> • Drug: <strong>{trace.query.drug}</strong></span>}
            {trace.query?.condition && <span> • Condition: <strong>{trace.query.condition}</strong></span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            <FileJson className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <ExternalAIAnalysisDrawer 
            source="trial_json" 
            getPayload={getJsonPayload}
            disabled={trials.length === 0}
          />
        </div>
      </div>

      {/* Condition-only summary panel */}
      {isConditionOnly && trials.length > 0 && (
        <ConditionOnlySummary trials={trials} />
      )}

      {/* Trial cards grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {trials.map((trial, index) => (
          <div
            key={trial.nctId}
            style={{ animationDelay: `${index * 50}ms` }}
            className="animate-slide-up"
          >
            <TrialCard trial={trial} highlightCondition={isConditionOnly} />
          </div>
        ))}
      </div>

      {/* Load more button */}
      {nextPageToken && onLoadMore && (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-sm text-muted-foreground">
            Showing {trials.length} of {totalCount.toLocaleString()} trials
          </p>
          <Button
            variant="outline"
            size="lg"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="min-w-[200px]"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading more...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ChevronDown className="h-4 w-4" />
                Load more trials
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Trace info footer */}
      <div className="text-xs text-muted-foreground border-t border-border pt-4 mt-8">
        <p>Query executed at {new Date(trace.timestamp).toLocaleString()}</p>
        <p>
          Data source: {trace.dataSourceCalls.map((call) => call.source).join(', ')}
        </p>
        <p>Search mode: {searchMode}</p>
      </div>
    </div>
  );
}
