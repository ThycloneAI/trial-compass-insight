import { useState } from "react";
import { BookOpen, ExternalLink, Search, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Publication, PubMedResult, searchPubMed, exportToCSV, exportToJSON } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PublicationsTabProps {
  nctId: string;
}

export function PublicationsTab({ nctId }: PublicationsTabProps) {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<PubMedResult['trace'] | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await searchPubMed(nctId);
      setPublications(result.publications);
      setTrace(result.trace);
      setHasSearched(true);
      
      if (result.publications.length === 0) {
        toast({
          title: "No publications found",
          description: `No PubMed articles linked to ${nctId} were found.`,
        });
      } else {
        toast({
          title: "Publications found",
          description: `Found ${result.publications.length} article(s) linked to this trial.`,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to search PubMed');
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || 'Failed to search PubMed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    const data = publications.map((pub) => ({
      PMID: pub.pmid,
      Title: pub.title,
      Authors: pub.authors,
      Journal: pub.journal,
      Year: pub.year,
      Volume: pub.volume || '',
      Issue: pub.issue || '',
      Pages: pub.pages || '',
      DOI: pub.doi || '',
      PubMed_URL: pub.pubmedUrl,
    }));
    exportToCSV(data, `publications_${nctId}`);
  };

  const handleExportJSON = () => {
    exportToJSON(publications, `publications_${nctId}`, trace || undefined);
  };

  if (!hasSearched) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Search for Publications</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Search PubMed for articles linked to this clinical trial ({nctId}).
        </p>
        <Button 
          onClick={handleSearch} 
          disabled={isLoading}
          size="lg"
          className="min-w-[200px]"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Searching PubMed...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find PubMed Articles
            </span>
          )}
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Error</h3>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={handleSearch} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (publications.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Publications Found</h3>
        <p className="text-muted-foreground mb-6">
          No PubMed articles are currently linked to this trial.
        </p>
        <Button onClick={handleSearch} variant="outline">
          Search Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            {publications.length} Publication{publications.length !== 1 ? 's' : ''} Found
          </h3>
          <p className="text-sm text-muted-foreground">
            Articles linked to {nctId} in PubMed
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            Export JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSearch}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Publications list */}
      <div className="space-y-4">
        {publications.map((pub, index) => (
          <Card 
            key={pub.pmid} 
            className="animate-slide-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="secondary">PMID: {pub.pmid}</Badge>
                    {pub.year && <Badge variant="outline">{pub.year}</Badge>}
                    {pub.doi && (
                      <a
                        href={`https://doi.org/${pub.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
                      >
                        DOI: {pub.doi}
                      </a>
                    )}
                  </div>
                  <h4 className="font-semibold text-base mb-2 leading-tight">
                    {pub.title}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-1">
                    {pub.authors}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{pub.journal}</span>
                    {pub.volume && ` ${pub.volume}`}
                    {pub.issue && `(${pub.issue})`}
                    {pub.pages && `: ${pub.pages}`}
                  </p>
                </div>
                <a
                  href={pub.pubmedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    PubMed
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trace info */}
      {trace && (
        <div className="text-xs text-muted-foreground border-t border-border pt-4">
          <p>Search executed at {new Date(trace.timestamp).toLocaleString()}</p>
          <p>
            Data sources: {trace.dataSourceCalls.map((call) => call.source).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
