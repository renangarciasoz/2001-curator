import 'server-only';

import { z } from 'zod';

import { ProviderUnavailableError } from '@/lib/app-error.util';

import { env } from '../env.config';

import { orderByIndex } from './order-by-index.util';

import type { EmbeddingsProvider, TextKind } from './embeddings.service';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

/** Dimensions per model. Used to create the Qdrant collection at the right size. */
const DIMENSIONS_BY_MODEL: Readonly<Record<string, number>> = {
  'voyage-3': 1024,
  'voyage-3-lite': 512,
  'voyage-3-large': 1024,
  'voyage-code-3': 1024,
};

const ResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

/** Voyage AI embeddings — the provider Anthropic recommends. */
export function createVoyageProvider(): EmbeddingsProvider {
  const model = env.VOYAGE_MODEL;
  const dimensions = DIMENSIONS_BY_MODEL[model];

  if (dimensions === undefined) {
    throw new ProviderUnavailableError(
      'voyage',
      `unknown dimensions for model "${model}". ` +
        `Add it to DIMENSIONS_BY_MODEL in voyage.service.ts.`,
    );
  }

  return {
    name: 'voyage',
    model,
    dimensions,
    generate: (texts, kind, signal) => generate(model, texts, kind, signal),
  };
}

async function generate(
  model: string,
  texts: readonly string[],
  kind: TextKind,
  signal?: AbortSignal,
): Promise<readonly (readonly number[])[]> {
  if (env.VOYAGE_API_KEY.length === 0) {
    throw new ProviderUnavailableError(
      'voyage',
      'VOYAGE_API_KEY is not configured. Use EMBEDDINGS_PROVIDER=local to run without a key.',
    );
  }

  let response: Response;

  try {
    response = await fetch(VOYAGE_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: texts,
        input_type: kind === 'query' ? 'query' : 'document',
      }),
      signal: signal ?? null,
    });
  } catch (e) {
    throw new ProviderUnavailableError('voyage', 'network failure', { cause: e });
  }

  if (!response.ok) {
    throw new ProviderUnavailableError('voyage', `HTTP ${String(response.status)}`);
  }

  const result = ResponseSchema.safeParse(await response.json());

  if (!result.success) {
    throw new ProviderUnavailableError('voyage', 'unexpected response shape');
  }

  return orderByIndex(result.data.data, texts.length, 'voyage');
}
