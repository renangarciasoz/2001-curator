import 'server-only';

import { db } from './db.service';
import { obterProviderDeEmbeddings } from './embeddings/embeddings.service';
import { garantirColecao, indexarFilmes } from './qdrant.service';

import type { PontoDeFilme } from './qdrant.service';

const TAMANHO_DO_LOTE = 32;

/** Os campos de que o índice precisa — nada além disso sai do banco. */
const CAMPOS_INDEXAVEIS = {
  id: true,
  titulo: true,
  tituloOriginal: true,
  ano: true,
  diretor: true,
  pais: true,
  sinopseFactual: true,
  tomEmocional: true,
  oQueProvoca: true,
  registroComercial: true,
  notasCuratoriais: true,
  contextoHistorico: true,
  categoriaAcervo: true,
} as const;

type FilmeIndexavel = {
  id: string;
  titulo: string;
  tituloOriginal: string | null;
  ano: number | null;
  diretor: string | null;
  pais: string | null;
  sinopseFactual: string | null;
  tomEmocional: string | null;
  oQueProvoca: string | null;
  registroComercial: string | null;
  notasCuratoriais: string | null;
  contextoHistorico: string | null;
  categoriaAcervo: string | null;
};

export type ResultadoDaIndexacao = {
  provider: string;
  modelo: string;
  dimensoes: number;
  indexados: number;
};

/**
 * Monta o texto que representa um filme na busca por significado.
 *
 * A camada curatorial vem primeiro e com rótulos explícitos: é ela que carrega
 * tom, provocação e contexto, e é por ela que o Método busca. A ficha factual
 * entra depois, como âncora de identidade (título, direção, época).
 *
 * Este texto alimenta o índice de consulta, não o dataset da Fase 2 — por isso
 * pode misturar os dois baldes. O exportador nunca passa por aqui.
 */
export function textoParaEmbedding(filme: FilmeIndexavel): string {
  const linhas = [
    `Título: ${filme.titulo}`,
    filme.tituloOriginal !== null ? `Título original: ${filme.tituloOriginal}` : null,
    filme.diretor !== null ? `Direção: ${filme.diretor}` : null,
    filme.ano !== null ? `Ano: ${String(filme.ano)}` : null,
    filme.pais !== null ? `País: ${filme.pais}` : null,
    filme.tomEmocional !== null ? `Tom emocional: ${filme.tomEmocional}` : null,
    filme.oQueProvoca !== null ? `O que provoca no espectador: ${filme.oQueProvoca}` : null,
    filme.registroComercial !== null ? `Registro: ${filme.registroComercial}` : null,
    filme.categoriaAcervo !== null ? `Categoria do acervo: ${filme.categoriaAcervo}` : null,
    filme.contextoHistorico !== null ? `Contexto histórico: ${filme.contextoHistorico}` : null,
    filme.notasCuratoriais !== null ? `Notas de curadoria: ${filme.notasCuratoriais}` : null,
    filme.sinopseFactual !== null ? `Sinopse: ${filme.sinopseFactual}` : null,
  ];

  return linhas.filter((linha) => linha !== null).join('\n');
}

/**
 * Gera e grava os vetores do acervo no Qdrant.
 *
 * Por padrão indexa só o que está pendente (`indexado_em` nulo), que é o estado
 * em que a ingestão e as edições de curadoria deixam um filme.
 */
export async function indexarAcervo(
  opcoes: { readonly recriar?: boolean; readonly tudo?: boolean } = {},
): Promise<ResultadoDaIndexacao> {
  const provider = obterProviderDeEmbeddings();

  await garantirColecao(provider.dimensoes, opcoes.recriar ?? false);

  const reindexarTudo = (opcoes.tudo ?? false) || (opcoes.recriar ?? false);

  const filmes = await db.filme.findMany({
    where: reindexarTudo ? {} : { indexadoEm: null },
    select: CAMPOS_INDEXAVEIS,
    orderBy: { createdAt: 'asc' },
  });

  let indexados = 0;

  // Sequencial de propósito: as APIs de embeddings limitam taxa, e um lote que
  // falha no meio deve parar sem deixar metade do acervo marcada como indexada.
  for (let inicio = 0; inicio < filmes.length; inicio += TAMANHO_DO_LOTE) {
    const lote = filmes.slice(inicio, inicio + TAMANHO_DO_LOTE);

    indexados += await indexarLote(lote, provider);
  }

  return {
    provider: provider.nome,
    modelo: provider.modelo,
    dimensoes: provider.dimensoes,
    indexados,
  };
}

async function indexarLote(
  lote: readonly FilmeIndexavel[],
  provider: ReturnType<typeof obterProviderDeEmbeddings>,
): Promise<number> {
  const vetores = await provider.gerar(lote.map(textoParaEmbedding), 'documento');

  const pontos: PontoDeFilme[] = lote.map((filme, posicao) => {
    const vetor = vetores[posicao];

    if (vetor === undefined) {
      throw new Error(`provider ${provider.nome} não devolveu vetor para "${filme.titulo}"`);
    }

    return {
      filmeId: filme.id,
      vetor,
      payload: {
        titulo: filme.titulo,
        ano: filme.ano,
        categoria_acervo: filme.categoriaAcervo,
        registro_comercial: filme.registroComercial,
        tom_emocional: filme.tomEmocional,
        provider: provider.nome,
        modelo: provider.modelo,
      },
    };
  });

  await indexarFilmes(pontos);

  await db.filme.updateMany({
    where: { id: { in: lote.map((filme) => filme.id) } },
    data: { indexadoEm: new Date() },
  });

  return pontos.length;
}
