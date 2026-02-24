import { useState } from "react";
import { 
  Target, 
  GitCompare, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  HelpCircle,
  Sparkles,
  Loader2,
  Copy,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  PicoAnalysis, 
  COMPARATOR_LABELS,
  ADDON_LABELS,
  CONSISTENCY_LABELS,
  ENDPOINT_LABELS,
  SURROGATE_LABELS,
  PRO_LABELS
} from "@/lib/picoAnalysis";
import { toast } from "sonner";

interface PicoQuickReadingProps {
  analysis: PicoAnalysis;
  onGenerateNarrative?: (mode: 'basic' | 'advanced') => Promise<string>;
  showDetailToggle?: boolean;
  isDetailOpen?: boolean;
  onDetailToggle?: () => void;
}

function BooleanIndicator({ value, trueLabel = "Sí", falseLabel = "No" }: { 
  value: boolean | null; 
  trueLabel?: string;
  falseLabel?: string;
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5" />
        No evaluable
      </span>
    );
  }
  
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {trueLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <XCircle className="h-3.5 w-3.5" />
      {falseLabel}
    </span>
  );
}

function PicoLine({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-border/50 last:border-b-0 ${className || ''}`}>
      <span className="text-sm font-medium text-muted-foreground min-w-[200px] shrink-0">
        {label}:
      </span>
      <span className="text-sm font-medium">
        {value}
      </span>
    </div>
  );
}

function StructuralNote({ note }: { note: string }) {
  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <p className="text-sm text-muted-foreground italic leading-relaxed">
        <span className="font-medium not-italic text-foreground">Nota estructural: </span>
        {note}
      </p>
    </div>
  );
}

export function PicoQuickReading({ 
  analysis, 
  onGenerateNarrative,
  showDetailToggle = false,
  isDetailOpen = true,
  onDetailToggle
}: PicoQuickReadingProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [narrativeMode, setNarrativeMode] = useState<'basic' | 'advanced'>('basic');
  const [narrative, setNarrative] = useState<string | null>(null);

  const handleGenerateNarrative = async () => {
    if (!onGenerateNarrative) return;
    
    setIsGenerating(true);
    try {
      const result = await onGenerateNarrative(narrativeMode);
      setNarrative(result);
      toast.success("Resumen narrativo generado");
    } catch (error) {
      console.error('Error generating narrative:', error);
      toast.error(error instanceof Error ? error.message : "Error al generar el resumen");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyNarrative = async () => {
    if (!narrative) return;
    
    try {
      await navigator.clipboard.writeText(narrative);
      toast.success("Resumen copiado al portapapeles");
    } catch {
      toast.error("Error al copiar");
    }
  };

  const { comparator, endpoint } = analysis;

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Lectura PICO rápida (HTA)
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {analysis.totalTrials} ensayo{analysis.totalTrials !== 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Análisis estructural basado exclusivamente en datos del registro clínico
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Comparators Sub-block */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
            <GitCompare className="h-4 w-4" />
            COMPARADORES
          </h3>
          <div className="bg-background/60 rounded-lg p-4 space-y-0">
            <PicoLine 
              label="Comparador predominante" 
              value={COMPARATOR_LABELS[comparator.predominantComparator]}
            />
            <PicoLine 
              label="Comparador activo directo" 
              value={<BooleanIndicator value={comparator.hasDirectActiveComparator} />}
            />
            <PicoLine 
              label="Diseños add-on sobre SOC" 
              value={ADDON_LABELS[comparator.addOnDesigns]}
            />
            <PicoLine 
              label="Consistencia del comparador por fase" 
              value={CONSISTENCY_LABELS[comparator.phaseConsistency]}
            />
            <StructuralNote note={comparator.structuralNote} />
          </div>
        </div>

        {/* Endpoints Sub-block */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-accent-foreground">
            <Activity className="h-4 w-4 text-accent" />
            ENDPOINTS
          </h3>
          <div className="bg-background/60 rounded-lg p-4 space-y-0">
            <PicoLine 
              label="Endpoint primario dominante" 
              value={ENDPOINT_LABELS[endpoint.dominantPrimaryEndpoint]}
            />
            <PicoLine 
              label="Endpoint clínico duro como primario" 
              value={<BooleanIndicator value={endpoint.hasHardClinicalPrimary} />}
            />
            <PicoLine 
              label="Uso de endpoints subrogados" 
              value={SURROGATE_LABELS[endpoint.surrogateUsage]}
            />
            <PicoLine 
              label="PROs (calidad de vida)" 
              value={PRO_LABELS[endpoint.prosPresence]}
            />
            <PicoLine 
              label="Consistencia de endpoints entre ensayos" 
              value={CONSISTENCY_LABELS[endpoint.endpointConsistency]}
            />
            <StructuralNote note={endpoint.structuralNote} />
          </div>
        </div>

        {/* AI Narrative Section */}
        {onGenerateNarrative && (
          <div className="pt-4 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-border p-1 bg-background">
                <button
                  onClick={() => setNarrativeMode('basic')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    narrativeMode === 'basic'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Básico
                </button>
                <button
                  onClick={() => setNarrativeMode('advanced')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    narrativeMode === 'advanced'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Avanzado
                </button>
              </div>
              <Button 
                onClick={handleGenerateNarrative}
                disabled={isGenerating}
                size="sm"
                variant="outline"
                className="gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generar resumen narrativo PICO (IA)
                  </>
                )}
              </Button>
            </div>

            {narrative && (
              <div className="mt-4 space-y-2">
                <Card className="bg-background border-border">
                  <CardContent className="p-4">
                    <p className="text-sm leading-relaxed whitespace-pre-line">{narrative}</p>
                  </CardContent>
                </Card>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground italic">
                    Generado a partir de datos estructurados; no sustituye revisión técnica.
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleCopyNarrative}
                    className="shrink-0 h-8"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copiar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Detail Toggle */}
        {showDetailToggle && onDetailToggle && (
          <Collapsible open={isDetailOpen} onOpenChange={onDetailToggle}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground">
                {isDetailOpen ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Ocultar detalle técnico
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Ver detalle técnico subyacente
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
