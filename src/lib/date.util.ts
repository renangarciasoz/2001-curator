/**
 * Serializes an instant in the form every payload in this project carries:
 * ISO 8601 in UTC with an explicit `+00:00` offset.
 *
 * A `Z` suffix would be equally valid RFC 3339, but one single form across all
 * producers is what lets a consumer parse without per-source special cases.
 */
export function toIso8601Utc(instant: Date): string {
  return instant.toISOString().replace('Z', '+00:00');
}
