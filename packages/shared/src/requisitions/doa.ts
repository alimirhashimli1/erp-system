import type { DoaLevel } from './requisition.schemas';

/**
 * Delegation of Authority lookup (ADR 0004): the number of sequential approval levels a
 * PR total needs = the first level whose limit covers it. `null` means the matrix has no
 * covering level (a configuration error). Shared so the UI preview and the API agree.
 */
export function approvalLevelsFor(totalCents: number, matrix: readonly DoaLevel[]): number | null {
  const sorted = [...matrix].sort((a, b) => a.level - b.level);
  const covering = sorted.find((l) => l.maxAmountCents === null || totalCents <= l.maxAmountCents);
  return covering?.level ?? null;
}
