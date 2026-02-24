import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Users,
  Building2,
  MapPin,
  FileSpreadsheet,
  FileJson,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ComparatorTab } from "@/components/ComparatorTab";
import { EndpointsTab } from "@/components/EndpointsTab";
import { PublicationsTab } from "@/components/PublicationsTab";
import { PicoQuickReading } from "@/components/PicoQuickReading";
import { getTrialDetail, TrialDetail as TrialDetailType, exportToCSV, exportToJSON, generatePicoSummary } from "@/lib/api";
import { analyzeSingleTrialPico, PicoAnalysis } from "@/lib/picoAnalysis";
import { generateTrialPdfReport } from "@/lib/pdfReport";
import { useToast } from "@/hooks/use-toast";

function getStatusVariant(status: string): "recruiting" | "completed" | "terminated" | "active" | "default" {
  const normalizedStatus = status.toLowerCase().replace(/_/g, " ");

  if (normalizedStatus.includes("recruiting") && !normalizedStatus.includes("not")) {
    return "recruiting";
  }
  if (normalizedStatus.includes("completed")) {
    return "completed";
  }
  if (normalizedStatus.includes("terminated") || normalizedStatus.includes("withdrawn")) {
    return "terminated";
  }
  if (normalizedStatus.includes("active")) {
    return "active";
  }
  return "default";
}

function getPhaseVariant(phase: string): "phase1" | "phase2" | "phase3" | "phase4" | "secondary" {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("phase 1") || normalizedPhase.includes("phase1")) {
    return "phase1";
  }
  if (normalizedPhase.includes("phase 2") || normalizedPhase.includes("phase2")) {
    return "phase2";
  }
  if (normalizedPhase.includes("phase 3") || normalizedPhase.includes("phase3")) {
    return "phase3";
  }
  if (normalizedPhase.includes("phase 4") || normalizedPhase.includes("phase4")) {
    return "phase4";
  }
  return "secondary";
}

