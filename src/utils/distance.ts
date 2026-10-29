/** Do not coerce missing/null/string distances into a misleading numeric label. */
export function isValidDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
