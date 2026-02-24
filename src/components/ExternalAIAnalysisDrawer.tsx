import { useState, useEffect } from "react";
import { Brain, Copy, Check, ChevronDown, ChevronUp, Loader2, AlertCircle, Clock, Globe, Play, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { analyzeWithExternalAI, ExternalAIAnalysisResult, checkExternalAIConfigured } from "@/lib/api";

interface ExternalAIAnalysisDrawerProps {
  source: 'pubmed_json' | 'trial_json' | 'custom';
  getPayload: () => any;
  disabled?: boolean;
}

type AnalysisStatus = 'idle' | 'config_check' | 'ready_to_run' | 'sending' | 'complete' | 'error';

export function ExternalAIAnalysisDrawer({ source, getPayload, disabled }: ExternalAIAnalysisDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');
  const [userInstructions, setUserInstructions] = useState('');
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<ExternalAIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<string | null>(null);
  const [sentPayload, setSentPayload] = useState<any>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [copiedAnalysis, setCopiedAnalysis] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [aiName, setAiName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && isConfigured === null) {
      checkConfig();
    }
  }, [isOpen]);

  const checkConfig = async () => {
    setStatus('config_check');
    try {
      const configResult = await checkExternalAIConfigured();
      setIsConfigured(configResult.configured);
      if (configResult.configured) {
        setAiName(configResult.aiName || null);
        setStatus('ready_to_run');
      } else {
        setStatus('error');
        setError('Servicio de IA no configurado. Configure EXTERNAL_AI_URL y EXTERNAL_AI_KEY en las variables de entorno.');
        setErrorSource('configuration');
      }
    } catch {
      setIsConfigured(false);
      setStatus('error');
      setError('No se pudo verificar la configuración del servicio de IA.');
      setErrorSource('configuration');
    }
  };

  const handleOpenModal = () => {
    setResult(null);
    setError(null);
    setErrorSource(null);
    setSentPayload(null);
    setStatus('idle');
    setIsConfigured(null);
    setIsOpen(true);
  };

  const handleExecuteAnalysis = async () => {
    setStatus('sending');
    setError(null);
    setErrorSource(null);
    setResult(null);

    try {
      const payload = getPayload();
      setSentPayload(payload);

      const analysisResult = await analyzeWithExternalAI({
        source,
        mode,
        payload,
        user_instructions: userInstructions.trim()
      });

      setResult(analysisResult);
      setStatus('complete');
      
      if (analysisResult.cached) {
        toast.info('Resultado cargado desde caché (24h)');
      } else {
        toast.success('Análisis completado');
      }
    } catch (err: any) {
      console.error('External AI analysis error:', err);
      setStatus('error');
      
      const errSource = err.errorSource || null;
      
      if (errSource) {
        setErrorSource(errSource);
        if (errSource === 'timeout') {
          setError('El servicio de IA no respondió a tiempo.');
        } else if (errSource === 'network') {
          setError('Error de red al conectar con el servicio de IA.');
        } else if (errSource === 'rate_limit') {
          setError('Límite de peticiones excedido. Espere antes de reintentar.');
        } else if (errSource === 'payload_size') {
          setError(err.message || 'El payload es demasiado grande.');
        } else {
          setError(err.message || `Error del servicio de IA`);
        }
      } else if (err.message?.includes('timeout')) {
        setError('El servicio de IA no respondió a tiempo.');
        setErrorSource('timeout');
      } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
        setError('Error de red al conectar con el servicio de IA.');
        setErrorSource('network');
      } else {
        setError(err.message || 'Error desconocido al analizar');
        setErrorSource('unknown');
      }
    }
  };

  const handleCopyAnalysis = async () => {
    if (result?.analysisText) {
      await navigator.clipboard.writeText(result.analysisText);
      setCopiedAnalysis(true);
      toast.success('Análisis copiado');
      setTimeout(() => setCopiedAnalysis(false), 2000);
    }
  };

  const handleDownloadAnalysis = () => {
    if (result?.analysisText) {
      const blob = new Blob([result.analysisText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analisis-pico-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Análisis descargado');
    }
  };

  const handleCopyJson = async () => {
    if (sentPayload) {
      await navigator.clipboard.writeText(JSON.stringify(sentPayload, null, 2));
      setCopiedJson(true);
      toast.success('JSON copiado');
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleDownloadJson = () => {
    if (sentPayload) {
      const blob = new Blob([JSON.stringify(sentPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payload-analisis-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('JSON descargado');
    }
  };

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let listItems: JSX.Element[] = [];
    let inList = false;
    let listType: 'ul' | 'ol' = 'ul';

    const flushList = () => {
      if (listItems.length > 0) {
        if (listType === 'ol') {
          elements.push(<ol key={`list-${elements.length}`} className="list-decimal list-outside ml-6 my-3 space-y-1">{listItems}</ol>);
        } else {
          elements.push(<ul key={`list-${elements.length}`} className="list-disc list-outside ml-6 my-3 space-y-1">{listItems}</ul>);
        }
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, i) => {
      const trimmedLine = line.trim();
      
      // Headers
      if (trimmedLine.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={i} className="text-base font-semibold text-foreground mt-6 mb-3 border-b border-border/50 pb-2">
            {trimmedLine.slice(4)}
          </h3>
        );
        return;
      }
      if (trimmedLine.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={i} className="text-lg font-semibold text-foreground mt-6 mb-3 border-b border-border pb-2">
            {trimmedLine.slice(3)}
          </h2>
        );
        return;
      }
      if (trimmedLine.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={i} className="text-xl font-bold text-foreground mt-6 mb-4">
            {trimmedLine.slice(2)}
          </h1>
        );
        return;
      }

      // Numbered list items
      if (/^\d+[\.\)]\s/.test(trimmedLine)) {
        if (!inList || listType !== 'ol') {
          flushList();
          inList = true;
          listType = 'ol';
        }
        const content = trimmedLine.replace(/^\d+[\.\)]\s/, '');
        const boldContent = content.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
        listItems.push(
          <li key={i} className="text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: boldContent }} />
        );
        return;
      }

      // Bullet list items (-, *, •)
      if (/^[-*•]\s/.test(trimmedLine)) {
        if (!inList || listType !== 'ul') {
          flushList();
          inList = true;
          listType = 'ul';
        }
        const content = trimmedLine.slice(2);
        const boldContent = content.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
        listItems.push(
          <li key={i} className="text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: boldContent }} />
        );
        return;
      }

      // End of list
      flushList();

      // Empty line
      if (trimmedLine === '') {
        elements.push(<div key={i} className="h-3" />);
        return;
      }

      // Regular paragraph with bold support
      const boldText = trimmedLine.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
      elements.push(
        <p key={i} className="text-muted-foreground leading-relaxed my-2" dangerouslySetInnerHTML={{ __html: boldText }} />
      );
    });

    flushList();
    return elements;
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'config_check':
        return <Badge variant="secondary" className="animate-pulse"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Verificando...</Badge>;
      case 'ready_to_run':
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Listo para ejecutar</Badge>;
      case 'sending':
        return <Badge variant="secondary" className="animate-pulse"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analizando...</Badge>;
      case 'complete':
        return <Badge className="bg-green-600"><Check className="h-3 w-3 mr-1" />Listo</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return null;
    }
  };

  const getErrorSourceLabel = () => {
    switch (errorSource) {
      case 'configuration': return 'Configuración';
      case 'timeout': return 'Timeout';
      case 'network': return 'Red';
      case 'external_ai_client_error': return 'Error cliente (4xx)';
      case 'external_ai_server_error': return 'Error servidor (5xx)';
      case 'rate_limit': return 'Límite de peticiones';
      case 'payload_size': return 'Payload muy grande';
      case 'external_service': return 'Servicio externo';
      default: return 'Error';
    }
  };

  const displayAiName = result?.aiName || aiName || 'IA';

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenModal}
              disabled={disabled}
            >
              <Brain className="h-4 w-4 mr-2" />
              Analizar con IA
            </Button>
          </TooltipTrigger>
          {isConfigured === false && (
            <TooltipContent>
              <p>Configura EXTERNAL_AI_URL y EXTERNAL_AI_KEY en Environment Variables</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[90vw] w-full h-[90vh] max-h-[90vh] p-0 gap-0 flex flex-col">
          {/* Fixed Header */}
          <div className="flex-shrink-0 border-b border-border bg-background px-6 py-4">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Brain className="h-6 w-6 text-primary" />
                  <div>
                    <DialogTitle className="text-xl font-semibold">
                      Análisis IA – PICO (Comparadores y Endpoints)
                    </DialogTitle>
                    {displayAiName && displayAiName !== 'IA' && (
                      <DialogDescription className="text-sm mt-0.5">
                        Servicio: {displayAiName}
                      </DialogDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge()}
                </div>
              </div>
            </DialogHeader>

            {/* Action buttons - visible when analysis is complete */}
            {status === 'complete' && result && (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleCopyAnalysis}>
                  {copiedAnalysis ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copiar análisis
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadAnalysis}>
                  <Download className="h-4 w-4 mr-1" />
                  Descargar análisis (.md)
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyJson}>
                  {copiedJson ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copiar JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadJson}>
                  <Download className="h-4 w-4 mr-1" />
                  Descargar JSON (.json)
                </Button>
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <ScrollArea className="flex-1 overflow-auto">
            <div className="p-6 space-y-6">
              {/* Configuration form - show when ready to run or idle */}
              {['ready_to_run', 'idle', 'config_check'].includes(status) && (
                <div className="space-y-4 bg-muted/30 rounded-lg p-6 max-w-2xl">
                  <div className="space-y-2">
                    <Label htmlFor="mode-select" className="text-sm font-medium">Modo de análisis</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as 'basic' | 'advanced')}>
                      <SelectTrigger id="mode-select" className="w-full bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background">
                        <SelectItem value="basic">
                          <div className="flex flex-col items-start">
                            <span className="font-medium">Básico</span>
                            <span className="text-xs text-muted-foreground">Conciso, orientado a lectura rápida</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="advanced">
                          <div className="flex flex-col items-start">
                            <span className="font-medium">Avanzado</span>
                            <span className="text-xs text-muted-foreground">Más detalle, desglose por fase</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-instructions" className="text-sm font-medium">Instrucciones adicionales (opcional)</Label>
                    <Textarea
                      id="user-instructions"
                      placeholder="Ej.: céntrate en comparador en fase III; ignora fase I; resalta endpoints primarios; formato en bullets."
                      value={userInstructions}
                      onChange={(e) => setUserInstructions(e.target.value.slice(0, 1000))}
                      className="min-h-24 resize-none bg-background"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {userInstructions.length}/1000 caracteres
                    </p>
                  </div>

                  <Button 
                    onClick={handleExecuteAnalysis} 
                    className="w-full"
                    disabled={status === 'config_check'}
                    size="lg"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Ejecutar análisis
                  </Button>
                </div>
              )}

              {/* Error */}
              {status === 'error' && error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 max-w-2xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold text-destructive">Error en el análisis</p>
                        <Badge variant="outline" className="text-xs">{getErrorSourceLabel()}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{error}</p>
                      {errorSource !== 'configuration' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-4"
                          onClick={() => {
                            setStatus('ready_to_run');
                            setError(null);
                            setErrorSource(null);
                          }}
                        >
                          Reintentar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {status === 'sending' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-6" />
                  <p className="text-lg text-muted-foreground">Analizando con IA...</p>
                  <p className="text-sm text-muted-foreground mt-2">Esto puede tomar hasta 2 minutos</p>
                </div>
              )}

              {/* Analysis Result */}
              {status === 'complete' && result && (
                <div className="space-y-6">
                  {/* User instructions used */}
                  {result.userInstructionsUsed && (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 border border-border/50">
                      <span className="font-medium text-foreground">Instrucciones aplicadas:</span>{' '}
                      {result.userInstructionsUsed}
                    </div>
                  )}

                  {/* Cached indicator */}
                  {result.cached && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 bg-blue-500/10 rounded-lg px-4 py-2">
                      <Clock className="h-4 w-4" />
                      Resultado en caché desde {new Date(result.cachedAt!).toLocaleString()}
                    </div>
                  )}

                  {/* Main analysis text */}
                  <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(result.analysisText)}
                    </div>
                  </div>

                  <Separator />

                  {/* JSON sent (collapsible) */}
                  <Collapsible open={jsonOpen} onOpenChange={setJsonOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between hover:bg-muted/50">
                        <span className="font-medium">JSON utilizado para el análisis</span>
                        {jsonOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-muted/50 rounded-lg p-4 mt-2 border border-border/50">
                        <div className="flex justify-end mb-3 gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCopyJson}>
                            {copiedJson ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                            Copiar JSON
                          </Button>
                        </div>
                        <pre className="text-xs font-mono overflow-auto max-h-80 whitespace-pre-wrap bg-background rounded p-4 border border-border">
                          {JSON.stringify(sentPayload, null, 2)}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Trace info (collapsible) */}
                  <Collapsible open={traceOpen} onOpenChange={setTraceOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between hover:bg-muted/50">
                        <span className="font-medium">Detalles técnicos y trazabilidad</span>
                        {traceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-muted/50 rounded-lg p-4 mt-2 border border-border/50 space-y-3 text-sm">
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground w-24">Timestamp:</span>
                          <span className="font-mono">{new Date(result.trace.calledAt).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground w-24">Endpoint:</span>
                          <span className="font-mono text-xs break-all">{result.trace.endpoint}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 flex-shrink-0" />
                          <span className="text-muted-foreground w-24">Status:</span>
                          <Badge variant={result.trace.status === 200 ? 'default' : 'destructive'}>
                            {result.trace.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 flex-shrink-0" />
                          <span className="text-muted-foreground w-24">Duración:</span>
                          <span className="font-mono">{result.trace.durationMs}ms</span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Run another analysis */}
                  <div className="pt-4">
                    <Button 
                      variant="outline" 
                      className="w-full max-w-md"
                      onClick={() => {
                        setStatus('ready_to_run');
                        setResult(null);
                      }}
                    >
                      Ejecutar nuevo análisis
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
