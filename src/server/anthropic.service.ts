import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { ProviderUnavailableError } from '@/lib/app-error.util';

import { env } from './env.config';

/**
 * Model that takes over if the primary one declines on policy grounds.
 *
 * A refusal is unlikely in a film product, but a conversation that dies
 * mid-turn with no explanation is worse than one served by the previous
 * generation of the model.
 */
export const FALLBACK_MODEL = 'claude-opus-4-8';

export const FALLBACK_BETA = 'server-side-fallback-2026-06-01';

/** Streaming: the ceiling is generous because there is no request-timeout risk. */
export const CONVERSATION_MAX_TOKENS = 64_000;

let cachedClient: Anthropic | null = null;

/**
 * Messages API client.
 *
 * @throws {ProviderUnavailableError} when ANTHROPIC_API_KEY is missing.
 *   Everything else in the project (ingestion, indexing, export) runs without
 *   it; only the chat does not.
 */
export function getAnthropicClient(): Anthropic {
  if (env.ANTHROPIC_API_KEY.length === 0) {
    throw new ProviderUnavailableError(
      'anthropic',
      'ANTHROPIC_API_KEY is not configured — the Indicador chat needs it.',
    );
  }

  cachedClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  return cachedClient;
}

export function hasAnthropicCredential(): boolean {
  return env.ANTHROPIC_API_KEY.length > 0;
}
