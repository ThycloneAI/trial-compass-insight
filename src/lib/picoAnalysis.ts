/**
 * PICO Analysis Utilities
 * Deterministic calculations for HTA-style PICO reading
 */

import { Trial, Arm, Outcome } from './api';

// ============= TYPES =============

export interface ComparatorAnalysis {
  predominantComparator: 'placebo' | 'soc' | 'active' | 'add-on' | 'mixed' | 'not_evaluable';
  hasDirectActiveComparator: boolean | null;
  addOnDesigns: 'not_present' | 'minority' | 'relevant' | 'predominant' | 'not_evaluable';
  phaseConsistency: 'consistent' | 'changes' | 'not_evaluable';
  structuralNote: string;
}

export interface EndpointAnalysis {
  dominantPrimaryEndpoint: 'OS' | 'PFS' | 'ORR' | 'other_surrogate' | 'PRO' | 'safety' | 'mixed' | 'not_evaluable';
  hasHardClinicalPrimary: boolean | null;
  surrogateUsage: 'no' | 'secondary' | 'primary_predominant' | 'not_evaluable';
  prosPresence: 'not_present' | 'secondary' | 'relevant' | 'not_evaluable';
  endpointConsistency: 'high' | 'moderate' | 'low' | 'not_evaluable';
  structuralNote: string;
}

export interface PicoAnalysis {
  comparator: ComparatorAnalysis;
  endpoint: EndpointAnalysis;
  totalTrials: number;
}

// ============= THRESHOLDS =============

const THRESHOLD_PREDOMINANT = 0.50; // >50%
const THRESHOLD_RELEVANT = 0.20;    // 20-50%
const THRESHOLD_CONSISTENCY_HIGH = 0.75;   // >75%
const THRESHOLD_CONSISTENCY_MODERATE = 0.40; // 40-75%

// ============= COMPARATOR ANALYSIS =============

type ComparatorType = 'placebo' | 'soc' | 'active' | 'add-on' | 'no_intervention' | 'unknown';

function normalizeControlType(controlType: string | undefined | null): ComparatorType {
  if (!controlType) return 'unknown';

  const lower = controlType.toLowerCase();

  if (lower.includes('placebo') || lower.includes('sham')) {
    return 'placebo';
  }
  if (lower.includes('standard') || lower.includes('soc') || lower.includes('best supportive') ||
      lower.includes('usual care') || lower.includes('routine care') || lower.includes('best available') ||
      lower.includes("investigator's choice") || lower.includes("physician's choice") ||
      lower.includes('current standard')) {
    return 'soc';
  }
  if (lower.includes('active') || lower.includes('comparator drug') || lower.includes('active comparator') ||
      lower.includes('active control')) {
    return 'active';
  }
  if (lower.includes('add-on') || lower.includes('addon') || lower.includes('adjunct')) {
    return 'add-on';
  }
  if (lower.includes('no intervention') || lower.includes('none') || lower.includes('no_intervention')) {
    return 'no_intervention';
  }

  return 'unknown';
}

function detectAddOnDesign(arm: Arm): boolean {
  const desc = (arm.description || '').toLowerCase();
  const label = (arm.label || '').toLowerCase();
  const text = `${desc} ${label}`;

  const addOnPatterns = [
    'add-on', 'addon', 'plus', '+ ', 'in combination', 'added to',
    'on top of', 'adjunct', 'background therapy', 'plus standard',
    'combination with', 'concomitant', 'combined with', 'together with',
    'in addition to', 'supplemented with', 'co-administered', 'coadministered',
    'backbone', 'base therapy', 'underlying therapy',
  ];

  return addOnPatterns.some(pattern => text.includes(pattern));
}

