import 'server-only';

import { z } from 'zod';

import { InvalidConfigurationError } from '@/lib/app-error.util';

/**
 * Configuration contract. No secret carries a built-in default: missing keys
 * become empty strings and each service decides whether it can run without one
 * (embeddings fall back to the local provider; the chat does not).
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),

  QDRANT_URL: z.url(),
  QDRANT_API_KEY: z.string().default(''),
  QDRANT_COLLECTION: z.string().min(1).default('films'),

  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5'),

  EMBEDDINGS_PROVIDER: z.enum(['voyage', 'openai', 'local']).default('voyage'),
  VOYAGE_API_KEY: z.string().default(''),
  VOYAGE_MODEL: z.string().min(1).default('voyage-3'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_EMBEDDINGS_MODEL: z.string().min(1).default('text-embedding-3-small'),

  TMDB_ACCESS_TOKEN: z.string().default(''),
  TMDB_LANGUAGE: z.string().min(1).default('pt-BR'),

  APP_CURATION_PASSWORD: z.string().default(''),
  APP_SESSION_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Reads and validates the environment. Fails at startup — never falls back to a
 * baked-in development value.
 *
 * @throws {InvalidConfigurationError} when a required variable is missing.
 */
function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new InvalidConfigurationError(`${detail}. See .env.example.`);
  }

  return result.data;
}

export const env: Env = loadEnv();
