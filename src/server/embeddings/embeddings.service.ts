import 'server-only';

import { env } from '../env.config';

import { criarProviderLocal } from './local.service';
import { criarProviderOpenai } from './openai.service';
import { criarProviderVoyage } from './voyage.service';

/**
 * Um texto indexado é um documento; um pedido de busca é uma consulta. Vários
 * providers pedem essa distinção e retornam vetores melhores quando ela é dada.
 */
export type TipoDeTexto = 'documento' | 'consulta';

export type ProviderDeEmbeddings = {
  /** Identificador curto do provider, guardado junto do vetor para rastrear origem. */
  readonly nome: string;
  readonly modelo: string;
  readonly dimensoes: number;
  gerar(
    textos: readonly string[],
    tipo: TipoDeTexto,
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]>;
};

/**
 * Escolhe o provider de embeddings declarado em `EMBEDDINGS_PROVIDER`.
 *
 * O provider `local` não faz rede e serve só para o projeto rodar sem chave —
 * a qualidade da busca semântica é muito inferior à de um modelo de verdade.
 */
export function obterProviderDeEmbeddings(): ProviderDeEmbeddings {
  switch (env.EMBEDDINGS_PROVIDER) {
    case 'voyage':
      return criarProviderVoyage();
    case 'openai':
      return criarProviderOpenai();
    case 'local':
      return criarProviderLocal();
    default: {
      const _exaustivo: never = env.EMBEDDINGS_PROVIDER;
      throw new Error(`provider de embeddings não tratado: ${_exaustivo as string}`);
    }
  }
}