function analyzeComparators(trials: Trial[]): ComparatorAnalysis {
  if (!trials || trials.length === 0) {
    return {
      predominantComparator: 'not_evaluable',
      hasDirectActiveComparator: null,
      addOnDesigns: 'not_evaluable',
      phaseConsistency: 'not_evaluable',
      structuralNote: 'No evaluable con los datos disponibles.',
    };
  }

  const totalTrials = trials.length;
  const comparatorCounts: Record<ComparatorType, number> = {
    placebo: 0,
    soc: 0,
    active: 0,
    'add-on': 0,
    no_intervention: 0,
    unknown: 0,
  };
  
  let trialsWithAddOn = 0;
  let trialsWithActiveComparator = 0;
  const comparatorByPhase: Record<string, ComparatorType[]> = {};

  for (const trial of trials) {
    const arms = trial.arms || [];
    let trialHasAddOn = false;
    let trialComparatorTypes: ComparatorType[] = [];

    for (const arm of arms) {
      // Detect add-on designs
      if (detectAddOnDesign(arm)) {
        trialHasAddOn = true;
      }

      // Analyze control arms
      if (arm.isControl || arm.type?.toLowerCase().includes('comparator') || 
          arm.type?.toLowerCase().includes('control') || 
          arm.type?.toLowerCase().includes('placebo')) {
        const controlType = normalizeControlType(arm.controlType || arm.type);
        trialComparatorTypes.push(controlType);
        
        if (controlType === 'active') {
          trialsWithActiveComparator++;
        }
      }
    }

    // Count predominant comparator per trial
    if (trialComparatorTypes.length > 0) {
      // Get the most specific comparator type for this trial
      const priorityOrder: ComparatorType[] = ['active', 'soc', 'placebo', 'add-on', 'no_intervention', 'unknown'];
      const primaryComparator = priorityOrder.find(type => trialComparatorTypes.includes(type)) || 'unknown';
      comparatorCounts[primaryComparator]++;
      
      // Track by phase
      const phase = normalizePhase(trial.phase);
      if (!comparatorByPhase[phase]) {
        comparatorByPhase[phase] = [];
      }
      comparatorByPhase[phase].push(primaryComparator);
    }

    if (trialHasAddOn) {
      trialsWithAddOn++;
    }
  }

  // Determine predominant comparator
  const validTotal = Object.entries(comparatorCounts)
    .filter(([key]) => key !== 'unknown')
    .reduce((sum, [, count]) => sum + count, 0);
  
  let predominantComparator: ComparatorAnalysis['predominantComparator'] = 'not_evaluable';
  
  if (validTotal > 0) {
    const maxCount = Math.max(
      comparatorCounts.placebo,
      comparatorCounts.soc,
      comparatorCounts.active,
      comparatorCounts['add-on']
    );
    
    const proportion = maxCount / validTotal;
    
    if (proportion > THRESHOLD_PREDOMINANT) {
      if (maxCount === comparatorCounts.placebo) predominantComparator = 'placebo';
      else if (maxCount === comparatorCounts.soc) predominantComparator = 'soc';
      else if (maxCount === comparatorCounts.active) predominantComparator = 'active';
      else if (maxCount === comparatorCounts['add-on']) predominantComparator = 'add-on';
    } else {
      predominantComparator = 'mixed';
    }
  }

  // Determine add-on design prevalence
  let addOnDesigns: ComparatorAnalysis['addOnDesigns'] = 'not_evaluable';
  if (totalTrials > 0) {
    const addOnProportion = trialsWithAddOn / totalTrials;
    if (addOnProportion === 0) addOnDesigns = 'not_present';
    else if (addOnProportion < THRESHOLD_RELEVANT) addOnDesigns = 'minority';
    else if (addOnProportion <= THRESHOLD_PREDOMINANT) addOnDesigns = 'relevant';
    else addOnDesigns = 'predominant';
  }

  // Determine phase consistency
  let phaseConsistency: ComparatorAnalysis['phaseConsistency'] = 'not_evaluable';
  const phases = Object.keys(comparatorByPhase);
  
  if (phases.length > 1) {
    const phaseComparatorTypes = phases.map(phase => {
      const types = comparatorByPhase[phase];
      // Get most common type in this phase
      const typeCounts = types.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    }).filter(Boolean);
    
    const uniqueTypes = new Set(phaseComparatorTypes);
    phaseConsistency = uniqueTypes.size === 1 ? 'consistent' : 'changes';
  } else if (phases.length === 1) {
    phaseConsistency = 'consistent';
  }

  // Generate structural note
  const structuralNote = generateComparatorNote(
    predominantComparator,
    trialsWithActiveComparator > 0,
    addOnDesigns,
    totalTrials
  );

  return {
    predominantComparator,
    hasDirectActiveComparator: trialsWithActiveComparator > 0,
    addOnDesigns,
    phaseConsistency,
    structuralNote,
  };
}

