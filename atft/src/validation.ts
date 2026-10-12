import { ALL_GAP_IDS, canonicalAnswers, gapDefinitions, type GapId } from './lessons';

export type { GapId } from './lessons';

const DOTTED_EXPRESSION_GAPS: readonly GapId[] = [
  'response.patient',
  'response.lot',
];

/**
 * Normalize raw input for a given gap according to the gap type and rules.
 * - Trim surrounding whitespace for all inputs.
 * - For the two dotted C# expressions, also remove whitespace around dots.
 * - Preserve case and internal whitespace (except around dots for dotted expressions).
 */
export function normalizeGap(gapId: GapId, raw: string): string {
  let normalized = raw.trim();

  if (DOTTED_EXPRESSION_GAPS.includes(gapId)) {
    normalized = normalized.replace(/\s*\.\s*/g, '.');
  }

  return normalized;
}

export interface ValidationResult {
  valid: boolean;
  isEmpty: boolean;
  feedback: string;
}

/**
 * Validate a raw gap answer.
 * Returns a result with feedback. Empty answers get emptyFeedback.
 * Non-empty, non-matching answers get incorrectFeedback.
 * Answers are compared after normalization.
 */
export function validateGap(gapId: GapId, raw: string): ValidationResult {
  const def = gapDefinitions[gapId];
  if (!def) {
    throw new Error(`Unknown gap ID: ${gapId}`);
  }

  const normalized = normalizeGap(gapId, raw);

  if (normalized.length === 0) {
    return { valid: false, isEmpty: true, feedback: def.emptyFeedback };
  }

  const accepted = canonicalAnswers[gapId];
  if (normalized === accepted) {
    return { valid: true, isEmpty: false, feedback: '' };
  }

  return { valid: false, isEmpty: false, feedback: def.incorrectFeedback };
}

/**
 * Validate every gap in a list. Returns a map of gap IDs to results.
 */
export function validateGaps(
  gapIds: GapId[],
  rawValues: Record<string, string>,
): Record<GapId, ValidationResult> {
  const results = {} as Record<GapId, ValidationResult>;
  for (const gapId of gapIds) {
    results[gapId] = validateGap(gapId, rawValues[gapId] ?? '');
  }
  return results;
}

/**
 * Check whether all provided results are valid.
 */
export function allValid(results: Record<GapId, ValidationResult>): boolean {
  return Object.values(results).every((r) => r.valid);
}

/**
 * Get the first invalid gap ID from a results map, in the order of the provided list.
 */
export function firstInvalidGapId(
  gapIds: GapId[],
  results: Record<GapId, ValidationResult>,
): GapId | undefined {
  return gapIds.find((id) => !results[id]?.valid);
}

/**
 * Sanity check: every known gap has a canonical answer.
 */
export function assertGapCoverage(): void {
  for (const id of ALL_GAP_IDS) {
    if (!(id in canonicalAnswers)) {
      throw new Error(`Missing canonical answer for gap: ${id}`);
    }
  }
}