function formatDate(dateString: string): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export default function TrialDetailPage() {
  const { nctId } = useParams<{ nctId: string }>();
  const [trial, setTrial] = useState<TrialDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picoAnalysis, setPicoAnalysis] = useState<PicoAnalysis | null>(null);
  const [picoNarrative, setPicoNarrative] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!nctId) return;

    const fetchTrial = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getTrialDetail(nctId);
        setTrial(data);
        
        // Calculate PICO analysis
        const analysis = analyzeSingleTrialPico(data);
        setPicoAnalysis(analysis);
      } catch (err: any) {
        setError(err.message || "Failed to fetch trial details");
        toast({
          variant: "destructive",
          title: "Error",
          description: err.message || "Failed to fetch trial details",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrial();
  }, [nctId, toast]);

  const handleGenerateNarrative = async (mode: 'basic' | 'advanced'): Promise<string> => {
    if (!picoAnalysis || !trial) {
      throw new Error("No hay datos suficientes para generar el resumen");
    }

    const result = await generatePicoSummary({
      mode,
      analysis: picoAnalysis,
      drugName: trial.conditions?.[0],
    });

    setPicoNarrative(result.summaryText);
    return result.summaryText;
  };

  const handleExportPdf = () => {
    if (!trial) return;
    generateTrialPdfReport({
      trial,
      picoAnalysis,
      picoNarrative: picoNarrative || undefined,
    });
    toast({
      title: "PDF generated",
      description: `Report saved as TrialCompass_${trial.nctId}_Report.pdf`,
    });
  };

  const handleExportComparatorsCSV = () => {
    if (!trial) return;
    const data = trial.arms?.map((arm) => ({
      Label: arm.label,
      Type: arm.type,
      Is_Control: arm.isControl ? "Yes" : "No",
      Control_Type: arm.controlType || "",
      Interventions: arm.interventions?.join("; ") || "",
      Description: arm.description,
    })) || [];
    exportToCSV(data, `comparators_${nctId}`);
  };

  const handleExportEndpointsCSV = () => {
    if (!trial) return;
    const primaryData = trial.primaryOutcomes?.map((o) => ({
      Type: "Primary",
      Classification: o.classification || "Other",
      Measure: o.measure,
      Timeframe: o.timeFrame,
      Description: o.description || "",
    })) || [];
    const secondaryData = trial.secondaryOutcomes?.map((o) => ({
      Type: "Secondary",
      Classification: o.classification || "Other",
      Measure: o.measure,
      Timeframe: o.timeFrame,
      Description: o.description || "",
    })) || [];
    exportToCSV([...primaryData, ...secondaryData], `endpoints_${nctId}`);
  };

  const handleExportJSON = () => {
    if (!trial) return;
    exportToJSON(trial, `trial_${nctId}`, trial.trace);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="container py-12 flex flex-col items-center justify-center flex-1">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading trial details...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !trial) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="container py-12 flex-1">
          <Link to="/">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Search
            </Button>
          </Link>
          <div className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Error Loading Trial</h2>
            <p className="text-muted-foreground mb-6">{error || "Trial not found"}</p>
            <Link to="/">
              <Button>Return to Search</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="container py-8 flex-1">
        {/* Back navigation */}
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </Link>

        {/* Trial Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={getPhaseVariant(trial.phase)}>{trial.phase || "N/A"}</Badge>
              <Badge variant={getStatusVariant(trial.overallStatus)}>
                {trial.overallStatus.replace(/_/g, " ")}
              </Badge>
              {trial.studyType && <Badge variant="outline">{trial.studyType}</Badge>}
            </div>
            <a
              href={`https://clinicaltrials.gov/study/${trial.nctId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-accent hover:underline font-mono"
            >
              {trial.nctId}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold mb-4">{trial.briefTitle}</h1>

          {trial.officialTitle && trial.officialTitle !== trial.briefTitle && (
            <p className="text-muted-foreground mb-4">{trial.officialTitle}</p>
          )}

          {/* Meta info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate" title={trial.leadSponsor}>
                {trial.leadSponsor}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Updated {formatDate(trial.lastUpdatePostDate)}</span>
            </div>
            {trial.enrollmentCount && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                <span>
                  {trial.enrollmentCount.toLocaleString()} {trial.enrollmentType || "enrolled"}
                </span>
              </div>
            )}
            {trial.locations && trial.locations.length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>
                  {trial.locations.length} location{trial.locations.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Conditions */}
          {trial.conditions && trial.conditions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {trial.conditions.map((condition, i) => (
                <Badge key={i} variant="outline">
                  {condition}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap gap-2 mb-8">
          <Button size="sm" onClick={handleExportPdf} className="gap-2">
            <FileText className="h-4 w-4" />
            Export PDF Report
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportComparatorsCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Comparators CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportEndpointsCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Endpoints CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            <FileJson className="h-4 w-4 mr-2" />
            Export Full JSON
          </Button>
        </div>

        {/* PICO Quick Reading - Primary view */}
        {picoAnalysis && (
          <div className="mb-8 animate-fade-in">
            <PicoQuickReading
              analysis={picoAnalysis}
              onGenerateNarrative={handleGenerateNarrative}
              showDetailToggle={true}
              isDetailOpen={isDetailOpen}
              onDetailToggle={() => setIsDetailOpen(!isDetailOpen)}
            />
          </div>
        )}

        {/* Technical Detail - Secondary level */}
        <Collapsible open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <CollapsibleContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground text-center italic border-b border-border pb-4">
                Detalle técnico subyacente a la lectura PICO rápida
              </p>
              
              <Tabs defaultValue="comparators" className="animate-fade-in">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="comparators">Comparadores</TabsTrigger>
                  <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
                  <TabsTrigger value="publications">Publicaciones</TabsTrigger>
                </TabsList>

                <TabsContent value="comparators">
                  <ComparatorTab
                    arms={trial.arms || []}
                    interventions={trial.interventions || []}
                    comparatorSummary={trial.comparatorSummary}
                    nctId={trial.nctId}
                    phase={trial.phase}
                  />
                </TabsContent>

                <TabsContent value="endpoints">
                  <EndpointsTab
                    primaryOutcomes={trial.primaryOutcomes || []}
                    secondaryOutcomes={trial.secondaryOutcomes || []}
                  />
                </TabsContent>

                <TabsContent value="publications">
                  <PublicationsTab nctId={trial.nctId} />
                </TabsContent>
              </Tabs>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Additional Info */}
        {trial.briefSummary && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-base">Brief Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {trial.briefSummary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Trace info */}
        {trial.trace && (
          <div className="text-xs text-muted-foreground border-t border-border pt-4 mt-8">
            <p>Data fetched at {new Date(trial.trace.timestamp).toLocaleString()}</p>
            <p>Source: {trial.trace.dataSourceCalls.map((call) => call.source).join(", ")}</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
