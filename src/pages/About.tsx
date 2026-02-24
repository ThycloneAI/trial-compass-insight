import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Database, BookOpen, AlertTriangle, Info } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="container py-8 max-w-4xl flex-1">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold mb-4">About This Tool</h1>
          <p className="text-lg text-muted-foreground">
            The Comparator & Endpoint Finder is a research tool designed for HTA 
            (Health Technology Assessment) and regulatory professionals.
          </p>
        </div>

        {/* Purpose */}
        <Card className="mb-6 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Purpose
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              This tool helps researchers quickly identify and analyze clinical trial data including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Comparator Arms:</strong> Understand the study design 
                by viewing experimental and control arms with their interventions
              </li>
              <li>
                <strong className="text-foreground">Endpoint Classification:</strong> Primary and secondary 
                outcomes are automatically classified into categories (OS, PFS, ORR, QoL/PRO, Safety, etc.)
              </li>
              <li>
                <strong className="text-foreground">Related Publications:</strong> Find PubMed articles 
                linked to specific trials
              </li>
              <li>
                <strong className="text-foreground">Export Capabilities:</strong> Download data in CSV and 
                JSON formats with full audit traces
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Data Sources */}
        <Card className="mb-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-accent" />
              Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">ClinicalTrials.gov</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  The official U.S. clinical trials registry maintained by the National Library of Medicine.
                </p>
                <a
                  href="https://clinicaltrials.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                >
                  Visit ClinicalTrials.gov
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="p-4 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">PubMed / NCBI</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Publications are retrieved using NCBI E-utilities to search PubMed by NCT identifier.
                </p>
                <a
                  href="https://pubmed.ncbi.nlm.nih.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                >
                  Visit PubMed
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Data is cached for 24 hours to improve performance and reduce load on public APIs.
              All queries include a trace block with timestamps and data source information for audit purposes.
            </p>
          </CardContent>
        </Card>

        {/* Endpoint Classifications */}
        <Card className="mb-6 animate-slide-up" style={{ animationDelay: "150ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Endpoint Classifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Outcomes are automatically classified into the following categories based on keyword matching:
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="os">OS - Overall Survival</Badge>
              <Badge variant="pfs">PFS - Progression-Free Survival</Badge>
              <Badge variant="orr">ORR - Objective Response Rate</Badge>
              <Badge variant="qol">QoL/PRO - Quality of Life</Badge>
              <Badge variant="safety">Safety - Adverse Events</Badge>
              <Badge variant="biomarker">Biomarker</Badge>
              <Badge variant="resource">Resource Use</Badge>
              <Badge variant="other">Other</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Note: Classification is performed algorithmically based on outcome measure text and may not 
              always be accurate. Always verify classifications against the original trial record.
            </p>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Card className="border-destructive/30 bg-destructive/5 animate-slide-up" style={{ animationDelay: "200ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Important Disclaimer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <strong>This tool is for informational and research purposes only.</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>This is not medical advice and should not be used for clinical decision-making</li>
              <li>Data is retrieved from public sources and may contain errors or be incomplete</li>
              <li>Endpoint classifications are algorithmic approximations and should be verified</li>
              <li>Trial status and data may change; always check the official registry for current information</li>
              <li>The comparator analysis is derived from structured trial data and may not capture all nuances</li>
            </ul>
            <p className="text-muted-foreground">
              For official trial information, always refer to{" "}
              <a
                href="https://clinicaltrials.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                ClinicalTrials.gov
              </a>{" "}
              directly.
            </p>
          </CardContent>
        </Card>

        {/* Version info */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Comparator & Endpoint Finder v1.0</p>
          <p>Built with ClinicalTrials.gov API v2 and NCBI E-utilities</p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