function generateComparatorNote(
  predominant: ComparatorAnalysis['predominantComparator'],
  hasActive: boolean,
  addOn: ComparatorAnalysis['addOnDesigns'],
  totalTrials: number
): string {
  if (predominant === 'not_evaluable') {
    return 'No evaluable con los datos disponibles.';
  }

  const parts: string[] = [];

  // Main comparator pattern
  switch (predominant) {
    case 'placebo':
      parts.push('La evidencia se apoya mayoritariamente en comparaciones frente a placebo');
      break;
    case 'soc':
      parts.push('La evidencia se basa principalmente en comparaciones frente a tratamiento estándar');
      break;
    case 'active':
      parts.push('Los ensayos incluyen comparadores activos directos');
      break;
    case 'add-on':
      parts.push('Los diseños add-on sobre terapia base son predominantes');
      break;
    case 'mixed':
      parts.push('La evidencia presenta heterogeneidad en los comparadores utilizados');
      break;
  }

  // Add-on presence
  if (addOn === 'relevant' || addOn === 'minority') {
    parts.push(', con presencia limitada de diseños add-on');
  } else if (addOn === 'predominant') {
    parts.push(', mayoritariamente en diseño add-on');
  }

  // Active comparator note
  if (hasActive && predominant !== 'active') {
    parts.push('. Existen comparaciones activas directas en parte de la evidencia');
  }

  return parts.join('') + '.';
}

// ============= ENDPOINT ANALYSIS =============

type EndpointType = 'OS' | 'PFS' | 'DFS' | 'EFS' | 'RFS' | 'TTP' | 'TTF' | 'ORR' | 'CR' | 'pCR' | 'CBR' | 'DCR' | 'DOR' | 'MRD' | 'PRO' | 'safety' | 'biomarker' | 'PKPD' | 'other';

const HARD_CLINICAL_ENDPOINTS: EndpointType[] = ['OS'];
const SURROGATE_ENDPOINTS: EndpointType[] = ['PFS', 'DFS', 'EFS', 'RFS', 'TTP', 'TTF', 'ORR', 'CR', 'pCR', 'CBR', 'DCR', 'DOR', 'MRD'];

function classifyEndpoint(classification: string | undefined): EndpointType {
  if (!classification) return 'other';

  const upper = classification.toUpperCase();

  if (upper === 'OS') return 'OS';
  if (upper === 'PFS') return 'PFS';
  if (upper === 'DFS') return 'DFS';
  if (upper === 'EFS') return 'EFS';
  if (upper === 'RFS') return 'RFS';
  if (upper === 'TTP') return 'TTP';
  if (upper === 'TTF') return 'TTF';
  if (upper === 'ORR') return 'ORR';
  if (upper === 'CR') return 'CR';
  if (upper === 'PCR') return 'pCR';
  if (upper === 'CBR') return 'CBR';
  if (upper === 'DCR') return 'DCR';
  if (upper === 'DOR') return 'DOR';
  if (upper === 'MRD') return 'MRD';
  if (upper.includes('QOL') || upper.includes('PRO')) return 'PRO';
  if (upper === 'SAFETY') return 'safety';
  if (upper === 'BIOMARKER') return 'biomarker';
  if (upper === 'PK/PD') return 'PKPD';
  if (upper === 'RESOURCE USE') return 'other'; // Counts as other for PICO

  return 'other';
}

