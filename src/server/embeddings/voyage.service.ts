import 'server-only';

import { z } from 'zod';

import { ProviderIndisponivelError } from '@/lib/app-error.util';

import { env } from '../env.config';

import { ordenarPorIndice } from './ordenar-por-indice.util';

import type { ProviderDeEmbeddings, TipoDeTexto } from './embeddings.service';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

/** Dimensões por modelo. Usado para criar a coleção do Qdrant com o tamanho certo. */
const DIMENSOES_POR_MODELO: Readonly<Record<string, number>> = {
  'voyage-3': 1024,
  'voyage-3-lite': 512,
  'voyage-3-large': 1024,
  'voyage-code-3': 1024,
};

const RespostaSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

/** Provider de embeddings da Voyage AI — o recomendado pela Anthropic. */
export function criarProviderVoyage(): ProviderDeEmbeddings {
  const modelo = env.VOYAGE_MODEL;
  const dimensoes = DIMENSOES_POR_MODELO[modelo];

  if (dimensoes === undefined) {
    throw new ProviderIndisponivelError(
      'voyage',
      `dimensões desconhecidas para o modelo "${modelo}". ` +
        `Adicione-o a DIMENSOES_POR_MODELO em voyage.service.ts.`,
    );
  }

  return {
    nome: 'voyage',
    modelo,
    dimensoes,
    gerar: (textos, tipo, signal) => gerar(modelo, textos, tipo, signal),
  };
}

async function gerar(
  modelo: string,
  textos: readonly string[],
  tipo: TipoDeTexto,
  signal?: AbortSignal,
): Promise<readonly (readonly number[])[]> {
  if (env.VOYAGE_API_KEY.length === 0) {
    throw new ProviderIndisponivelError(
      'voyage',
      'VOYAGE_API_KEY não configurado. Use EMBEDDINGS_PROVIDER=local para rodar sem chave.',
    );
  }

  let resposta: Response;

  try {
    resposta = await fetch(VOYAGE_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        input: textos,
        input_type: tipo === 'consulta' ? 'query' : 'document',
      }),
      signal: signal ?? null,
    });
  } catch (e) {
    throw new ProviderIndisponivelError('voyage', 'falha de rede', { cause: e });
  }

  if (!resposta.ok) {
    throw new ProviderIndisponivelError('voyage', `HTTP ${String(resposta.status)}`);
  }

  const resultado = RespostaSchema.safeParse(await resposta.json());

  if (!resultado.success) {
    throw new ProviderIndisponivelError('voyage', 'resposta em formato inesperado');
  }

  return ordenarPorIndice(resultado.data.data, textos.length, 'voyage');
}
