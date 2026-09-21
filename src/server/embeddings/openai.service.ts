import 'server-only';

import { z } from 'zod';

import { ProviderIndisponivelError } from '@/lib/app-error.util';

import { env } from '../env.config';

import { ordenarPorIndice } from './ordenar-por-indice.util';

import type { ProviderDeEmbeddings } from './embeddings.service';

const OPENAI_URL = 'https://api.openai.com/v1/embeddings';

const DIMENSOES_POR_MODELO: Readonly<Record<string, number>> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

const RespostaSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

/** Alternativa à Voyage. Mesma interface: trocar é mudar uma variável de ambiente. */
export function criarProviderOpenai(): ProviderDeEmbeddings {
  const modelo = env.OPENAI_EMBEDDINGS_MODEL;
  const dimensoes = DIMENSOES_POR_MODELO[modelo];

  if (dimensoes === undefined) {
    throw new ProviderIndisponivelError(
      'openai',
      `dimensões desconhecidas para o modelo "${modelo}". ` +
        `Adicione-o a DIMENSOES_POR_MODELO em openai.service.ts.`,
    );
  }

  return {
    nome: 'openai',
    modelo,
    dimensoes,
    gerar: (textos, _tipo, signal) => gerar(modelo, textos, signal),
  };
}

async function gerar(
  modelo: string,
  textos: readonly string[],
  signal?: AbortSignal,
): Promise<readonly (readonly number[])[]> {
  if (env.OPENAI_API_KEY.length === 0) {
    throw new ProviderIndisponivelError(
      'openai',
      'OPENAI_API_KEY não configurado. Use EMBEDDINGS_PROVIDER=local para rodar sem chave.',
    );
  }

  let resposta: Response;

  try {
    resposta = await fetch(OPENAI_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelo, input: textos }),
      signal: signal ?? null,
    });
  } catch (e) {
    throw new ProviderIndisponivelError('openai', 'falha de rede', { cause: e });
  }

  if (!resposta.ok) {
    throw new ProviderIndisponivelError('openai', `HTTP ${String(resposta.status)}`);
  }

  const resultado = RespostaSchema.safeParse(await resposta.json());

  if (!resultado.success) {
    throw new ProviderIndisponivelError('openai', 'resposta em formato inesperado');
  }

  return ordenarPorIndice(resultado.data.data, textos.length, 'openai');
}