function analyzeEndpoints(trials: Trial[]): EndpointAnalysis {
  if (!trials || trials.length === 0) {
    return {
      dominantPrimaryEndpoint: 'not_evaluable',
      hasHardClinicalPrimary: null,
      surrogateUsage: 'not_evaluable',
      prosPresence: 'not_evaluable',
      endpointConsistency: 'not_evaluable',
      structuralNote: 'No evaluable con los datos disponibles.',
    };
  }

  const totalTrials = trials.length;
  const primaryEndpointCounts: Record<EndpointType, number> = {
    OS: 0, PFS: 0, DFS: 0, EFS: 0, RFS: 0, TTP: 0, TTF: 0,
    ORR: 0, CR: 0, pCR: 0, CBR: 0, DCR: 0, DOR: 0, MRD: 0,
    PRO: 0, safety: 0, biomarker: 0, PKPD: 0, other: 0
  };
  
  let trialsWithHardPrimary = 0;
  let trialsWithSurrogatePrimary = 0;
  let trialsWithSurrogateSecondary = 0;
  let trialsWithPRO = 0;
  let trialsWithPROAsPrimary = 0;
  
  const primaryEndpointsByTrial: EndpointType[][] = [];

  for (const trial of trials) {
    const primaryOutcomes = trial.primaryOutcomes || [];
    const secondaryOutcomes = trial.secondaryOutcomes || [];
    
    const trialPrimaryTypes: EndpointType[] = [];
    let trialHasHardPrimary = false;
    let trialHasSurrogatePrimary = false;
    let trialHasPRO = false;
    let trialHasPROPrimary = false;
    
    // Analyze primary outcomes
    for (const outcome of primaryOutcomes) {
      const type = classifyEndpoint(outcome.classification);
      trialPrimaryTypes.push(type);
      primaryEndpointCounts[type]++;
      
      if (HARD_CLINICAL_ENDPOINTS.includes(type)) {
        trialHasHardPrimary = true;
      }
      if (SURROGATE_ENDPOINTS.includes(type)) {
        trialHasSurrogatePrimary = true;
      }
      if (type === 'PRO') {
        trialHasPROPrimary = true;
        trialHasPRO = true;
      }
    }
    
    // Analyze secondary outcomes for PROs and surrogates
    for (const outcome of secondaryOutcomes) {
      const type = classifyEndpoint(outcome.classification);
      
      if (SURROGATE_ENDPOINTS.includes(type)) {
        trialsWithSurrogateSecondary++;
        break; // Count trial once
      }
      if (type === 'PRO') {
        trialHasPRO = true;
      }
    }
    
    if (trialHasHardPrimary) trialsWithHardPrimary++;
    if (trialHasSurrogatePrimary) trialsWithSurrogatePrimary++;
    if (trialHasPRO) trialsWithPRO++;
    if (trialHasPROPrimary) trialsWithPROAsPrimary++;
    
    primaryEndpointsByTrial.push(trialPrimaryTypes);
  }

  // Determine dominant primary endpoint
  const totalPrimaryEndpoints = Object.values(primaryEndpointCounts).reduce((a, b) => a + b, 0);
  let dominantPrimaryEndpoint: EndpointAnalysis['dominantPrimaryEndpoint'] = 'not_evaluable';
  
  if (totalPrimaryEndpoints > 0) {
    // Group related endpoints into summary categories for dominance calculation
    const groupedCounts = {
      OS: primaryEndpointCounts.OS,
      PFS: primaryEndpointCounts.PFS + primaryEndpointCounts.DFS + primaryEndpointCounts.EFS + primaryEndpointCounts.RFS + primaryEndpointCounts.TTP + primaryEndpointCounts.TTF,
      ORR: primaryEndpointCounts.ORR + primaryEndpointCounts.CR + primaryEndpointCounts.pCR + primaryEndpointCounts.CBR + primaryEndpointCounts.DCR + primaryEndpointCounts.DOR + primaryEndpointCounts.MRD,
      PRO: primaryEndpointCounts.PRO,
      safety: primaryEndpointCounts.safety,
      other: primaryEndpointCounts.biomarker + primaryEndpointCounts.PKPD + primaryEndpointCounts.other,
    };

    const maxGroupCount = Math.max(...Object.values(groupedCounts));
    const maxGroup = Object.entries(groupedCounts).find(([, count]) => count === maxGroupCount)?.[0];
    const proportion = maxGroupCount / totalPrimaryEndpoints;

    if (proportion > THRESHOLD_PREDOMINANT) {
      if (maxGroup === 'OS') dominantPrimaryEndpoint = 'OS';
      else if (maxGroup === 'PFS') dominantPrimaryEndpoint = 'PFS';
      else if (maxGroup === 'ORR') dominantPrimaryEndpoint = 'ORR';
      else if (maxGroup === 'PRO') dominantPrimaryEndpoint = 'PRO';
      else if (maxGroup === 'safety') dominantPrimaryEndpoint = 'safety';
      else dominantPrimaryEndpoint = 'other_surrogate';
    } else {
      dominantPrimaryEndpoint = 'mixed';
    }
  }

  // Has hard clinical primary
  const hasHardClinicalPrimary = trialsWithHardPrimary > 0;

  // Surrogate usage
  let surrogateUsage: EndpointAnalysis['surrogateUsage'] = 'not_evaluable';
  if (totalTrials > 0) {
    const surrogatePrimaryProportion = trialsWithSurrogatePrimary / totalTrials;
    
    if (surrogatePrimaryProportion > THRESHOLD_PREDOMINANT) {
      surrogateUsage = 'primary_predominant';
    } else if (trialsWithSurrogateSecondary > 0 || trialsWithSurrogatePrimary > 0) {
      surrogateUsage = surrogatePrimaryProportion > 0 ? 'primary_predominant' : 'secondary';
    } else {
      surrogateUsage = 'no';
    }
  }

  // PRO presence
  let prosPresence: EndpointAnalysis['prosPresence'] = 'not_evaluable';
  if (totalTrials > 0) {
    const proProportion = trialsWithPRO / totalTrials;
    
    if (proProportion === 0) {
      prosPresence = 'not_present';
    } else if (trialsWithPROAsPrimary > 0 || proProportion >= THRESHOLD_RELEVANT) {
      prosPresence = 'relevant';
    } else {
      prosPresence = 'secondary';
    }
  }

  // Endpoint consistency
  let endpointConsistency: EndpointAnalysis['endpointConsistency'] = 'not_evaluable';
  if (primaryEndpointsByTrial.length > 0) {
    // Check how consistent the primary endpoint types are across trials
    const dominantTypes = primaryEndpointsByTrial.map(types => {
      if (types.length === 0) return 'other';
      // Get most common type
      const counts = types.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    });
    
    const mostCommonDominant = dominantTypes.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const maxConsistency = Math.max(...Object.values(mostCommonDominant)) / primaryEndpointsByTrial.length;
    
    if (maxConsistency >= THRESHOLD_CONSISTENCY_HIGH) {
      endpointConsistency = 'high';
    } else if (maxConsistency >= THRESHOLD_CONSISTENCY_MODERATE) {
      endpointConsistency = 'moderate';
    } else {
      endpointConsistency = 'low';
    }
  }

  // Generate structural note
  const structuralNote = generateEndpointNote(
    dominantPrimaryEndpoint,
    hasHardClinicalPrimary,
    surrogateUsage,
    prosPresence
  );

  return {
    dominantPrimaryEndpoint,
    hasHardClinicalPrimary,
    surrogateUsage,
    prosPresence,
    endpointConsistency,
    structuralNote,
  };
}

