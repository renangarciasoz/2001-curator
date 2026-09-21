import 'server-only';

import { z } from 'zod';

import { FilmeNaoEncontradoError } from '@/lib/app-error.util';

import { db } from '../db.service';

import type { ConexaoParaOIndicador } from '@/lib/filme.type';

const LIMITE_PADRAO = 20;

export const BuscarConexoesInputSchema = z.object({
  filme_id: z.uuid().describe('Filme de origem da ponte.'),
  tipo: z
    .enum([
      'PORTA_DE_ENTRADA',
      'SE_GOSTOU_DE',
      'ANTES_DE_VER',
      'LANCAMENTO_PARA_ACERVO',
      'ACERVO_PARA_LANCAMENTO',
      'OUTRO',
    ])
    .optional()
    .describe('Restringe a um tipo de ponte.'),
});

export type BuscarConexoesInput = z.infer<typeof BuscarConexoesInputSchema>;

/**
 * As pontes que as curadoras estabeleceram a partir de um filme, cada uma com o
 * seu porquê.
 *
 * É esta tool que materializa "construir pontes, não entregar títulos soltos":
 * sem ela o Indicador recomenda por semelhança estatística, que é exatamente o
 * que o Método recusa.
 *
 * @throws {FilmeNaoEncontradoError} quando o filme de origem não existe.
 */
export async function buscarConexoes(
  input: BuscarConexoesInput,
): Promise<readonly ConexaoParaOIndicador[]> {
  const origem = await db.filme.findUnique({
    where: { id: input.filme_id },
    select: { id: true },
  });

  if (origem === null) {
    throw new FilmeNaoEncontradoError(input.filme_id);
  }

  const conexoes = await db.conexao.findMany({
    where: {
      filmeOrigemId: input.filme_id,
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
    },
    select: {
      id: true,
      tipo: true,
      pontePor: true,
      porque: true,
      curador: true,
      filmeDestino: { select: { id: true, titulo: true, ano: true, diretor: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: LIMITE_PADRAO,
  });

  return conexoes.map((conexao) => ({
    conexao_id: conexao.id,
    tipo: conexao.tipo,
    ponte_por: conexao.pontePor,
    porque: conexao.porque,
    curador: conexao.curador,
    filme_destino: {
      filme_id: conexao.filmeDestino.id,
      titulo: conexao.filmeDestino.titulo,
      ano: conexao.filmeDestino.ano,
      diretor: conexao.filmeDestino.diretor,
    },
  }));
}
