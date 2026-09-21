import 'server-only';

import { ProviderUnavailableError } from '@/lib/app-error.util';

/**
 * Reorders the vectors of an embeddings response by input position.
 *
 * The APIs do not guarantee array order, only the `index` field. Trusting the
 * order would silently pair one film's vector with another film's id — a bug
 * that never shows up in a test and poisons every subsequent search.
 *
 * @throws {ProviderUnavailableError} if a position's vector is missing.
 */
export function orderByIndex(
  items: readonly { index: number; embedding: number[] }[],
  expected: number,
  provider: string,
): readonly (readonly number[])[] {
  const byIndex = new Map(items.map((item) => [item.index, item.embedding]));

  return Array.from({ length: expected }, (_, position) => {
    const vector = byIndex.get(position);

    if (vector === undefined) {
      throw new ProviderUnavailableError(
        provider,
        `response is missing the vector at index ${String(position)}`,
      );
    }

    return vector;
  });
}