function generateEndpointNote(
  dominant: EndpointAnalysis['dominantPrimaryEndpoint'],
  hasHard: boolean,
  surrogate: EndpointAnalysis['surrogateUsage'],
  pros: EndpointAnalysis['prosPresence']
): string {
  if (dominant === 'not_evaluable') {
    return 'No evaluable con los datos disponibles.';
  }

  const parts: string[] = [];

  // Main endpoint pattern
  switch (dominant) {
    case 'OS':
      parts.push('Los ensayos utilizan supervivencia global como variable primaria');
      break;
    case 'PFS':
      parts.push('Los ensayos utilizan supervivencia libre de progresión como variable primaria');
      break;
    case 'ORR':
      parts.push('La tasa de respuesta objetiva predomina como variable primaria');
      break;
    case 'PRO':
      parts.push('Los resultados reportados por pacientes son el endpoint primario principal');
      break;
    case 'safety':
      parts.push('Los ensayos se centran en endpoints de seguridad como variable primaria');
      break;
    case 'other_surrogate':
      parts.push('Los ensayos utilizan mayoritariamente endpoints subrogados como variable primaria');
      break;
    case 'mixed':
      parts.push('Existe heterogeneidad en los endpoints primarios utilizados');
      break;
  }

  // Surrogate note
  if (surrogate === 'primary_predominant' && dominant !== 'OS') {
    parts.push(', con predominio de endpoints subrogados');
  }

  // Hard endpoint note
  if (hasHard && dominant !== 'OS') {
    parts.push('. Supervivencia global está presente en parte de la evidencia');
  }

  // PRO note
  if (pros === 'relevant' && dominant !== 'PRO') {
    parts.push('. Los PROs tienen presencia relevante');
  } else if (pros === 'secondary') {
    parts.push('. Los PROs aparecen como endpoints secundarios');
  }

  return parts.join('') + '.';
}

