import { Target, Clock, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Outcome } from "@/lib/api";

interface EndpointsTabProps {
  primaryOutcomes: Outcome[];
  secondaryOutcomes: Outcome[];
}

function getClassificationVariant(classification: string): "os" | "pfs" | "orr" | "qol" | "safety" | "biomarker" | "resource" | "other" {
  const mapping: Record<string, "os" | "pfs" | "orr" | "qol" | "safety" | "biomarker" | "resource" | "other"> = {
    'OS': 'os',
    'PFS': 'pfs',
    'DFS': 'pfs',
    'ORR': 'orr',
    'DOR': 'orr',
    'TTP': 'pfs',
    'QoL/PRO': 'qol',
    'Safety': 'safety',
    'Biomarker': 'biomarker',
    'Resource Use': 'resource',
    'Other': 'other',
  };
  return mapping[classification] || 'other';
}

function getClassificationLabel(classification: string): string {
  const labels: Record<string, string> = {
    'OS': 'Overall Survival',
    'PFS': 'Progression-Free Survival',
    'DFS': 'Disease-Free Survival',
    'ORR': 'Objective Response Rate',
    'DOR': 'Duration of Response',
    'TTP': 'Time to Progression',
    'QoL/PRO': 'Quality of Life / PRO',
    'Safety': 'Safety',
    'Biomarker': 'Biomarker',
    'Resource Use': 'Resource Use',
    'Other': 'Other',
  };
  return labels[classification] || classification;
}

function OutcomeTable({ outcomes, isPrimary }: { outcomes: Outcome[]; isPrimary: boolean }) {
  if (!outcomes || outcomes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No {isPrimary ? 'primary' : 'secondary'} outcomes specified.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Classification</TableHead>
          <TableHead>Measure</TableHead>
          <TableHead className="w-[150px]">Timeframe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outcomes.map((outcome, index) => (
          <TableRow key={index} className="table-row-hover">
            <TableCell>
              <Badge 
                variant={getClassificationVariant(outcome.classification || 'Other')}
                title={getClassificationLabel(outcome.classification || 'Other')}
              >
                {outcome.classification || 'Other'}
              </Badge>
            </TableCell>
            <TableCell>
              <div>
                <p className="font-medium">{outcome.measure}</p>
                {outcome.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {outcome.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {outcome.timeFrame || 'Not specified'}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EndpointsTab({ primaryOutcomes, secondaryOutcomes }: EndpointsTabProps) {
  const allOutcomes = [...(primaryOutcomes || []), ...(secondaryOutcomes || [])];
  
  if (allOutcomes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No endpoint data available for this trial.</p>
      </div>
    );
  }

  // Classification summary
  const classificationCounts: Record<string, number> = {};
  allOutcomes.forEach((outcome) => {
    const cls = outcome.classification || 'Other';
    classificationCounts[cls] = (classificationCounts[cls] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Classification Summary */}
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-accent" />
            Endpoint Classification Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(classificationCounts).map(([classification, count]) => (
              <Badge 
                key={classification} 
                variant={getClassificationVariant(classification)}
                className="text-sm px-3 py-1"
              >
                {classification}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Primary Outcomes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            Primary Outcomes
            <Badge variant="default" className="ml-2">
              {primaryOutcomes?.length || 0}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OutcomeTable outcomes={primaryOutcomes} isPrimary={true} />
        </CardContent>
      </Card>

      {/* Secondary Outcomes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-secondary-foreground" />
            Secondary Outcomes
            <Badge variant="secondary" className="ml-2">
              {secondaryOutcomes?.length || 0}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OutcomeTable outcomes={secondaryOutcomes} isPrimary={false} />
        </CardContent>
      </Card>
    </div>
  );
}
