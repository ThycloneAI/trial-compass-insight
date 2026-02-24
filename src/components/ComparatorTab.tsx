import { useState } from "react";
import { GitCompare, Shield, Beaker, Pill, Copy, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Arm, Intervention, generateComparatorSummary } from "@/lib/api";
import { toast } from "sonner";

interface ComparatorTabProps {
  arms: Arm[];
  interventions: Intervention[];
  comparatorSummary?: string;
  nctId: string;
  phase: string;
}

function getArmIcon(type: string) {
  const normalizedType = type?.toLowerCase() || '';
  
  if (normalizedType.includes('experimental')) {
    return <Beaker className="h-4 w-4 text-accent" />;
  }
  if (normalizedType.includes('placebo') || normalizedType.includes('sham')) {
    return <Shield className="h-4 w-4 text-muted-foreground" />;
  }
  if (normalizedType.includes('comparator')) {
    return <GitCompare className="h-4 w-4 text-primary" />;
  }
  return <Pill className="h-4 w-4 text-secondary-foreground" />;
}

function getControlTypeBadge(controlType: string | null | undefined) {
  if (!controlType) return null;
  
  const variants: Record<string, "default" | "secondary" | "outline"> = {
    'Placebo': 'secondary',
    'Sham': 'secondary',
    'Standard of Care': 'outline',
    'Active Comparator': 'default',
    'No Intervention': 'secondary',
    'Experimental': 'default',
  };
  
  return (
    <Badge variant={variants[controlType] || 'outline'} className="ml-2">
      {controlType}
    </Badge>
  );
}

export function ComparatorTab({ arms, interventions, comparatorSummary, nctId, phase }: ComparatorTabProps) {
  const [summaryMode, setSummaryMode] = useState<'basic' | 'advanced'>('basic');
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateSummary = async () => {
    if (!arms || arms.length === 0) {
      toast.error("No hay información estructurada suficiente para generar el resumen.");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateComparatorSummary({
        mode: summaryMode,
        trials: [{
          nctId,
          phase,
          arms: arms.map(arm => ({
            label: arm.label,
            interventions: arm.interventions || [],
            controlType: arm.controlType,
          })),
        }],
      });

      setGeneratedSummary(result.summaryText);
      toast.success("Resumen generado correctamente");
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error(error instanceof Error ? error.message : "Error al generar el resumen");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySummary = async () => {
    if (!generatedSummary) return;
    
    try {
      await navigator.clipboard.writeText(generatedSummary);
      toast.success("Resumen copiado al portapapeles");
    } catch (error) {
      toast.error("Error al copiar el resumen");
    }
  };

  if (!arms || arms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No arm/intervention data available for this trial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparator Summary Generator */}
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-accent" />
            Resumen de comparadores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">Modo:</span>
            <div className="inline-flex rounded-lg border border-border p-1 bg-background">
              <button
                onClick={() => setSummaryMode('basic')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  summaryMode === 'basic'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Básica
              </button>
              <button
                onClick={() => setSummaryMode('advanced')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  summaryMode === 'advanced'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Avanzada
              </button>
            </div>
            <Button 
              onClick={handleGenerateSummary} 
              disabled={isGenerating}
              size="sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                'Generar resumen'
              )}
            </Button>
          </div>

          {/* Generated Summary */}
          {generatedSummary && (
            <div className="space-y-2">
              <Card className="bg-background border-border">
                <CardContent className="p-4">
                  <p className="text-sm leading-relaxed">{generatedSummary}</p>
                </CardContent>
              </Card>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground italic">
                  Generado automáticamente a partir de datos estructurados del registro; no sustituye revisión técnica.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopySummary}
                  className="shrink-0"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copiar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legacy Comparator Summary Card (if exists from backend) */}
      {comparatorSummary && !generatedSummary && (
        <Card className="border-accent/30 bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-accent" />
              Comparator Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{comparatorSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Arms Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Study Arms</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Arm Label</TableHead>
                <TableHead className="w-[150px]">Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Interventions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arms.map((arm, index) => (
                <TableRow key={index} className="table-row-hover">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {getArmIcon(arm.type)}
                      {arm.label}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center flex-wrap">
                      <span className="text-sm">{arm.type || 'Not specified'}</span>
                      {getControlTypeBadge(arm.controlType)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {arm.description || 'No description available'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {arm.interventions?.map((int, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {int}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Interventions Detail */}
      {interventions && interventions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interventions Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {interventions.map((intervention, index) => (
                <Card key={index} className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium">{intervention.name}</h4>
                      <Badge variant="secondary">{intervention.type}</Badge>
                    </div>
                    {intervention.description && (
                      <p className="text-sm text-muted-foreground">
                        {intervention.description}
                      </p>
                    )}
                    {intervention.armGroupLabels && intervention.armGroupLabels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {intervention.armGroupLabels.map((label, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
