import 'server-only';

import { z } from 'zod';

import { db } from '../db.service';
import { obterProviderDeEmbeddings } from '../embeddings/embeddings.service';
import { CAMPOS_PARA_O_INDICADOR, projetarFilme } from '../projecao-de-filme.util';
import { buscarPorVetor } from '../qdrant.service';

import type { CandidatoParaOIndicador } from '@/lib/filme.type';
import type { FiltroDeBusca } from '../qdrant.service';

const LIMITE_PADRAO = 12;
const LIMITE_MAXIMO = 20;

export const BuscarFilmesInputSchema = z.object({
  criterio: z
    .string()
    .min(3)
    .describe('O que se procura, em linguagem natural: tom, tema, o que a pessoa precisa sentir.'),
  limite: z.number().int().min(1).max(LIMITE_MAXIMO).optional(),
  registro_comercial: z.enum(['COMERCIAL', 'CABECA', 'AMBOS']).optional(),
  categoria_acervo: z.string().optional(),
  ano_minimo: z.number().int().optional(),
  ano_maximo: z.number().int().optional(),
});

export type BuscarFilmesInput = z.infer<typeof BuscarFilmesInputSchema>;

/**
 * Busca no acervo por proximidade de significado, não por palavra-chave.
 *
 * O critério vira vetor pelo mesmo provider que indexou o acervo, e o Qdrant
 * devolve os vizinhos. Os metadados vêm do Postgres num segundo passo, para que
 * o Indicador justifique a indicação com o estudo atual das curadoras.
 */
export async function buscarFilmes(
  input: BuscarFilmesInput,
  signal?: AbortSignal,
): Promise<readonly CandidatoParaOIndicador[]> {
  const provider = obterProviderDeEmbeddings();
  const [vetor] = await provider.gerar([input.criterio], 'consulta', signal);

  if (vetor === undefined) {
    return [];
  }

  const candidatos = await buscarPorVetor(vetor, input.limite ?? LIMITE_PADRAO, montarFiltro(input));

  if (candidatos.length === 0) {
    return [];
  }

  const filmes = await db.filme.findMany({
    where: { id: { in: candidatos.map((candidato) => candidato.filmeId) } },
    select: CAMPOS_PARA_O_INDICADOR,
  });

  const porId = new Map(filmes.map((filme) => [filme.id, filme]));

  // A ordem é a do Qdrant: é ela que carrega a proximidade semântica.
  return candidatos.flatMap((candidato) => {
    const filme = porId.get(candidato.filmeId);

    if (filme === undefined) {
      // O ponto sobreviveu a um filme apagado do banco. Ignorar é o certo aqui.
      return [];
    }

    return [{ ...projetarFilme(filme), proximidade: candidato.proximidade }];
  });
}

function montarFiltro(input: BuscarFilmesInput): FiltroDeBusca | undefined {
  const filtro: FiltroDeBusca = {
    ...(input.categoria_acervo !== undefined ? { categoriaAcervo: input.categoria_acervo } : {}),
    ...(input.registro_comercial !== undefined
      ? { registroComercial: input.registro_comercial }
      : {}),
    ...(input.ano_minimo !== undefined ? { anoMinimo: input.ano_minimo } : {}),
    ...(input.ano_maximo !== undefined ? { anoMaximo: input.ano_maximo } : {}),
  };

  return Object.keys(filtro).length > 0 ? filtro : undefined;
}
