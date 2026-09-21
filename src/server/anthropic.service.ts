import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { ProviderIndisponivelError } from '@/lib/app-error.util';

import { env } from './env.config';

/**
 * Modelo que assume se o principal recusar por política.
 *
 * Recusa é improvável num produto de cinema, mas uma conversa que morre no meio
 * sem explicação é pior do que uma atendida por um modelo da geração anterior.
 */
export const MODELO_DE_FALLBACK = 'claude-opus-4-8';

export const BETA_DE_FALLBACK = 'server-side-fallback-2026-06-01';

/** Streaming: o teto é generoso porque não há risco de timeout de request. */
export const MAX_TOKENS_DA_CONVERSA = 64_000;

let clienteCache: Anthropic | null = null;

/**
 * Cliente da Messages API.
 *
 * @throws {ProviderIndisponivelError} quando não há ANTHROPIC_API_KEY. Todo o
 *   resto do projeto (ingestão, indexação, exportação) roda sem ela; só o chat não.
 */
export function obterClienteAnthropic(): Anthropic {
  if (env.ANTHROPIC_API_KEY.length === 0) {
    throw new ProviderIndisponivelError(
      'anthropic',
      'ANTHROPIC_API_KEY não configurado — o chat do Indicador precisa dela.',
    );
  }

  clienteCache ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  return clienteCache;
}

export function temCredencialAnthropic(): boolean {
  return env.ANTHROPIC_API_KEY.length > 0;
}
