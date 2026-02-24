/**
 * Professional PDF Report Generator for Trial Compass
 * Generates HTA-grade PDF reports for clinical trial analysis
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  TrialDetail,
  Arm,
  Outcome,
} from './api';
import {
  PicoAnalysis,
  COMPARATOR_LABELS,
  ADDON_LABELS,
  CONSISTENCY_LABELS,
  ENDPOINT_LABELS,
  SURROGATE_LABELS,
  PRO_LABELS,
} from './picoAnalysis';

// ============= TYPES =============

export interface PdfReportData {
  trial: TrialDetail;
  picoAnalysis: PicoAnalysis | null;
  picoNarrative?: string;
  comparatorNarrative?: string;
}

// ============= COLORS =============

const COLORS = {
  primary: [30, 58, 138] as [number, number, number],       // Deep blue
  secondary: [100, 116, 139] as [number, number, number],    // Slate
  accent: [59, 130, 246] as [number, number, number],        // Blue
  success: [22, 163, 74] as [number, number, number],        // Green
  warning: [234, 179, 8] as [number, number, number],        // Yellow
  danger: [220, 38, 38] as [number, number, number],         // Red
  lightBg: [248, 250, 252] as [number, number, number],      // Slate-50
  border: [226, 232, 240] as [number, number, number],       // Slate-200
  text: [15, 23, 42] as [number, number, number],            // Slate-900
  textMuted: [100, 116, 139] as [number, number, number],    // Slate-500
  white: [255, 255, 255] as [number, number, number],
};

// ============= PDF GENERATION =============

export function generateTrialPdfReport(data: PdfReportData): void {
  const { trial, picoAnalysis, picoNarrative, comparatorNarrative } = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ---- HELPER FUNCTIONS ----

  function checkPageBreak(requiredSpace: number) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + requiredSpace > pageHeight - 20) {
      doc.addPage();
      y = margin;
      drawPageHeader();
    }
  }

  function drawPageHeader() {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(`Trial Compass Report — ${trial.nctId}`, margin, 8);
    doc.text(
      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      pageWidth - margin,
      8,
      { align: 'right' }
    );
    doc.setDrawColor(...COLORS.border);
    doc.line(margin, 10, pageWidth - margin, 10);
    y = 15;
  }

  function drawPageFooter(pageNum: number, totalPages: number) {
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(
      `Page ${pageNum} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
    doc.text(
      'Trial Compass — Clinical Trial Analysis Platform',
      margin,
      pageHeight - 8
    );
  }

  function sectionTitle(title: string) {
    checkPageBreak(15);
    y += 4;
    doc.setFillColor(...COLORS.primary);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 3, y + 5.5);
    doc.setFont('helvetica', 'normal');
    y += 12;
  }

  function subSectionTitle(title: string) {
    checkPageBreak(12);
    y += 2;
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...COLORS.accent);
    doc.line(margin, y + 1.5, margin + contentWidth * 0.3, y + 1.5);
    y += 5;
  }

  function labelValue(label: string, value: string, xOffset = 0) {
    checkPageBreak(6);
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin + xOffset, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.text(value || 'N/A', margin + xOffset + labelWidth, y);
    y += 4.5;
  }

  function wrappedText(text: string, fontSize = 8.5, color = COLORS.text) {
    if (!text) return;
    checkPageBreak(10);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth - 2);
    for (const line of lines) {
      checkPageBreak(5);
      doc.text(line, margin + 1, y);
      y += 3.8;
    }
    y += 1;
  }

  function narrativeBlock(text: string, bgColor = COLORS.lightBg) {
    if (!text) return;
    checkPageBreak(15);
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(text.trim(), contentWidth - 8);
    const blockHeight = lines.length * 3.8 + 6;
    checkPageBreak(blockHeight + 4);

    doc.setFillColor(...bgColor);
    doc.roundedRect(margin, y, contentWidth, blockHeight, 1.5, 1.5, 'F');
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(margin, y, contentWidth, blockHeight, 1.5, 1.5, 'S');

    doc.setTextColor(...COLORS.text);
    let textY = y + 4;
    for (const line of lines) {
      doc.text(line, margin + 4, textY);
      textY += 3.8;
    }
    y += blockHeight + 3;
  }

  // ---- COVER PAGE ----

  // Background stripe
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 80, 'F');

  // Title area
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 230);
  doc.text('TRIAL COMPASS', margin, 20);
  doc.setFontSize(8);
  doc.text('Clinical Trial Analysis Report', margin, 26);

  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(trial.briefTitle, contentWidth);
  let titleY = 40;
  for (const line of titleLines) {
    doc.text(line, margin, titleY);
    titleY += 7;
  }
  doc.setFont('helvetica', 'normal');

  // NCT ID badge
  y = 90;
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(trial.nctId, margin, y);
  doc.setFont('helvetica', 'normal');
  y += 10;

  // Key info grid
  const metaItems = [
    ['Phase', trial.phase || 'N/A'],
    ['Status', (trial.overallStatus || 'N/A').replace(/_/g, ' ')],
    ['Sponsor', trial.leadSponsor || 'N/A'],
    ['Study Type', trial.studyType || 'N/A'],
    ['Enrollment', trial.enrollmentCount ? `${trial.enrollmentCount.toLocaleString()} participants` : 'N/A'],
    ['Conditions', trial.conditions?.join(', ') || 'N/A'],
  ];

  doc.setFillColor(...COLORS.lightBg);
  doc.roundedRect(margin, y, contentWidth, metaItems.length * 7 + 6, 2, 2, 'F');

  let metaY = y + 5;
  for (const [label, value] of metaItems) {
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin + 4, metaY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const truncatedValue = value.length > 80 ? value.substring(0, 77) + '...' : value;
    doc.text(truncatedValue, margin + 40, metaY);
    metaY += 7;
  }

  y = metaY + 8;

  // Dates
  if (trial.startDate || trial.completionDate) {
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.textMuted);
    if (trial.startDate) {
      doc.text(`Start: ${trial.startDate}`, margin, y);
    }
    if (trial.completionDate) {
      doc.text(`Completion: ${trial.completionDate}`, margin + 60, y);
    }
    y += 6;
  }

  // Report generation info
  y += 10;
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(
    `Report generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
    margin,
    y
  );
  y += 4;
  doc.text('Source: ClinicalTrials.gov API v2 via Trial Compass', margin, y);
  if (trial.trace) {
    y += 4;
    doc.text(
      `Data fetched: ${new Date(trial.trace.timestamp).toLocaleString()}`,
      margin,
      y
    );
  }

  // Disclaimer
  y += 10;
  doc.setFillColor(254, 243, 199); // Amber-100
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setFontSize(7);
  doc.setTextColor(146, 64, 14); // Amber-800
  doc.setFont('helvetica', 'bold');
  doc.text('DISCLAIMER', margin + 3, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'This report is generated automatically from structured clinical trial data. It does not substitute',
    margin + 3,
    y + 7.5
  );
  doc.text(
    'professional technical assessment. AI-generated narratives should be validated by qualified HTA professionals.',
    margin + 3,
    y + 10.5
  );

  // ---- PAGE 2: PICO ANALYSIS ----

  doc.addPage();
  drawPageHeader();

  sectionTitle('PICO Structural Analysis');

  if (picoAnalysis) {
    // Comparator Analysis
    subSectionTitle('Comparators');

    labelValue('Predominant Comparator', COMPARATOR_LABELS[picoAnalysis.comparator.predominantComparator]);
    labelValue('Direct Active Comparator',
      picoAnalysis.comparator.hasDirectActiveComparator === null
        ? 'Not evaluable'
        : picoAnalysis.comparator.hasDirectActiveComparator ? 'Yes' : 'No'
    );
    labelValue('Add-on Designs', ADDON_LABELS[picoAnalysis.comparator.addOnDesigns]);
    labelValue('Phase Consistency', CONSISTENCY_LABELS[picoAnalysis.comparator.phaseConsistency]);

    if (picoAnalysis.comparator.structuralNote) {
      y += 2;
      narrativeBlock(picoAnalysis.comparator.structuralNote);
    }

    // Endpoint Analysis
    subSectionTitle('Endpoints');

    labelValue('Dominant Primary Endpoint', ENDPOINT_LABELS[picoAnalysis.endpoint.dominantPrimaryEndpoint]);
    labelValue('Hard Clinical Primary (OS)',
      picoAnalysis.endpoint.hasHardClinicalPrimary === null
        ? 'Not evaluable'
        : picoAnalysis.endpoint.hasHardClinicalPrimary ? 'Yes' : 'No'
    );
    labelValue('Surrogate Usage', SURROGATE_LABELS[picoAnalysis.endpoint.surrogateUsage]);
    labelValue('PROs Presence', PRO_LABELS[picoAnalysis.endpoint.prosPresence]);
    labelValue('Endpoint Consistency', CONSISTENCY_LABELS[picoAnalysis.endpoint.endpointConsistency]);

    if (picoAnalysis.endpoint.structuralNote) {
      y += 2;
      narrativeBlock(picoAnalysis.endpoint.structuralNote);
    }
  } else {
    wrappedText('PICO analysis not available for this trial.');
  }

  // ---- AI NARRATIVES ----

  if (picoNarrative || comparatorNarrative) {
    sectionTitle('AI-Generated Narratives');

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'The following narratives were generated by AI from structured data. They should be validated by an HTA professional.',
      margin,
      y
    );
    doc.setFont('helvetica', 'normal');
    y += 5;

    if (picoNarrative) {
      subSectionTitle('PICO Narrative Summary');
      narrativeBlock(picoNarrative);
    }

    if (comparatorNarrative) {
      subSectionTitle('Comparator Analysis Narrative');
      narrativeBlock(comparatorNarrative);
    }
  }

  // ---- COMPARATOR ARMS TABLE ----

  if (trial.arms && trial.arms.length > 0) {
    sectionTitle('Study Arms & Comparators');

    const armRows = trial.arms.map((arm: Arm) => [
      arm.label || '-',
      arm.type || '-',
      arm.isControl ? (arm.controlType || 'Control') : '-',
      arm.interventions?.join(', ') || '-',
      (arm.description || '-').substring(0, 120) + (arm.description && arm.description.length > 120 ? '...' : ''),
    ]);

    checkPageBreak(20 + armRows.length * 10);

    autoTable(doc, {
      startY: y,
      head: [['Arm Label', 'Type', 'Control Type', 'Interventions', 'Description']],
      body: armRows,
      theme: 'grid',
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: COLORS.text,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightBg,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 22 },
        2: { cellWidth: 25 },
        3: { cellWidth: 35 },
        4: { cellWidth: 'auto' },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        drawPageHeader();
      },
    });

    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // ---- ENDPOINTS TABLES ----

  const hasPrimary = trial.primaryOutcomes && trial.primaryOutcomes.length > 0;
  const hasSecondary = trial.secondaryOutcomes && trial.secondaryOutcomes.length > 0;

  if (hasPrimary || hasSecondary) {
    sectionTitle('Endpoints');

    if (hasPrimary) {
      subSectionTitle(`Primary Outcomes (${trial.primaryOutcomes!.length})`);

      const primaryRows = trial.primaryOutcomes!.map((o: Outcome) => [
        o.classification || 'Other',
        o.measure || '-',
        o.timeFrame || '-',
      ]);

      checkPageBreak(15 + primaryRows.length * 8);

      autoTable(doc, {
        startY: y,
        head: [['Classification', 'Measure', 'Time Frame']],
        body: primaryRows,
        theme: 'grid',
        headStyles: {
          fillColor: COLORS.primary,
          textColor: COLORS.white,
          fontSize: 8,
          fontStyle: 'bold',
          cellPadding: 2.5,
        },
        bodyStyles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: COLORS.text,
        },
        alternateRowStyles: {
          fillColor: COLORS.lightBg,
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 35 },
        },
        margin: { left: margin, right: margin },
        didDrawPage: () => {
          drawPageHeader();
        },
      });

      y = (doc as any).lastAutoTable.finalY + 5;
    }

    if (hasSecondary) {
      subSectionTitle(`Secondary Outcomes (${trial.secondaryOutcomes!.length})`);

      const secondaryRows = trial.secondaryOutcomes!.map((o: Outcome) => [
        o.classification || 'Other',
        o.measure || '-',
        o.timeFrame || '-',
      ]);

      checkPageBreak(15 + secondaryRows.length * 8);

      autoTable(doc, {
        startY: y,
        head: [['Classification', 'Measure', 'Time Frame']],
        body: secondaryRows,
        theme: 'grid',
        headStyles: {
          fillColor: COLORS.primary,
          textColor: COLORS.white,
          fontSize: 8,
          fontStyle: 'bold',
          cellPadding: 2.5,
        },
        bodyStyles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: COLORS.text,
        },
        alternateRowStyles: {
          fillColor: COLORS.lightBg,
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 35 },
        },
        margin: { left: margin, right: margin },
        didDrawPage: () => {
          drawPageHeader();
        },
      });

      y = (doc as any).lastAutoTable.finalY + 5;
    }
  }

  // ---- BRIEF SUMMARY ----

  if (trial.briefSummary) {
    sectionTitle('Study Summary');
    wrappedText(trial.briefSummary);
  }

  // ---- LOCATIONS ----

  if (trial.locations && trial.locations.length > 0) {
    sectionTitle(`Study Locations (${trial.locations.length})`);

    const locationRows = trial.locations.slice(0, 30).map(loc => [
      loc.facility || '-',
      loc.city || '-',
      loc.state || '-',
      loc.country || '-',
      loc.status || '-',
    ]);

    checkPageBreak(15 + locationRows.length * 8);

    autoTable(doc, {
      startY: y,
      head: [['Facility', 'City', 'State', 'Country', 'Status']],
      body: locationRows,
      theme: 'grid',
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 1.5,
        textColor: COLORS.text,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightBg,
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        drawPageHeader();
      },
    });

    y = (doc as any).lastAutoTable.finalY + 3;

    if (trial.locations.length > 30) {
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.textMuted);
      doc.text(
        `Showing 30 of ${trial.locations.length} locations. See ClinicalTrials.gov for complete list.`,
        margin,
        y
      );
      y += 5;
    }
  }

  // ---- TRACE / AUDIT INFORMATION ----

  sectionTitle('Data Source & Audit Trail');

  labelValue('Report Generated', new Date().toISOString());
  labelValue('Source', 'ClinicalTrials.gov API v2');
  labelValue('NCT ID', trial.nctId);

  if (trial.trace) {
    labelValue('Data Fetched At', new Date(trial.trace.timestamp).toLocaleString());
    for (const call of trial.trace.dataSourceCalls) {
      labelValue(`  Source Call`, `${call.source} (${call.resultCount ?? '?'} results)`);
    }
  }

  y += 3;
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textMuted);
  doc.text('End of report.', pageWidth / 2, y, { align: 'center' });

  // ---- ADD PAGE NUMBERS ----

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageFooter(i, totalPages);
  }

  // ---- SAVE ----

  doc.save(`TrialCompass_${trial.nctId}_Report.pdf`);
}
