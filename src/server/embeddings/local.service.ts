import 'server-only';

import type { EmbeddingsProvider } from './embeddings.service';

const DIMENSIONS = 1024;
const MIN_TOKEN_LENGTH = 3;

/**
 * Deterministic offline fallback: signed projection of unigrams and bigrams
 * into a 1024-dimension space, L2-normalised.
 *
 * It exists so the project can start and be demonstrated with no API key at
 * all. It approximates vocabulary overlap, not meaning — which is the opposite
 * of what the Method asks of search ("by tone and theme, not by keyword").
 * Never use it to index the real archive; switch `EMBEDDINGS_PROVIDER` first.
 */
export function createLocalProvider(): EmbeddingsProvider {
  return {
    name: 'local',
    model: 'hash-projection-1024',
    dimensions: DIMENSIONS,
    generate(texts) {
      return Promise.resolve(texts.map((text) => project(tokenize(text))));
    },
  };
}

function tokenize(text: string): readonly string[] {
  return (
    text
      .normalize('NFD')
      // Strips the diacritics NFD split off (Combining Diacritical Marks block).
      .replace(/[̀-ͯ]/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH)
  );
}

function project(tokens: readonly string[]): readonly number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);

  for (const [position, token] of tokens.entries()) {
    accumulate(vector, token, 1);

    const next = tokens[position + 1];

    if (next !== undefined) {
      // A bigram weighs less than the token alone, but captures some order.
      accumulate(vector, `${token}_${next}`, 0.5);
    }
  }

  return normalize(vector);
}

function accumulate(vector: number[], term: string, weight: number): void {
  const hash = fnv1a(term);
  const index = hash % DIMENSIONS;
  const sign = hash >>> 31 === 0 ? 1 : -1;

  vector[index] = (vector[index] ?? 0) + sign * weight;
}

function normalize(vector: readonly number[]): readonly number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

/** 32-bit FNV-1a — cheap, deterministic and stable across processes. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}
