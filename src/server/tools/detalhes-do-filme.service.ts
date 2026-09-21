import 'server-only';

import { z } from 'zod';

import { FilmeNaoEncontradoError } from '@/lib/app-error.util';

import { db } from '../db.service';
import { CAMPOS_PARA_O_INDICADOR, projetarFilme } from '../projecao-de-filme.util';

import type { FilmeParaOIndicador } from '@/lib/filme.type';

export const DetalhesDoFilmeInputSchema = z.object({
  filme_id: z.uuid().describe('O identificador devolvido por buscar_filmes.'),
});

export type DetalhesDoFilmeInput = z.infer<typeof DetalhesDoFilmeInputSchema>;

/**
 * Ficha completa de um filme: a camada factual e o estudo das curadoras.
 *
 * @throws {FilmeNaoEncontradoError} quando o id não existe no acervo.
 */
export async function detalhesDoFilme(
  input: DetalhesDoFilmeInput,
): Promise<FilmeParaOIndicador> {
  const filme = await db.filme.findUnique({
    where: { id: input.filme_id },
    select: CAMPOS_PARA_O_INDICADOR,
  });

  if (filme === null) {
    throw new FilmeNaoEncontradoError(input.filme_id);
  }

  return projetarFilme(filme);
}