// ============= HELPER FUNCTIONS =============

function normalizePhase(phase: string | undefined): string {
  if (!phase) return 'unknown';
  
  const lower = phase.toLowerCase();
  
  if (lower.includes('1') && lower.includes('2')) return 'Phase 1/2';
  if (lower.includes('2') && lower.includes('3')) return 'Phase 2/3';
  if (lower.includes('1')) return 'Phase 1';
  if (lower.includes('2')) return 'Phase 2';
  if (lower.includes('3')) return 'Phase 3';
  if (lower.includes('4')) return 'Phase 4';
  
  return 'unknown';
}

// ============= MAIN EXPORT =============

/**
 * Analyzes a set of trials from a PICO/HTA perspective
 * Returns deterministic analysis based solely on structured data
 */
export function analyzePico(trials: Trial[]): PicoAnalysis {
  return {
    comparator: analyzeComparators(trials),
    endpoint: analyzeEndpoints(trials),
    totalTrials: trials.length,
  };
}

/**
 * Analyzes a single trial from a PICO/HTA perspective
 */
export function analyzeSingleTrialPico(trial: Trial): PicoAnalysis {
  return analyzePico([trial]);
}

// ============= LABEL HELPERS =============

export const COMPARATOR_LABELS: Record<ComparatorAnalysis['predominantComparator'], string> = {
  placebo: 'Placebo',
  soc: 'Tratamiento estándar (SOC)',
  active: 'Comparador activo',
  'add-on': 'Add-on sobre SOC',
  mixed: 'Mixto',
  not_evaluable: 'No evaluable',
};

export const ADDON_LABELS: Record<ComparatorAnalysis['addOnDesigns'], string> = {
  not_present: 'No presentes',
  minority: 'Minoritarios',
  relevant: 'Relevantes',
  predominant: 'Predominantes',
  not_evaluable: 'No evaluable',
};

export const CONSISTENCY_LABELS: Record<ComparatorAnalysis['phaseConsistency'] | EndpointAnalysis['endpointConsistency'], string> = {
  consistent: 'Consistente entre fases',
  changes: 'Cambia entre fases',
  high: 'Alta',
  moderate: 'Moderada',
  low: 'Baja',
  not_evaluable: 'No evaluable',
};

export const ENDPOINT_LABELS: Record<EndpointAnalysis['dominantPrimaryEndpoint'], string> = {
  OS: 'Supervivencia Global (OS)',
  PFS: 'Supervivencia Libre de Progresión (PFS)',
  ORR: 'Tasa de Respuesta Objetiva (ORR)',
  other_surrogate: 'Otro subrogado',
  PRO: 'PRO (calidad de vida)',
  safety: 'Seguridad',
  mixed: 'Mixto',
  not_evaluable: 'No evaluable',
};

export const SURROGATE_LABELS: Record<EndpointAnalysis['surrogateUsage'], string> = {
  no: 'No',
  secondary: 'Como secundarios',
  primary_predominant: 'Como primarios predominantes',
  not_evaluable: 'No evaluable',
};

export const PRO_LABELS: Record<EndpointAnalysis['prosPresence'], string> = {
  not_present: 'No presentes',
  secondary: 'Secundarios',
  relevant: 'Relevantes',
  not_evaluable: 'No evaluable',
};
