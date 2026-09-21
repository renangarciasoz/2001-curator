import 'server-only';

import { env } from '../env.config';

import { createLocalProvider } from './local.service';
import { createOpenaiProvider } from './openai.service';
import { createVoyageProvider } from './voyage.service';

/**
 * Indexed text is a document; a search request is a query. Several providers
 * ask for that distinction and return better vectors when it is given.
 */
export type TextKind = 'document' | 'query';

export type EmbeddingsProvider = {
  /** Short provider id, stored alongside the vector to trace its origin. */
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  generate(
    texts: readonly string[],
    kind: TextKind,
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]>;
};

/**
 * Picks the embeddings provider declared in `EMBEDDINGS_PROVIDER`.
 *
 * The `local` provider does no network calls and exists only so the project
 * runs without a key — its semantic search quality is far below a real model's.
 */
export function getEmbeddingsProvider(): EmbeddingsProvider {
  switch (env.EMBEDDINGS_PROVIDER) {
    case 'voyage':
      return createVoyageProvider();
    case 'openai':
      return createOpenaiProvider();
    case 'local':
      return createLocalProvider();
    default: {
      const exhaustive: never = env.EMBEDDINGS_PROVIDER;
      throw new Error(`unhandled embeddings provider: ${exhaustive as string}`);
    }
  }
}
