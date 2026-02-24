

# Enrich AI Analysis: Expert-Level Prompt, Richer Data, Better Presentation, and PDF Export

## Overview

This plan upgrades the AI analysis feature to produce intelligence-grade reports with richer data layers, expert-level prompting, professional UI presentation, and proper PDF export. It also removes "externa" references and the "Proyecto experimental" label from the homepage.

---

## 1. Cosmetic / Labeling Changes

### 1.1 Remove "Proyecto experimental" from homepage
- **File:** `src/pages/Index.tsx` -- Remove the `<div>` at line 84-86 that shows "Proyecto experimental".

### 1.2 Remove "externa" from AI references
- **File:** `src/components/ExternalAIAnalysisDrawer.tsx`:
  - Button text: "Analizar con IA externa" --> "Analizar con IA"
  - Dialog title: keep "Analisis IA -- PICO (Comparadores y Endpoints)"
  - All error messages: replace "IA externa" with "IA"
  - Loading text: "Analizando con IA externa..." --> "Analizando con IA..."
  - `displayAiName` fallback: 'IA Externa' --> 'IA'
- **File:** `src/components/TrialResultsList.tsx`: no changes needed (uses component as-is).
- **File:** `supabase/functions/external-ai-analyze/index.ts`: Change `EXTERNAL_AI_NAME` default from `'IA Externa'` to `'IA'`.

### 1.3 Remove "experimental" from Footer
- **File:** `src/components/Footer.tsx` -- Change "is an experimental project by" to "A project by".

---

## 2. Enrich the Data Sent to the AI (trimPayloadForAI)

**File:** `supabase/functions/external-ai-analyze/index.ts`

Currently the `trimPayloadForAI` function strips too aggressively. Add these fields back to the trimmed payload for each trial:

- `leadSponsor` -- for sponsor landscape analysis
- `startDate`, `completionDate` -- for timeline analysis
- `studyType` -- interventional vs observational
- `enrollmentCount` -- already included
- `officialTitle` -- useful for precise drug/intervention names
- `secondaryOutcomes` -- keep measure + timeFrame (already done), also keep `classification`

This gives the AI enough data for geographic sponsor analysis, timeline patterns, and enrollment scale without bloating the payload.

---

## 3. Expert-Level Prompt Enrichment

**File:** `supabase/functions/external-ai-analyze/index.ts` -- Rewrite `RESIDENT_PROMPT`

The enhanced prompt will add these analytical dimensions:

### New sections in the output structure:
1. **Executive Summary** (enhanced: include trial count, phase distribution, sponsor diversity)
2. **PICO -- Population (P)** -- Conditions targeted, enrollment scale distribution, healthy volunteers (if data available)
3. **PICO -- Intervention (I)** -- Intervention types, mechanisms, dosing patterns extracted from arm descriptions
4. **PICO -- Comparator (C)** -- (existing, enhanced with sponsor context)
5. **PICO -- Outcomes (O)** -- (existing, enhanced)
6. **Trial Landscape Overview** (NEW):
   - Phase distribution table
   - Status distribution (recruiting/completed/terminated)
   - Sponsor landscape (unique sponsors, industry vs academic)
   - Timeline analysis (date ranges, duration patterns)
   - Enrollment scale analysis
7. **Methodological Observations** (enhanced)
8. **Traceability** (enhanced)

### New mandatory tables:
- **Table C: Trial Landscape Summary** -- NCT | Phase | Status | Sponsor | Enrollment | Start Date
- **Table D: Intervention Mapping** -- NCT | Intervention(s) | Type | Mechanism/Class (if inferable)

### Enhanced formatting rules:
- Use horizontal rules between major sections
- Executive summary must be 4-8 lines, quantified (e.g., "25 trials analyzed, 60% Phase 3, 4 unique sponsors")
- Tables must include all trials, not just examples
- Advanced mode: add sub-analysis by phase grouping

---

## 4. Improve the Analysis Results Presentation (UI)

**File:** `src/components/ExternalAIAnalysisDrawer.tsx`

### 4.1 Enhanced Markdown Renderer
The current `renderMarkdown` function is basic. Enhance it to support:
- **Tables** -- Parse markdown `| col1 | col2 |` syntax and render as proper HTML tables with styling (striped rows, borders, header highlighting)
- **Horizontal rules** (`---`) -- render as `<Separator />`
- **Nested bold/italic** inside table cells
- Better spacing between sections

### 4.2 PDF Export Button
Add a "Download PDF" button alongside the existing "Download .md" button. This will:
- Convert the analysis markdown text into a professional jsPDF document
- Use the same visual style as the existing `pdfReport.ts` (blue headers, grid tables, page numbers)
- Parse the markdown to extract sections, tables, and text blocks
- Render tables as proper `autoTable` grids in the PDF

### 4.3 New helper: `generateAnalysisPdfReport`
**New section in:** `src/lib/pdfReport.ts` (or a new function exported from it)

This function receives the analysis text (markdown string) and metadata (date, AI name, model, trial count) and produces a professional PDF:
- Cover page with "PICO Intelligence Report" title, date, model info
- Parse markdown headings into PDF section titles
- Parse markdown tables into `autoTable` calls
- Parse bullet lists into formatted PDF lists
- Parse bold text
- Page headers/footers with branding
- Disclaimer about AI-generated content

---

## 5. Increase max_tokens for Advanced Mode

**File:** `supabase/functions/external-ai-analyze/index.ts`
- Advanced mode: increase from 4096 to 8192 to accommodate the richer output structure
- Basic mode: increase from 1500 to 2500

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Remove "Proyecto experimental" label |
| `src/components/Footer.tsx` | Remove "experimental" wording |
| `src/components/ExternalAIAnalysisDrawer.tsx` | Remove "externa", add table rendering in markdown, add PDF download button |
| `supabase/functions/external-ai-analyze/index.ts` | Enrich prompt, enrich trimmed payload, increase max_tokens, change default AI name |
| `src/lib/pdfReport.ts` | Add `generateAnalysisPdfReport` function for AI analysis PDF export |

