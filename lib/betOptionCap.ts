/**
 * Max distinct bet options per round.
 * - Boards ≤3 (Teen Patti / Lucky 777): leave 1 uncovered → 2/3
 * - Larger boards: leave ≥2 uncovered (existing house rule)
 */
export function maxBetOptions(optionCount: number): number {
  if (optionCount <= 1) return Math.max(0, optionCount);
  if (optionCount <= 3) return optionCount - 1;
  return optionCount - 2;
}

/** True if placing on optionId would exceed the distinct-option cap. */
export function wouldExceedOptionCap(
  currentBets: Record<string, number>,
  optionId: string,
  optionCount: number,
): boolean {
  if ((currentBets[optionId] || 0) > 0) return false; // topping up same option OK
  const distinct = Object.keys(currentBets).filter((k) => (currentBets[k] || 0) > 0)
    .length;
  return distinct >= maxBetOptions(optionCount);
}

export function betCapToast(optionCount: number): string {
  const max = maxBetOptions(optionCount);
  const leave = optionCount - max;
  return `Max ${max}/${optionCount} options this round (leave ${leave} uncovered)`;
}

export function parseBetRpcError(
  error: string | { message?: string } | null | undefined,
): string {
  const raw =
    typeof error === 'string' ? error : error?.message || 'Bet failed';
  const m = raw.match(/MAX_OPTIONS:\s*(.+)$/i);
  if (m?.[1]) return m[1].trim();
  if (/at most \d+ of \d+ options/i.test(raw) || /leave \d+/i.test(raw)) {
    return raw.replace(/^.*?(You can bet on)/i, '$1');
  }
  return raw;
}
