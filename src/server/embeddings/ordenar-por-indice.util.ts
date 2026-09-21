import 'server-only';

import { ProviderIndisponivelError } from '@/lib/app-error.util';

/**
 * Reordena os vetores de uma resposta de embeddings pela posição do texto de entrada.
 *
 * As APIs não garantem a ordem do array, só o campo `index`. Confiar na ordem
 * associaria, em silêncio, o vetor de um filme ao id de outro — um erro que não
 * aparece em teste e envenena toda busca subsequente.
 *
 * @throws {ProviderIndisponivelError} se faltar o vetor de alguma posição.
 */
export function ordenarPorIndice(
  itens: readonly { index: number; embedding: number[] }[],
  esperados: number,
  provider: string,
): readonly (readonly number[])[] {
  const porIndice = new Map(itens.map((item) => [item.index, item.embedding]));

  return Array.from({ length: esperados }, (_, posicao) => {
    const vetor = porIndice.get(posicao);

    if (vetor === undefined) {
      throw new ProviderIndisponivelError(
        provider,
        `resposta sem o vetor de índice ${String(posicao)}`,
      );
    }

    return vetor;
  });
}
