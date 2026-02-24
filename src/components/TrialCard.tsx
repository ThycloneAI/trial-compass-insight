import { ExternalLink, Calendar, Users, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Trial } from "@/lib/api";
import { Link } from "react-router-dom";

interface TrialCardProps {
  trial: Trial;
  highlightCondition?: boolean;
}

function getStatusVariant(status: string): "recruiting" | "completed" | "terminated" | "active" | "default" {
  const normalizedStatus = status.toLowerCase().replace(/_/g, ' ');
  
  if (normalizedStatus.includes('recruiting') && !normalizedStatus.includes('not')) {
    return 'recruiting';
  }
  if (normalizedStatus.includes('completed')) {
    return 'completed';
  }
  if (normalizedStatus.includes('terminated') || normalizedStatus.includes('withdrawn')) {
    return 'terminated';
  }
  if (normalizedStatus.includes('active')) {
    return 'active';
  }
  return 'default';
}

function getPhaseVariant(phase: string): "phase1" | "phase2" | "phase3" | "phase4" | "secondary" {
  const normalizedPhase = phase.toLowerCase();
  
  if (normalizedPhase.includes('phase 1') || normalizedPhase.includes('phase1')) {
    return 'phase1';
  }
  if (normalizedPhase.includes('phase 2') || normalizedPhase.includes('phase2')) {
    return 'phase2';
  }
  if (normalizedPhase.includes('phase 3') || normalizedPhase.includes('phase3')) {
    return 'phase3';
  }
  if (normalizedPhase.includes('phase 4') || normalizedPhase.includes('phase4')) {
    return 'phase4';
  }
  return 'secondary';
}

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

export function TrialCard({ trial, highlightCondition = false }: TrialCardProps) {
  return (
    <Card className="glass-card transition-all duration-200 hover:shadow-lg hover:border-accent/30 animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={getPhaseVariant(trial.phase)}>
              {trial.phase || 'N/A'}
            </Badge>
            <Badge variant={getStatusVariant(trial.overallStatus)}>
              {trial.overallStatus.replace(/_/g, ' ')}
            </Badge>
          </div>
          <a
            href={`https://clinicaltrials.gov/study/${trial.nctId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-mono text-accent hover:underline flex items-center gap-1"
          >
            {trial.nctId}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <h3 className="text-lg font-semibold leading-tight mt-2 line-clamp-2">
          {trial.briefTitle}
        </h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Conditions - prominently displayed when in condition-only mode */}
        {trial.conditions && trial.conditions.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${highlightCondition ? 'p-2 bg-accent/10 rounded-md border border-accent/20' : ''}`}>
            {highlightCondition && (
              <span className="text-xs font-medium text-accent w-full mb-1">Matched Conditions:</span>
            )}
            {trial.conditions.slice(0, highlightCondition ? 5 : 3).map((condition, i) => (
              <Badge 
                key={i} 
                variant={highlightCondition ? "default" : "outline"} 
                className={`text-xs ${highlightCondition ? 'bg-accent/20 text-accent-foreground border-accent/30' : ''}`}
              >
                {condition}
              </Badge>
            ))}
            {trial.conditions.length > (highlightCondition ? 5 : 3) && (
              <Badge variant="outline" className="text-xs">
                +{trial.conditions.length - (highlightCondition ? 5 : 3)} more
              </Badge>
            )}
          </div>
        )}

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate" title={trial.leadSponsor}>
              {trial.leadSponsor}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>Updated {formatDate(trial.lastUpdatePostDate)}</span>
          </div>
          {trial.enrollmentCount && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0" />
              <span>{trial.enrollmentCount.toLocaleString()} enrolled</span>
            </div>
          )}
        </div>

        {/* Brief summary preview */}
        {trial.briefSummary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {trial.briefSummary}
          </p>
        )}

        {/* Action */}
        <Link to={`/trial/${trial.nctId}`}>
          <Button variant="outline" className="w-full mt-2">
            View Comparators & Endpoints
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
