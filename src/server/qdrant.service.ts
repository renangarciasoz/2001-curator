import 'server-only';

import { QdrantClient } from '@qdrant/js-client-rest';

import { AppError, ProviderIndisponivelError, descreverErro } from '@/lib/app-error.util';

import { env } from './env.config';

/** O que fica no Qdrant além do vetor: só o suficiente para filtrar antes do banco. */
export type PayloadDoFilme = {
  titulo: string;
  ano: number | null;
  categoria_acervo: string | null;
  registro_comercial: string | null;
  tom_emocional: string | null;
  /** Qual provider gerou este vetor. Vetores de providers diferentes não se comparam. */
  provider: string;
  modelo: string;
};

export type PontoDeFilme = {
  filmeId: string;
  vetor: readonly number[];
  payload: PayloadDoFilme;
};

export type FiltroDeBusca = {
  categoriaAcervo?: string;
  registroComercial?: string;
  anoMinimo?: number;
  anoMaximo?: number;
};

export type CandidatoDaBusca = {
  filmeId: string;
  proximidade: number;
};

/** Divergência entre o índice existente e o provider configurado agora. */
export class IndiceIncompativelError extends AppError {
  constructor(detalhe: string) {
    super('indice_incompativel', detalhe);
  }
}

let clienteCache: QdrantClient | null = null;

function cliente(): QdrantClient {
  clienteCache ??= new QdrantClient(
    env.QDRANT_API_KEY.length > 0
      ? { url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY }
      : { url: env.QDRANT_URL },
  );

  return clienteCache;
}

/**
 * Garante que a coleção existe com o tamanho de vetor deste provider.
 *
 * Se já existir com outro tamanho, falha em vez de recriar: apagar o índice do
 * acervo em silêncio, no meio de uma troca de provider, é pior do que parar.
 * Reindexar de propósito é `pnpm indexar:embeddings -- --recriar`.
 *
 * @throws {IndiceIncompativelError} quando o tamanho do vetor não bate.
 */
export async function garantirColecao(dimensoes: number, recriar = false): Promise<void> {
  const nome = env.QDRANT_COLLECTION;
  const existente = await descreverColecao(nome);

  if (existente !== null && recriar) {
    await cliente().deleteCollection(nome);
  }

  if (existente !== null && !recriar) {
    if (existente.dimensoes !== dimensoes) {
      throw new IndiceIncompativelError(
        `a coleção "${nome}" foi criada com vetores de ${String(existente.dimensoes)} dimensões ` +
          `e o provider atual gera ${String(dimensoes)}. ` +
          'Rode `pnpm indexar:embeddings -- --recriar` para reindexar o acervo do zero.',
      );
    }

    return;
  }

  try {
    await cliente().createCollection(nome, {
      vectors: { size: dimensoes, distance: 'Cosine' },
    });
  } catch (e) {
    throw new ProviderIndisponivelError('qdrant', `não foi possível criar "${nome}"`, {
      cause: e,
    });
  }
}

/** Grava (ou regrava) os vetores de um lote de filmes. */
export async function indexarFilmes(pontos: readonly PontoDeFilme[]): Promise<void> {
  if (pontos.length === 0) {
    return;
  }

  try {
    await cliente().upsert(env.QDRANT_COLLECTION, {
      wait: true,
      points: pontos.map((ponto) => ({
        id: ponto.filmeId,
        vector: [...ponto.vetor],
        payload: { ...ponto.payload },
      })),
    });
  } catch (e) {
    throw new ProviderIndisponivelError('qdrant', `falha ao indexar: ${descreverErro(e)}`, {
      cause: e,
    });
  }
}

/**
 * Busca por proximidade de significado e devolve só os ids.
 *
 * Os metadados curatoriais vêm do Postgres depois, não do payload: o banco é a
 * fonte da verdade, e um payload defasado faria a IA justificar uma indicação
 * com o estudo errado.
 */
export async function buscarPorVetor(
  vetor: readonly number[],
  limite: number,
  filtro?: FiltroDeBusca,
): Promise<readonly CandidatoDaBusca[]> {
  const condicoes = montarCondicoes(filtro);

  try {
    const resposta = await cliente().query(env.QDRANT_COLLECTION, {
      query: [...vetor],
      limit: limite,
      with_payload: false,
      ...(condicoes.length > 0 ? { filter: { must: condicoes } } : {}),
    });


    return resposta.points.map((ponto) => ({
      filmeId: String(ponto.id),
      proximidade: ponto.score,
    }));
  } catch (e) {
    throw new ProviderIndisponivelError('qdrant', `falha na busca: ${descreverErro(e)}`, {
      cause: e,
    });
  }
}

/**
 * Tamanho do vetor da coleção, ou `null` se ela não existe.
 *
 * O campo `vectors` da resposta pode ser um único conjunto de parâmetros ou um
 * mapa de vetores nomeados. Esta coleção usa o formato simples; em vez de
 * depender da forma exata do tipo do cliente, a leitura é defensiva.
 */
async function descreverColecao(nome: string): Promise<{ dimensoes: number } | null> {
  try {
    const info = await cliente().getCollection(nome);
    const vetores: unknown = info.config.params.vectors;

    if (typeof vetores !== 'object' || vetores === null) {
      return null;
    }

    const tamanho: unknown = Reflect.get(vetores, 'size');

    return typeof tamanho === 'number' ? { dimensoes: tamanho } : null;
  } catch {
    // O cliente lança quando a coleção não existe; ausência não é erro aqui.
    return null;
  }
}

function montarCondicoes(filtro?: FiltroDeBusca) {
  if (filtro === undefined) {
    return [];
  }

  const candidatas = [
    filtro.categoriaAcervo !== undefined
      ? { key: 'categoria_acervo', match: { value: filtro.categoriaAcervo } }
      : null,
    filtro.registroComercial !== undefined
      ? { key: 'registro_comercial', match: { value: filtro.registroComercial } }
      : null,
    filtro.anoMinimo !== undefined || filtro.anoMaximo !== undefined
      ? {
          key: 'ano',
          range: {
            ...(filtro.anoMinimo !== undefined ? { gte: filtro.anoMinimo } : {}),
            ...(filtro.anoMaximo !== undefined ? { lte: filtro.anoMaximo } : {}),
          },
        }
      : null,
  ];

  return candidatas.filter((condicao) => condicao !== null);
}
