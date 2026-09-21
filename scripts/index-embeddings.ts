/**
 * Gera os embeddings do acervo e indexa no Qdrant.
 *
 *   pnpm indexar:embeddings              # só o que está pendente
 *   pnpm indexar:embeddings -- --tudo    # reindexa todo o acervo
 *   pnpm indexar:embeddings -- --recriar # apaga a coleção e reindexa do zero
 *
 * `--recriar` é o caminho para trocar de provider de embeddings: vetores de
 * providers diferentes não se comparam, então o índice inteiro precisa ser refeito.
 */
import { parseArgs } from 'node:util';

import { descreverErro } from '../src/lib/app-error.util';
import { db } from '../src/server/db.service';
import { indexarAcervo } from '../src/server/indexacao.service';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tudo: { type: 'boolean', default: false },
      recriar: { type: 'boolean', default: false },
    },
  });

  const resultado = await indexarAcervo({ tudo: values.tudo, recriar: values.recriar });

  console.log(
    `Provider ${resultado.provider} (${resultado.modelo}, ` +
      `${String(resultado.dimensoes)} dimensões): ` +
      `${String(resultado.indexados)} filmes indexados.`,
  );

  if (resultado.provider === 'local' && resultado.indexados > 0) {
    console.warn(
      '\nAviso: o provider `local` aproxima sobreposição de palavras, não significado.\n' +
        'Para o acervo real, configure VOYAGE_API_KEY e rode com --recriar.',
    );
  }
}

try {
  await main();
} catch (e) {
  console.error(`Indexação falhou: ${descreverErro(e)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
