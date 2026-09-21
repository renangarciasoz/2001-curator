import 'server-only';

import { z } from 'zod';

import { ProviderUnavailableError } from '@/lib/app-error.util';

import { env } from '../env.config';

import { orderByIndex } from './order-by-index.util';

import type { EmbeddingsProvider } from './embeddings.service';

const OPENAI_URL = 'https://api.openai.com/v1/embeddings';

const DIMENSIONS_BY_MODEL: Readonly<Record<string, number>> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

const ResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

/** Alternative to Voyage. Same interface: switching is one environment variable. */
export function createOpenaiProvider(): EmbeddingsProvider {
  const model = env.OPENAI_EMBEDDINGS_MODEL;
  const dimensions = DIMENSIONS_BY_MODEL[model];

  if (dimensions === undefined) {
    throw new ProviderUnavailableError(
      'openai',
      `unknown dimensions for model "${model}". ` +
        `Add it to DIMENSIONS_BY_MODEL in openai.service.ts.`,
    );
  }

  return {
    name: 'openai',
    model,
    dimensions,
    generate: (texts, _kind, signal) => generate(model, texts, signal),
  };
}

async function generate(
  model: string,
  texts: readonly string[],
  signal?: AbortSignal,
): Promise<readonly (readonly number[])[]> {
  if (env.OPENAI_API_KEY.length === 0) {
    throw new ProviderUnavailableError(
      'openai',
      'OPENAI_API_KEY is not configured. Use EMBEDDINGS_PROVIDER=local to run without a key.',
    );
  }

  let response: Response;

  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: texts }),
      signal: signal ?? null,
    });
  } catch (e) {
    throw new ProviderUnavailableError('openai', 'network failure', { cause: e });
  }

  if (!response.ok) {
    throw new ProviderUnavailableError('openai', `HTTP ${String(response.status)}`);
  }

  const result = ResponseSchema.safeParse(await response.json());

  if (!result.success) {
    throw new ProviderUnavailableError('openai', 'unexpected response shape');
  }

  return orderByIndex(result.data.data, texts.length, 'openai');
}
