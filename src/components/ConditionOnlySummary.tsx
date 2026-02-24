import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trial } from "@/lib/api";
import { BarChart3, Target, FlaskConical, Activity } from "lucide-react";

interface ConditionOnlySummaryProps {
  trials: Trial[];
}

interface ComparatorCount {
  name: string;
  count: number;
  type: string;
}

interface EndpointFamily {
  name: string;
  count: number;
  examples: string[];
}

export function ConditionOnlySummary({ trials }: ConditionOnlySummaryProps) {
  const summary = useMemo(() => {
    // Count by phase
    const phaseCount: Record<string, number> = {};
    // Count by status
    const statusCount: Record<string, number> = {};
    // Track comparators/interventions
    const interventionCount: Record<string, { count: number; type: string }> = {};
    // Track endpoint families
    const endpointFamilies: Record<string, { count: number; examples: Set<string> }> = {
      'Overall Survival (OS)': { count: 0, examples: new Set() },
      'Progression-Free Survival (PFS)': { count: 0, examples: new Set() },
      'Objective Response Rate (ORR)': { count: 0, examples: new Set() },
      'Patient-Reported Outcomes (PRO)': { count: 0, examples: new Set() },
      'Safety/Adverse Events': { count: 0, examples: new Set() },
      'Disease-Free Survival (DFS)': { count: 0, examples: new Set() },
      'Quality of Life (QoL)': { count: 0, examples: new Set() },
      'Other': { count: 0, examples: new Set() },
    };

    trials.forEach((trial) => {
      // Phase counting
      const phase = trial.phase || 'N/A';
      phaseCount[phase] = (phaseCount[phase] || 0) + 1;

      // Status counting
      const status = trial.overallStatus || 'Unknown';
      statusCount[status] = (statusCount[status] || 0) + 1;

      // Intervention counting (top comparators)
      trial.interventions?.forEach((int) => {
        if (int.name) {
          if (!interventionCount[int.name]) {
            interventionCount[int.name] = { count: 0, type: int.type || 'Unknown' };
          }
          interventionCount[int.name].count++;
        }
      });

      // Endpoint family classification
      const allOutcomes = [
        ...(trial.primaryOutcomes || []),
        ...(trial.secondaryOutcomes || [])
      ];

      allOutcomes.forEach((outcome) => {
        const measure = outcome.measure?.toLowerCase() || '';
        
        if (measure.includes('overall survival') || measure.includes(' os ') || measure === 'os') {
          endpointFamilies['Overall Survival (OS)'].count++;
          endpointFamilies['Overall Survival (OS)'].examples.add(outcome.measure);
        } else if (measure.includes('progression') || measure.includes('pfs')) {
          endpointFamilies['Progression-Free Survival (PFS)'].count++;
          endpointFamilies['Progression-Free Survival (PFS)'].examples.add(outcome.measure);
        } else if (measure.includes('response rate') || measure.includes('orr') || measure.includes('objective response')) {
          endpointFamilies['Objective Response Rate (ORR)'].count++;
          endpointFamilies['Objective Response Rate (ORR)'].examples.add(outcome.measure);
        } else if (measure.includes('quality of life') || measure.includes('qol') || measure.includes('hrqol')) {
          endpointFamilies['Quality of Life (QoL)'].count++;
          endpointFamilies['Quality of Life (QoL)'].examples.add(outcome.measure);
        } else if (measure.includes('patient reported') || measure.includes('pro') || measure.includes('symptom')) {
          endpointFamilies['Patient-Reported Outcomes (PRO)'].count++;
          endpointFamilies['Patient-Reported Outcomes (PRO)'].examples.add(outcome.measure);
        } else if (measure.includes('adverse') || measure.includes('safety') || measure.includes('toxicity') || measure.includes('ae')) {
          endpointFamilies['Safety/Adverse Events'].count++;
          endpointFamilies['Safety/Adverse Events'].examples.add(outcome.measure);
        } else if (measure.includes('disease-free') || measure.includes('dfs') || measure.includes('relapse-free')) {
          endpointFamilies['Disease-Free Survival (DFS)'].count++;
          endpointFamilies['Disease-Free Survival (DFS)'].examples.add(outcome.measure);
        } else {
          endpointFamilies['Other'].count++;
          endpointFamilies['Other'].examples.add(outcome.measure);
        }
      });
    });

    // Sort interventions by count
    const topComparators: ComparatorCount[] = Object.entries(interventionCount)
      .map(([name, data]) => ({ name, count: data.count, type: data.type }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Convert endpoint families to sorted array
    const topEndpoints: EndpointFamily[] = Object.entries(endpointFamilies)
      .filter(([_, data]) => data.count > 0)
      .map(([name, data]) => ({
        name,
        count: data.count,
        examples: Array.from(data.examples).slice(0, 3)
      }))
      .sort((a, b) => b.count - a.count);

    return {
      phaseCount,
      statusCount,
      topComparators,
      topEndpoints,
      totalTrials: trials.length
    };
  }, [trials]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Top Comparators */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-accent" />
            Top Interventions / Comparators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.topComparators.slice(0, 8).map((comp, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-muted-foreground w-4">{i + 1}.</span>
                  <span className="truncate" title={comp.name}>{comp.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{comp.type}</Badge>
                </div>
                <span className="text-muted-foreground ml-2">{comp.count}</span>
              </div>
            ))}
            {summary.topComparators.length === 0 && (
              <p className="text-sm text-muted-foreground">No interventions found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Endpoint Families */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            Endpoint Families
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.topEndpoints.slice(0, 6).map((ep, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1" title={ep.name}>{ep.name}</span>
                <Badge variant="secondary" className="ml-2">{ep.count}</Badge>
              </div>
            ))}
            {summary.topEndpoints.length === 0 && (
              <p className="text-sm text-muted-foreground">No endpoints found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phase Distribution */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            By Phase
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.phaseCount)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([phase, count]) => (
                <Badge key={phase} variant="outline" className="gap-1.5">
                  {phase}: <strong>{count}</strong>
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Status Distribution */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" />
            By Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.statusCount)
              .sort(([_, a], [__, b]) => b - a)
              .slice(0, 6)
              .map(([status, count]) => (
                <Badge key={status} variant="outline" className="gap-1.5">
                  {status.replace(/_/g, ' ')}: <strong>{count}</strong>
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
